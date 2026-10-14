import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { createSite, conditions } from "../demo/site.mjs";
import { makeData, practiceSlip, ptSlab } from "../demo/data.mjs";

/* ---------------------------------------------------------------------------
   The practice site (client/demo): a pretend ERPNext with dummy data, for
   trying the dashboard without the real site. What is pinned here is what
   would make it lie — a list that ignores a filter, a slip whose lines do not
   add up — and that nothing in the app itself can ever reach it.
   --------------------------------------------------------------------------- */

const TODAY = new Date(2026, 9, 9);
const seed = (o = {}) => makeData({ today: TODAY, month: "", ...o });
const A = "Manna Rubber Products Pvt Ltd (Demo)";

function signedIn(s = seed()) {
	const site = createSite(s, { now: () => TODAY });
	const r = site.handle({ method: "POST", path: "/api/method/login", body: { usr: "hr", pwd: "x" } });
	const sid = /demo_sid=([^;]+)/.exec(r.headers["Set-Cookie"][0])[1];
	const call = (method, p, { query, body } = {}) => site.handle({ method, path: p, query, body, cookies: { demo_sid: sid } });
	return { site, call };
}
const list = (call, dt, query) => call("GET", `/api/resource/${dt}`, {
	query: Object.fromEntries(Object.entries(query).map(([k, v]) => [k, typeof v === "string" || typeof v === "number" ? v : JSON.stringify(v)])),
}).body.data;

