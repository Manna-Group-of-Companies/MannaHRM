import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";

import Documents from "@/features/documents/Documents";
import News from "@/features/news/News";
import TopBar, { firstName, ownCode } from "@/layout/TopBar";
import { HEADER_LINKS, NEAREST, headerLinks } from "@/data/nav";
import { MODULES } from "@/routes/registry";
import { ATTACHMENTS, uploadTo } from "@/api/documents";
import { bodyHtml, bodyText } from "@/api/news";
import { http } from "@/api/client";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   The HRDashboard reference's two top-bar pages (21 October 2026), Documents
   and News, and the header that reaches them.

   What these hold the pages to is what makes them safe rather than what makes
   them pretty: record attachments stay out of Documents, an upload is private,
   a post's body is text and never markup, and the account button names the
   person signed in — not the reference's sample person.
   --------------------------------------------------------------------------- */

const HR = "hr@mannarubber.com";
const draw = (ui) => render(<Provider store={store}>{ui}</Provider>);

/** Answers a GET by doctype and by what its filters ask. */
function siteHolds(tables) {
	http.get.mockImplementation((url, opts) => {
		const doctype = decodeURIComponent(String(url).split("/api/resource/")[1] || "");
		const filters = JSON.parse(opts?.params?.filters || "[]");
		const rows = (tables[doctype] || []).filter((r) => filters.every(([f, op, v]) => (
			op === "in" ? v.includes(r[f]) : String(r[f] ?? "") === String(v))));
		return Promise.resolve({ data: { data: rows }, status: 200, headers: {} });
	});
}

const FOLDERS = [
	{ name: "Home/Policies", file_name: "Policies", folder: "Home", is_folder: 1 },
	{ name: ATTACHMENTS, file_name: "Attachments", folder: "Home", is_folder: 1 },
];
const FILES = [
	{ name: "f1", file_name: "Leave policy.pdf", folder: "Home/Policies", is_folder: 0, file_size: 2048, file_url: "/private/files/a.pdf", owner: HR, modified: "2026-10-01 10:00:00" },
	{ name: "f2", file_name: "passport.jpg", folder: ATTACHMENTS, is_folder: 0, file_size: 9999, file_url: "/private/files/p.jpg", owner: HR, modified: "2026-10-02 10:00:00" },
];

beforeEach(() => {
	resetStore();
	http.get.mockReset();
	http.post.mockReset();
	http.post.mockImplementation(() => Promise.resolve({ data: { message: {}, data: { name: "NEW-1" } }, status: 200 }));
});
afterEach(() => vi.restoreAllMocks());

describe("Documents", () => {
	it("draws the site's folders and leaves record attachments out", async () => {
		siteHolds({ File: [...FOLDERS, ...FILES] });
		set({ user: HR, admin: true, section: "documents", subtab: "overview" });
		const { container } = draw(<Documents />);
		await waitFor(() => expect(container.querySelector(".k-folder h3")).not.toBeNull());
		const names = [...container.querySelectorAll(".k-folder h3")].map((h) => h.textContent);
		expect(names).toEqual(["Policies"]);
		expect(container.textContent).not.toContain("Attachments");
		const files = [...container.querySelectorAll(".k-mini")].find((m) => m.textContent.includes("Files"));
		expect(files.querySelector("b").textContent).toBe("1");
	});

	it("opens a folder onto its own files", async () => {
		siteHolds({ File: [...FOLDERS, ...FILES] });
		set({ user: HR, admin: true, section: "documents", subtab: "overview" });
		const { container } = draw(<Documents />);
		await waitFor(() => expect(container.querySelector(".k-folder button h3")).not.toBeNull());
		act(() => { container.querySelector(".k-folder button h3").click(); });
		expect(getState().docFolder).toBe("Home/Policies");
		expect(getState().subtab).toBe("folder");
		await waitFor(() => expect(container.querySelector(".k-rt tbody tr")).not.toBeNull());
		expect(container.querySelectorAll(".k-rt tbody tr").length).toBe(1);
		expect(container.textContent).toContain("Leave policy.pdf");
		expect(container.textContent).not.toContain("passport.jpg");
	});

	it("says a folder with nothing in it is empty", async () => {
		siteHolds({ File: [{ name: "Home/Empty", file_name: "Empty", folder: "Home", is_folder: 1 }] });
		set({ user: HR, admin: true, section: "documents", subtab: "folder", docFolder: "Home/Empty" });
		const { container } = draw(<Documents />);
		await waitFor(() => expect(container.textContent).toContain("This folder is empty"));
	});

	it("makes a new folder under Home through the site's own method", async () => {
		siteHolds({ File: [] });
		set({ user: HR, admin: true, section: "documents", subtab: "overview" });
		const { container } = draw(<Documents />);
		await waitFor(() => expect(container.querySelector(".k-sk")).toBeNull());
		act(() => { container.querySelector(".k-ph-act button").click(); });
		const box = document.querySelector("#fname");
		fireEvent.change(box, { target: { value: "Contracts" } });
		expect(box.value).toBe("Contracts");
		await act(async () => { fireEvent.submit(box.closest("form")); });
		const [url, body] = http.post.mock.calls[0];
		expect(url).toBe("/api/method/frappe.core.api.file.create_new_folder");
		expect(body).toEqual({ file_name: "Contracts", folder: "Home" });
	});

	it("refuses a folder with no name before asking the site", async () => {
		siteHolds({ File: [] });
		set({ user: HR, admin: true, section: "documents", subtab: "overview" });
		const { container } = draw(<Documents />);
		await waitFor(() => expect(container.querySelector(".k-sk")).toBeNull());
		act(() => { container.querySelector(".k-ph-act button").click(); });
		await act(async () => { fireEvent.submit(document.querySelector("#fname").closest("form")); });
		expect(document.body.textContent).toContain("Name the folder");
		expect(http.post).not.toHaveBeenCalled();
	});

	it("uploads every file as private", async () => {
		await uploadTo("Home/Policies", [new File(["x"], "a.pdf")]);
		const form = http.post.mock.calls[0][1];
		expect(http.post.mock.calls[0][0]).toBe("/api/method/upload_file");
		expect(form.get("is_private")).toBe("1");
		expect(form.get("folder")).toBe("Home/Policies");
	});
});

