import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { REQUIRED_COMPONENTS, missingComponents } from "@/lib/payrollsetup";
import { exportWhy, homeSteps } from "@/lib/payrollhome";

/* ---------------------------------------------------------------------------
   Payroll → Payroll: the four steps of a month, and what the site needs first.
   Pure — the page and its reads are in payrollhomepage.test.jsx.
   --------------------------------------------------------------------------- */

const py = fs.readFileSync(path.resolve(__dirname, "../../manna_hr/payrollsetup.py"), "utf8");

describe("the Salary Components the site needs", () => {
	it("are the three the Python tool makes, with the same type and abbreviation", () => {
		for (const c of REQUIRED_COMPONENTS) {
			expect(py).toContain(`"name": "${c.name}"`);
			expect(py).toContain(`"abbr": "${c.abbr}"`);
			const block = py.slice(py.indexOf(`"name": "${c.name}"`));
			expect(block.slice(0, 200)).toContain(`"type": "${c.type}"`);
		}
		expect(py.match(/"abbr":/g)).toHaveLength(REQUIRED_COMPONENTS.length);
	});

	it("names what the Salary Sheet tells apart, so the sheet's columns and the site's components agree", async () => {
		const { kindOf } = await import("@/lib/salarysheet");
		expect(kindOf("Leave Encashment")).toBe("encash");
		expect(kindOf("Salary Advance")).toBe("advance");
		expect(kindOf("Loan EMI")).toBe("loan");
	});

	it("are missing only where the site does not have them, and unknown when the site would not say", () => {
		expect(missingComponents(null)).toBeNull();
		expect(missingComponents(undefined)).toBeNull();
		expect(missingComponents([{ name: "Loan EMI" }]).map((c) => c.name)).toEqual(["Leave Encashment", "Salary Advance"]);
		expect(missingComponents([{ name: "Loan EMI", disabled: 1 }]).map((c) => c.name)).toContain("Loan EMI");
		expect(missingComponents(REQUIRED_COMPONENTS.map((c) => ({ name: c.name, disabled: 0 })))).toEqual([]);
	});
});

const ALL = REQUIRED_COMPONENTS.map((c) => ({ name: c.name, disabled: 0 }));
const PEOPLE = [{ name: "E1", employee_name: "Anil" }, { name: "E2", employee_name: "Beena" }];
const SSA = [{ employee: "E1", docstatus: 1, from_date: "2026-01-01" }, { employee: "E2", docstatus: 1, from_date: "2026-01-01" }];
const END = "2026-09-30";
const ok = (over = {}) => ({ state: "ok", entries: [], slips: [], assignments: SSA, details: null, err: "", ...over });
const slip = (docstatus, extra = {}) => ({ name: "S" + docstatus, docstatus, net_pay: 100, gross_pay: 120, total_deduction: 20, ...extra });
const view = (over) => homeSteps({ setup: { components: ALL }, extras: [], pay: ok(), people: PEOPLE, end: END, ...over });
const step = (v, id) => v.steps.find((s) => s.id === id);