describe("signing in to the practice site", () => {
	it("refuses Guest with a 403, as Frappe does, so the dashboard shows its sign-in screen", () => {
		const site = createSite(seed());
		expect(site.handle({ method: "GET", path: "/api/method/frappe.auth.get_logged_user" }).status).toBe(403);
		expect(site.handle({ method: "GET", path: "/api/resource/Employee" }).status).toBe(403);
	});

	it("takes any name and password, under its own cookie so a real session is never overwritten", () => {
		const { call, site } = signedIn();
		expect(call("GET", "/api/method/frappe.auth.get_logged_user").body.message).toBe("hr");
		const bare = site.handle({ method: "POST", path: "/api/method/login", body: { usr: "", pwd: "" } });
		expect(bare.status).toBe(401);
	});

	it("hands out a CSRF token on the desk page in the shape fetchCsrf reads", () => {
		const { call } = signedIn();
		expect(/csrf_token"?\s*[:=]\s*"([^"]+)"/.exec(call("GET", "/app").body)[1]).toBe("practice-csrf");
	});
});

describe("lists", () => {
	it("honour fields, filters, ordering and paging the way listAll sends them", () => {
		const { call } = signedIn();
		const all = list(call, "Employee", { fields: ["name", "employee_number"], filters: [["company", "=", A]], order_by: "employee_number asc", limit_page_length: 0 });
		expect(all.map((e) => e.employee_number)).toEqual([...all.map((e) => e.employee_number)].sort());
		expect(all.length).toBe(10);
		const page = list(call, "Employee", { fields: ["name"], filters: [["company", "=", A]], limit_start: 8, limit_page_length: 5 });
		expect(page.length).toBe(2);
		expect(list(call, "Employee", { fields: ["name"], filters: [["employee_number", "in", ["DEMO-001", "DEMO-002"]]], limit_page_length: 0 }).length).toBe(2);
		expect(list(call, "Employee", { fields: ["name"], filters: [["employee_name", "like", "%nair%"]], limit_page_length: 0 }).length).toBe(1);
		expect(list(call, "Employee", { fields: ["name"], filters: [["relieving_date", "is", "set"]], limit_page_length: 0 }).length).toBe(1);
		expect(list(call, "Attendance", { fields: ["name"], filters: [["attendance_date", "between", ["2026-09-01", "2026-09-07"]], ["employee", "=", "HR-EMP-D0001"]], limit_page_length: 0 }).length).toBe(6);
	});

	it("read a child table only with its parent named, carrying parent and parentfield", () => {
		const { call } = signedIn();
		const lines = list(call, "Salary Detail", { parent: "Salary Slip", fields: ["parent", "parentfield", "salary_component", "amount"], limit_page_length: 0 });
		expect(lines.length).toBeGreaterThan(20);
		expect(lines.every((l) => l.parent && /earnings|deductions/.test(l.parentfield))).toBe(true);
	});

	it("accept every filter form Frappe does", () => {
		expect(conditions({ a: 1, b: [">", 2] })).toEqual([["a", "=", 1], ["b", ">", 2]]);
		expect(conditions([["Employee", "company", "=", "X"]])).toEqual([["company", "=", "X"]]);
	});
});

describe("writes", () => {
	it("are kept until the practice site restarts, and a submitted document will not be deleted", () => {
		const { call } = signedIn();
		const made = call("POST", "/api/resource/Additional Salary", { body: { employee: "HR-EMP-D0001", salary_component: "Salary Advance", amount: 500 } }).body.data;
		expect(made.docstatus).toBe(0);
		expect(call("PUT", `/api/resource/Additional Salary/${made.name}`, { body: { amount: 600 } }).body.data.amount).toBe(600);
		const saved = call("POST", "/api/method/frappe.desk.form.save.savedocs", { body: { doc: JSON.stringify(call("GET", `/api/resource/Additional Salary/${made.name}`).body.data), action: "Submit" } });
		expect(saved.body.docs[0].docstatus).toBe(1);
		expect(call("DELETE", `/api/resource/Additional Salary/${made.name}`).status).toBe(417);
		expect(createSite(seed()).handle({ method: "GET", path: `/api/resource/Additional Salary/${made.name}` }).status).toBe(403);
	});

	it("refuse to start a payroll run, in a sentence that says where a finished month is", () => {
		const { call } = signedIn();
		const r = call("POST", "/api/resource/Payroll Entry", { body: { company: A } });
		expect(r.status).toBe(417);
		expect(JSON.parse(JSON.parse(r.body._server_messages)[0]).message).toMatch(/cannot run payroll.*September 2026/);
	});
});

describe("the dummy data", () => {
	const s = seed();
	const docs = s.docs;

	it("is last month's by the clock it runs on", () => {
		expect(s.meta.month).toBe("2026-09");
		expect(s.meta.slipsCompany).toBe(A);
	});

	it("has no payroll run at all with DEMO_SLIPS off", () => {
		const off = seed({ slips: false });
		expect(off.docs["Salary Slip"]).toBeUndefined();
		expect(off.docs["Payroll Entry"]).toBeUndefined();
	});

	it("gives every slip lines that add to its gross and deductions, and net = gross − deductions", () => {
		for (const slip of docs["Salary Slip"]) {
			const sum = (rows) => Math.round(rows.reduce((t, l) => t + l.amount, 0) * 100) / 100;
			expect(sum(slip.earnings)).toBe(slip.gross_pay);
			expect(sum(slip.deductions)).toBe(slip.total_deduction);
			expect(slip.net_pay).toBeCloseTo(slip.gross_pay - slip.total_deduction, 2);
		}
	});

	it("gives every employee a submitted salary structure assignment", () => {
		const have = new Set(docs["Salary Structure Assignment"].filter((a) => a.docstatus === 1).map((a) => a.employee));
		expect(docs.Employee.every((e) => have.has(e.name))).toBe(true);
	});

	it("marks no attendance on a Sunday or a holiday, as hrms's shift job does not here", () => {
		const off = new Set(docs["Holiday List"][0].holidays.map((h) => h.holiday_date));
		expect(docs.Attendance.some((a) => off.has(a.attendance_date))).toBe(false);
	});

	it("keeps the leaver off last month and the joiner off the days before joining", () => {
		const leaver = docs.Employee.find((e) => e.status === "Left");
		expect(docs.Attendance.some((a) => a.employee === leaver.name && a.attendance_date >= "2026-09-01")).toBe(false);
		const joiner = docs.Employee.find((e) => e.date_of_joining.startsWith("2026-09"));
		expect(docs.Attendance.some((a) => a.employee === joiner.name && a.attendance_date < joiner.date_of_joining)).toBe(false);
	});

	it("caps the PF wage at 25,000 and puts 125,000 a half-year in the top Professional Tax slab", () => {
		const big = practiceSlip({ kind: "Salary", base: 60000, pf: true }, { D: 30, AL: 25, AM: 4, AN: 1, AP: 0, AQ: 0, ot: 0, h: 8 });
		expect(big.deductions.find((l) => l.salary_component === "Provident Fund").amount).toBe(3000);
		expect(ptSlab(125000)).toBe(1250);
		expect(ptSlab(124998)).toBe(1000);
	});
});

describe("the app itself", () => {
	it("never imports the practice site, so it cannot ship in a build", () => {
		const src = path.resolve(__dirname, "../src");
		const files = [];
		const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) (f.isDirectory() ? walk : (x) => files.push(x))(path.join(d, f.name)); };
		walk(src);
		const offenders = files.filter((f) => /\.(m?js|jsx)$/.test(f) && /from\s+["'][^"']*\/demo\/|import\(["'][^"']*\/demo\//.test(fs.readFileSync(f, "utf8")));
		expect(offenders).toEqual([]);
	});

	it("leaves the practice site no way to reach anything else", () => {
		const dir = path.resolve(__dirname, "../demo");
		for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".mjs") && x !== "run.mjs")) {
			const text = fs.readFileSync(path.join(dir, f), "utf8");
			expect(/\bfetch\(|https?\.request|axios|frappe\.cloud/.test(text.replace(/\/\*[\s\S]*?\*\//g, ""))).toBe(false);
		}
	});
});