const POSTS = [
	{ name: "MANNA-ANN-2026-00001", kind: "Announcement", title: "Diwali holidays", published: 1, body: "<p>Office shut on the 1st.</p><p>Back on the 3rd.</p>", posted_by: "HR Team", posted_on: "2026-10-15" },
	{ name: "MANNA-ANN-2026-00002", kind: "CEO Speak", title: "A word from the MD", published: 0, body: "<p>Thank you all.</p>", posted_by: "MD", posted_on: "2026-10-10" },
];

describe("News", () => {
	it("draws each post as a card, newest first, with a draft marked", async () => {
		siteHolds({ "Manna Announcement": POSTS });
		set({ user: HR, admin: true, section: "news", subtab: "overview" });
		const { container } = draw(<News />);
		await waitFor(() => expect(container.querySelectorAll(".k-news-card").length).toBe(2));
		const cards = [...container.querySelectorAll(".k-news-card")];
		expect(cards[0].querySelector("h3").textContent).toBe("Diwali holidays");
		expect(cards[1].textContent).toContain("Draft");
		expect(cards[0].textContent).not.toContain("Draft");
	});

	it("narrows by category and by what is typed", async () => {
		siteHolds({ "Manna Announcement": POSTS });
		set({ user: HR, admin: true, section: "news", subtab: "overview" });
		const { container } = draw(<News />);
		await waitFor(() => expect(container.querySelectorAll(".k-news-card").length).toBe(2));
		act(() => { [...container.querySelectorAll('[role="tab"]')].find((b) => b.textContent === "CEO Speak").click(); });
		expect(container.querySelectorAll(".k-news-card").length).toBe(1);
		act(() => { [...container.querySelectorAll('[role="tab"]')].find((b) => b.textContent === "All").click(); });
		const box = container.querySelector('input[aria-label="Search news"]');
		fireEvent.change(box, { target: { value: "back on" } });
		expect(box.value).toBe("back on");
		expect(container.querySelectorAll(".k-news-card").length).toBe(1);
		fireEvent.change(box, { target: { value: "zzzz" } });
		expect(container.textContent).toContain("No news matches");
	});

	it("says there is no news yet on a site with none", async () => {
		siteHolds({ "Manna Announcement": [] });
		set({ user: HR, admin: true, section: "news", subtab: "overview" });
		const { container } = draw(<News />);
		await waitFor(() => expect(container.textContent).toContain("No news yet"));
		expect(container.textContent).toContain("Create news");
	});

	it("keeps Create news from a login that only reads", async () => {
		siteHolds({ "Manna Announcement": [] });
		set({ user: "someone@mannarubber.com", admin: false, section: "news", subtab: "overview" });
		const { container } = draw(<News />);
		await waitFor(() => expect(container.textContent).toContain("No news yet"));
		expect(container.textContent).not.toContain("Create news");
	});

	it("opens a post with More news beside it", async () => {
		siteHolds({ "Manna Announcement": POSTS });
		set({ user: HR, admin: true, section: "news", subtab: "overview" });
		const { container } = draw(<News />);
		await waitFor(() => expect(container.querySelectorAll(".k-news-card").length).toBe(2));
		act(() => { container.querySelector(".k-news-card").click(); });
		expect(getState().newsId).toBe("MANNA-ANN-2026-00001");
		await waitFor(() => expect(container.querySelector(".k-article h1")).not.toBeNull());
		expect([...container.querySelectorAll(".k-prose p")].map((p) => p.textContent))
			.toEqual(["Office shut on the 1st.", "Back on the 3rd."]);
		expect(container.querySelector("aside").textContent).toContain("A word from the MD");
	});

	it("shows a body as text, never as markup", () => {
		expect(bodyText('<p>Hello</p><script>alert(1)</script><img src=x onerror="alert(2)">')).not.toContain("<");
		expect(bodyHtml("a <b>bold</b> claim\n\nnext")).toBe("<p>a &lt;b&gt;bold&lt;/b&gt; claim</p><p>next</p>");
		expect(bodyText(bodyHtml("one\n\ntwo"))).toBe("one\ntwo");
	});

	it("writes a new post as a draft, in the signed-in person's name", async () => {
		siteHolds({ "Manna Announcement": [] });
		set({ user: HR, admin: true, me: { first_name: "Anu", full_name: "Anu Thomas" }, section: "news", subtab: "new" });
		const { container } = draw(<News />);
		const title = container.querySelector("#news-title");
		fireEvent.change(title, { target: { value: "Canteen menu" } });
		fireEvent.change(container.querySelector("#news-body"), { target: { value: "Fish on Fridays." } });
		expect(title.value).toBe("Canteen menu");
		await act(async () => { fireEvent.submit(title.closest("form")); });
		const [url, doc] = http.post.mock.calls[0];
		expect(url).toBe("/api/resource/Manna%20Announcement");
		expect(doc).toMatchObject({ title: "Canteen menu", kind: "Announcement", published: 0, body: "<p>Fish on Fridays.</p>", posted_by: "Anu Thomas" });
	});

	it("will not save a post with no headline or story", async () => {
		siteHolds({ "Manna Announcement": [] });
		set({ user: HR, admin: true, section: "news", subtab: "new" });
		const { container } = draw(<News />);
		await act(async () => { fireEvent.submit(container.querySelector("form")); });
		expect(container.textContent).toContain("Add a headline");
		expect(container.textContent).toContain("Write the story");
		expect(http.post).not.toHaveBeenCalled();
	});
});

