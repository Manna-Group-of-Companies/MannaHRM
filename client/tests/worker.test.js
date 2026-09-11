/* The Cloudflare Worker: what it forwards, where, and what it does to the
   answer on the way back. `fetch` is stubbed throughout — nothing here reaches
   the site. */

import { beforeEach, describe, expect, test, vi } from "vitest";
import worker, { forSite, forward } from "../worker/index.js";

const SITE = "https://mannarubber.m.frappe.cloud";
const HERE = "https://mannahrm.example.workers.dev";

let sent;
const answer = (init = {}) =>
	vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opts) => {
		sent = { url, ...opts };
		return new Response(init.body ?? "{}", { status: init.status ?? 200, headers: init.headers ?? [] });
	});

beforeEach(() => { sent = null; });

describe("which requests go to the site", () => {
	test("the_four_site_prefixes_are_forwarded", () => {
		for (const p of ["/api/method/login", "/app", "/app/employee", "/files/logo.png", "/private/files/slip.pdf"]) {
			expect(forSite(p), p).toBe(true);
		}
	});

	test("the_desk_is_forwarded_because_app_now_redirects_to_it", () => {
		// `/app` answers 301 → `/desk` on this site. Left to the bundle, the
		// redirect ends on index.html and the CSRF token is never found.
		for (const p of ["/desk", "/desk/employee"]) {
			expect(forSite(p), p).toBe(true);
		}
	});

	test("a_page_that_only_starts_with_the_same_letters_is_the_dashboards", () => {
		for (const p of ["/", "/apiary", "/application", "/desktop", "/filesystem", "/privateer", "/employees/salary-master"]) {
			expect(forSite(p), p).toBe(false);
		}
	});

	test("everything_else_is_answered_from_the_bundle_and_never_reaches_the_site", async () => {
		const f = answer();
		const assets = { fetch: vi.fn(async () => new Response("<html>")) };
		await worker.fetch(new Request(HERE + "/attendance/inout"), { ERP_URL: SITE, ASSETS: assets });
		expect(assets.fetch).toHaveBeenCalledOnce();
		expect(f).not.toHaveBeenCalled();
	});
});

describe("the request that leaves", () => {
	test("it_goes_to_the_site_with_the_path_and_query_intact", async () => {
		answer();
		await forward(new Request(HERE + "/api/resource/Employee?limit_page_length=0"), SITE);
		expect(sent.url).toBe(SITE + "/api/resource/Employee?limit_page_length=0");
	});

	test("a_path_cannot_steer_the_request_to_another_host", async () => {
		// Resolved against a base, a pathname of `//evil.example/x` is
		// evil.example, and the session cookie would go with it. `forSite` keeps
		// such a path from reaching `forward` today; this is so that stays true
		// if the prefix check is ever loosened.
		answer();
		await forward(new Request(HERE + "//evil.example/x", { headers: { cookie: "sid=abc" } }), SITE);
		expect(new URL(sent.url).host).toBe("mannarubber.m.frappe.cloud");
	});

	test("nothing_the_site_answers_is_cached_at_the_edge", async () => {
		answer();
		await forward(new Request(HERE + "/private/files/payslip.pdf"), SITE);
		expect(sent.cache).toBe("no-store");
	});

	test("a_redirect_is_handed_to_the_browser_not_followed_here", async () => {
		answer();
		await forward(new Request(HERE + "/api/method/logout"), SITE);
		expect(sent.redirect).toBe("manual");
	});

	test("the_origin_and_referer_are_the_sites_own", async () => {
		answer();
		await forward(new Request(HERE + "/api/method/login", {
			method: "POST",
			headers: { origin: HERE, referer: HERE + "/attendance" },
			body: "usr=a&pwd=b",
		}), SITE);
		expect(sent.headers.get("origin")).toBe(SITE);
		expect(sent.headers.get("referer")).toBe(SITE + "/");
	});

	test("the_person_is_named_by_their_own_address_not_cloudflares", async () => {
		// One address for everybody is one login lockout for everybody.
		answer();
		await forward(new Request(HERE + "/api/method/login", { headers: { "cf-connecting-ip": "203.0.113.7" } }), SITE);
		expect(sent.headers.get("x-forwarded-for")).toBe("203.0.113.7");
		expect(sent.headers.has("cf-connecting-ip")).toBe(false);
	});

	test("the_body_of_a_write_goes_with_it", async () => {
		answer();
		await forward(new Request(HERE + "/api/method/login", { method: "POST", body: "usr=a&pwd=b" }), SITE);
		expect(await new Response(sent.body).text()).toBe("usr=a&pwd=b");
	});

	test("the_session_cookie_goes_with_it", async () => {
		answer();
		await forward(new Request(HERE + "/api/resource/Employee", { headers: { cookie: "sid=abc" } }), SITE);
		expect(sent.headers.get("cookie")).toBe("sid=abc");
	});
});

describe("the answer that comes back", () => {
	test("the_session_cookie_loses_the_sites_domain_and_keeps_secure", async () => {
		answer({ headers: [
			["set-cookie", "sid=abc; Domain=mannarubber.m.frappe.cloud; Path=/; Secure; HttpOnly; SameSite=Lax"],
			["set-cookie", "user_id=it%40mannarubber.com; domain=.frappe.cloud; Path=/"],
		] });
		const res = await forward(new Request(HERE + "/api/method/login", { method: "POST", body: "x" }), SITE);
		const cookies = res.headers.getSetCookie();
		expect(cookies).toEqual([
			"sid=abc; Path=/; Secure; HttpOnly; SameSite=Lax",
			"user_id=it%40mannarubber.com; Path=/",
		]);
	});

	test("a_redirect_to_the_site_comes_back_to_this_origin", async () => {
		answer({ status: 302, body: null, headers: [["location", SITE + "/login?redirect-to=%2Fapp"]] });
		const res = await forward(new Request(HERE + "/app"), SITE);
		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/login?redirect-to=%2Fapp");
	});

	test("a_redirect_somewhere_else_is_left_alone", async () => {
		// Only the site's own address is rewritten. A host that merely starts with
		// the same letters is somebody else's.
		answer({ status: 302, body: null, headers: [["location", SITE + ".evil.example/x"]] });
		const res = await forward(new Request(HERE + "/app"), SITE);
		expect(res.headers.get("location")).toBe(SITE + ".evil.example/x");
	});

	test("the_status_and_body_are_the_sites", async () => {
		answer({ status: 417, body: '{"exc_type":"DataError"}' });
		const res = await forward(new Request(HERE + "/api/resource/Employee"), SITE);
		expect(res.status).toBe(417);
		expect(await res.text()).toBe('{"exc_type":"DataError"}');
	});
});