describe("the four steps", () => {
	it("come in the order a month is paid in", () => {
		expect(view().steps.map((s) => s.id)).toEqual(["setup", "extras", "run", "review"]);
	});

	it("start at 'run the salary' when everything is set up and nothing has been run", () => {
		const v = view();
		expect(step(v, "setup").state).toBe("done");
		expect(step(v, "extras").state).toBe("done");
		expect(step(v, "run").state).toBe("todo");
		expect(v.steps[v.current].id).toBe("run");
	});

	it("say who will not be paid when somebody has no salary structure — hrms skips them silently", () => {
		const v = view({ pay: ok({ assignments: [SSA[0]] }) });
		expect(step(v, "setup").state).toBe("warn");
		expect(step(v, "setup").text).toMatch(/1 person has no salary structure/);
		expect(step(v, "setup").bare.map((e) => e.name)).toEqual(["E2"]);
		expect(v.steps[v.current].id).toBe("setup");
	});

	it("name the salary components the site lacks", () => {
		const v = view({ setup: { components: [{ name: "Loan EMI" }] } });
		expect(step(v, "setup").state).toBe("warn");
		expect(step(v, "setup").text).toContain("Leave Encashment, Salary Advance");
	});

	it("do not call the set-up done when the components could not be read", () => {
		const v = view({ setup: { components: null } });
		expect(step(v, "setup").state).toBe("unknown");
		expect(step(v, "setup").text).toMatch(/could not be checked/);
	});

	it("flag a deduction still a draft, because Frappe takes nothing from pay until it is submitted", () => {
		const v = view({ extras: [{ docstatus: 0 }, { docstatus: 1 }] });
		expect(step(v, "extras").state).toBe("warn");
		expect(step(v, "extras").drafts).toBe(1);
		expect(step(v, "extras").text).toMatch(/1 item is still a draft/);
	});

	it("count a cancelled extra as nothing", () => {
		expect(step(view({ extras: [{ docstatus: 2 }] }), "extras").state).toBe("done");
	});

	it("say 'the site would not say', not 'none', when the extras read was refused", () => {
		expect(step(view({ extras: null }), "extras").state).toBe("unknown");
		expect(step(view({ extras: undefined }), "extras").text).toMatch(/Checking/);
	});

	it("follow the run through its states", () => {
		const entry = (o) => ({ name: "PE", docstatus: 1, ...o });
		expect(step(view({ pay: ok({ entries: [entry({ docstatus: 0 })] }) }), "run").text).toMatch(/people are picked/);
		expect(step(view({ pay: ok({ entries: [entry()] }) }), "run").state).toBe("wait");
		expect(step(view({ pay: ok({ entries: [entry({ status: "Failed" })], slips: [] }) }), "run").state).toBe("warn");
		const draft = view({ pay: ok({ entries: [entry()], slips: [slip(0), slip(1)] }) });
		expect(step(draft, "run").state).toBe("warn");
		expect(step(draft, "run").text).toMatch(/1 slip is still a draft/);
		const final = view({ pay: ok({ entries: [entry()], slips: [slip(1), slip(1)] }) });
		expect(step(final, "run").state).toBe("done");
		expect(final.current).toBe(4);
		expect(final.totals.net).toBe(200);
	});

	it("say the month's read failed rather than showing a month of nothing", () => {
		const v = view({ pay: { state: "error", err: "This login may not read payroll on the site." } });
		expect(step(v, "run").state).toBe("unknown");
		expect(step(v, "run").text).toMatch(/may not read payroll/);
	});
});

describe("why an Excel button of Check it and pay is off, in words HR can act on", () => {
	const label = "September 2026";

	it("makes the wages register from the slips, and says nothing, when one company's month has slips", () => {
		const w = exportWhy({ company: "Manna Rubber", label, slips: 3, state: "ok" });
		expect(w).toMatchObject({ sheet: "", register: "", mode: "slips", line: "" });
		expect(w.hint).toMatch(/salary slips as the company's Form 25 wages register/);
	});

	it("turns the salary sheet off without slips, keeps the register on as a preview, and says why", () => {
		const w = exportWhy({ company: "Manna Rubber", label, slips: 0, state: "ok" });
		expect(w.sheet).toBe("The salary sheet needs salary slips, and there are none for September 2026 yet.");
		expect(w).toMatchObject({ register: "", mode: "preview" });
		expect(w.line).toBe("The salary sheet needs salary slips, and there are none for September 2026 yet. "
			+ "The wages register beside it works now: Excel works it out from attendance and the sheet's formulas.");
		expect(w.hint).toMatch(/not from salary slips — do not pay from it/);
	});

	it("makes every company's wages register in one file when all companies are chosen, slips or none", () => {
		const a = exportWhy({ company: "", label, slips: 3, state: "ok" });
		expect(a).toMatchObject({ sheet: "", register: "", mode: "all" });
		expect(a.line).toContain("makes every company's sheet in one file");
		expect(a.line).toContain("do not pay from those sheets");
		const b = exportWhy({ company: "", label, slips: 0, state: "ok" });
		expect(b).toMatchObject({ register: "", mode: "all" });
		expect(b.line).toMatch(/^The salary sheet needs salary slips, and there are none for September 2026 yet\. The wages register makes every company's sheet/);
	});

	it("keeps both off while the month is being read, rather than offering a preview of a month that may have slips", () => {
		for (const state of [undefined, "loading"]) {
			const w = exportWhy({ company: "Manna Rubber", label, slips: 0, state });
			expect(w.register).toBe("Reading September 2026's payroll…");
			expect(w.sheet).toBe(w.register);
			expect(w.mode).toBe("");
		}
	});

	it("says the slips could not be read, and still offers the register as a preview", () => {
		const w = exportWhy({ company: "Manna Rubber", label, slips: 0, state: "error" });
		expect(w).toMatchObject({ register: "", mode: "preview" });
		expect(w.line).toMatch(/^The salary slips could not be read, so the salary sheet cannot be made\. The wages register beside it still works, as a preview/);
	});
});