describe("the header's links", () => {
	it("are Documents, News, Payslip and Report, as the reference's", () => {
		expect(HEADER_LINKS.map((l) => l.label)).toEqual(["Documents", "News", "Payslip", "Report"]);
	});

	it("each open a page that exists", () => {
		const links = headerLinks(HR, true);
		expect(links.map((l) => l.label)).toEqual(["Documents", "News", "Payslip", "Report"]);
		for (const l of links) expect(MODULES[l.section].pages[l.subtab], l.label).toBeTruthy();
	});

	it("have a nearest page that exists for every page that might not", () => {
		for (const [from, near] of Object.entries(NEAREST)) {
			expect(MODULES[near.section].pages[near.subtab], from).toBeTruthy();
		}
	});

	it("send Payslip to the signed-in person's own payslips", async () => {
		await act(async () => set({ ...loadedState(), user: HR, admin: true, section: "dashboard", subtab: "overview" }));
		const me = getState().employees[0];
		await act(async () => set({ employees: getState().employees.map((e) => (e === me ? { ...e, user_id: HR } : e)) }));
		expect(ownCode(getState().employees, HR)).toBe(me.name);
		const { container } = draw(<TopBar />);
		act(() => { [...container.querySelectorAll(".toplinks a")].find((a) => a.textContent === "Payslip").click(); });
		expect(getState().section).toBe("payroll");
		expect(getState().subtab).toBe("slips");
		expect(getState().slipFind).toBe(me.name);
	});
});

describe("the account button", () => {
	it("names the person signed in, from their User record", () => {
		set({ user: HR, me: { first_name: "Anu", full_name: "Anu Thomas", user_image: "" } });
		const { container } = draw(<TopBar />);
		expect(container.querySelector(".tbme .nm").textContent).toBe("Anu");
		expect(container.querySelector(".tbme .av").textContent).toBe("AT");
		expect(container.textContent).not.toContain("Pristia");
	});

	it("falls back to the login, never a sample name, until the site answers", () => {
		expect(firstName(HR, null)).toBe("Hr");
		set({ user: HR, me: null });
		const { container } = draw(<TopBar />);
		expect(container.querySelector(".tbme .nm").textContent).toBe("Hr");
	});

	it("draws their photograph when the site holds one", () => {
		set({ user: HR, me: { first_name: "Anu", full_name: "Anu Thomas", user_image: "/files/anu.jpg" } });
		const { container } = draw(<TopBar />);
		expect(container.querySelector(".tbme .av img").getAttribute("src")).toBe("/files/anu.jpg");
	});
});
