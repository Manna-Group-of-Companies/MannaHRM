import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

/* ---------------------------------------------------------------------------
   Payroll → Frappe Payroll: the stock hrms payroll on the site, counted, and a
   way into each on the desk. It writes nothing, so what is pinned is what it
   reads and how it says an answer it did not get.
   --------------------------------------------------------------------------- */

const calls = [];
let refuse = new Set();
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	api: (path, params) => {
		calls.push([path, params]);
		if (path.endsWith("frappe.client.get_count")) {
			if (refuse.has(params.doctype)) return Promise.reject(new Error("403"));
			return Promise.resolve({ message: params.doctype === "Salary Slip" ? 12 : 3 });
		}
		if (path.includes("Payroll%20Entry")) {
			return Promise.resolve({ data: [{ name: "HR-PRUN-0001", company: "Manna Rubber",
				start_date: "2026-08-01", end_date: "2026-08-31", docstatus: 1 }] });
		}
		if (path.includes("Salary%20Slip")) {
			return Promise.resolve({ data: [{ name: "Sal Slip/0001", employee: "HR-EMP-1", employee_name: "Raghav Menon",
				start_date: "2026-08-01", end_date: "2026-08-31", gross_pay: 52000, net_pay: 47250.5, status: "Draft" }] });
		}
		return Promise.resolve({ data: [] });
	},
}));

/* The registry before the page, as the app loads them: the page imports Link,
   Link the router, the router the registry — which imports the page. Loaded
   page-first, the registry reads it before it has finished. */
import { pageFor } from "@/routes/registry";
import FrappePayroll, { periodText } from "@/features/payroll/FrappePayroll";
import PayrollRun from "@/features/payroll/PayrollRun";
import { forgetFrappePayroll, loadFrappePayroll } from "@/api/frappepayroll";
import { FRAPPE_PAYROLL_DOCTYPES, docState, hasCompany } from "@/data/frappepayroll";
import { isHidden } from "@/data/sections";
import { store, set, resetStore } from "@/store";

beforeEach(() => {
	calls.length = 0;
	refuse = new Set();
	forgetFrappePayroll();
	resetStore();
});

describe("what the page is about", () => {
	it("names each stock payroll doctype once", () => {
		expect(new Set(FRAPPE_PAYROLL_DOCTYPES).size).toBe(FRAPPE_PAYROLL_DOCTYPES.length);
		for (const dt of ["Salary Structure", "Salary Structure Assignment", "Payroll Entry", "Salary Slip", "Additional Salary"]) {
			expect(FRAPPE_PAYROLL_DOCTYPES).toContain(dt);
		}
	});

	it("filters by company only where the doctype has a company field", () => {
		expect(hasCompany("Salary Slip")).toBe(true);
		expect(hasCompany("Salary Component")).toBe(false);
		expect(hasCompany("Income Tax Slab")).toBe(false);
	});

	it("says a slip's state in words, from status where there is one", () => {
		expect(docState({ status: "Withheld", docstatus: 1 })).toBe("Withheld");
		expect(docState({ docstatus: 1 })).toBe("Submitted");
		expect(docState({ docstatus: 2 })).toBe("Cancelled");
		expect(docState({})).toBe("Draft");
	});

	it("says a whole-month period as the month, and anything else as its two dates", () => {
		expect(periodText("2026-08-01", "2026-08-31")).toBe("Aug 2026");
		expect(periodText("2026-09-01", "2026-09-30")).toBe("Sep 2026");
		expect(periodText("2026-08-01", "2026-08-15")).toBe("01-Aug-2026 – 15-Aug-2026");
	});

	it("is hidden — Payroll opens on its own page, and the page stays at payroll/frappe", () => {
		/* Hidden on 29 Sep 2026, not deleted: unhiding it is one word in
		   HIDDEN_PAGES. Its address lands on the Payroll page — paths.test.js. */
		expect(pageFor("payroll", "overview")).toBe(PayrollRun);
		expect(pageFor("payroll", "frappe")).toBe(FrappePayroll);
		expect(isHidden("payroll", "frappe")).toBe(true);
	});
});

describe("the reads", () => {
	it("narrows a count to the picked company only where the doctype can be", async () => {
		await loadFrappePayroll("Manna Rubber");
		const filtersOf = (dt) => JSON.parse(calls.find(([p, q]) => p.endsWith("get_count") && q.doctype === dt)[1].filters);
		expect(filtersOf("Salary Slip")).toEqual([["company", "=", "Manna Rubber"]]);
		expect(filtersOf("Salary Component")).toEqual([]);
	});

	it("gives null, not 0, for a count the site refuses", async () => {
		refuse = new Set(["Income Tax Slab"]);
		const d = await loadFrappePayroll("");
		expect(d.counts["Income Tax Slab"]).toBeNull();
		expect(d.counts["Salary Slip"]).toBe(12);
	});

	it("reads once per company until asked to read again", async () => {
		await loadFrappePayroll("");
		const n = calls.length;
		await loadFrappePayroll("");
		expect(calls.length).toBe(n);
		await loadFrappePayroll("", { fresh: true });
		expect(calls.length).toBe(n * 2);
	});
});

describe("the page", () => {
	const draw = async () => {
		let view;
		await act(async () => { view = render(<Provider store={store}><FrappePayroll /></Provider>); });
		return view;
	};

	it("draws a card per doctype that opens its list in Frappe, with the site's count", async () => {
		set({ site: "https://erp.example.invalid" });
		const { container } = await draw();
		const cards = [...container.querySelectorAll("a.fpcard")];
		expect(cards).toHaveLength(FRAPPE_PAYROLL_DOCTYPES.length);
		const slip = cards.find((a) => a.textContent.includes("Salary Slip"));
		expect(slip.getAttribute("href")).toBe("https://erp.example.invalid/app/salary-slip");
		expect(slip.getAttribute("target")).toBe("_blank");
		expect(slip.querySelector(".fpn").textContent).toBe("12");
	});

	it("draws a refused count as a dash and says why", async () => {
		refuse = new Set(["Payroll Period"]);
		const { container } = await draw();
		const card = [...container.querySelectorAll(".fpcard")].find((c) => c.textContent.includes("Payroll Period"));
		expect(card.querySelector(".fpn").textContent).toBe("—");
		expect(card.textContent).toContain("would not count these");
	});

	it("lists the latest run and slip, with the slip's pay and state", async () => {
		set({ site: "https://erp.example.invalid" });
		const { container } = await draw();
		expect(container.textContent).toContain("HR-PRUN-0001");
		expect(container.textContent).toContain("Raghav Menon");
		expect(container.textContent).toContain("₹52,000");
		expect(container.querySelector(".fpstate.draft").textContent).toBe("Draft");
		expect(container.querySelector(".fpstate.submitted").textContent).toBe("Submitted");
	});

	it("writes nothing", async () => {
		await draw();
		expect(calls.every(([p]) => !/\/api\/method\/(frappe\.client\.(insert|save|submit|delete|set_value))/.test(p))).toBe(true);
	});
});
