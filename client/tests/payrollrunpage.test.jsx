import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

/* ---------------------------------------------------------------------------
   Payroll → Payroll, the page the website runs payroll from. The site is
   answered here; what is pinned is what a person sees, what each button
   writes, and that nothing on the pay side is written that should not be.
   --------------------------------------------------------------------------- */

let site;
const calls = [];
const made = [];

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		listAll: (dt) => Promise.resolve(
			dt === "Payroll Entry" ? site.entries
				: dt === "Salary Slip" ? site.slips
					: dt === "Salary Structure Assignment" ? site.ssa
						: dt === "Salary Component" ? site.components
							: dt === "Additional Salary" ? site.extras
								: dt === "Employee" ? site.employees
									: dt === "Attendance" ? site.attendance
										: dt === "Shift Type" ? site.shifts
											: dt === "Employee Checkin" ? site.punches || [] : [],
		),
		/* The loan doctypes are not on the site this was written for. */
		api: (path) => (path.includes("Loan")
			? Promise.reject(Object.assign(new Error("not found"), { status: 404 }))
			: Promise.resolve({ data: path.includes("Salary Detail") ? site.details : [] })),
		getDoc: (dt) => Promise.resolve(dt === "Company" ? site.company : null),
		apiCreate: (dt, doc) => { calls.push(["create", dt, doc]); return Promise.resolve({ name: dt === "Additional Salary" ? "HR-ADD-1" : "HR-PRUN-1", ...doc }); },
		apiDocMethod: (dt, name, method) => { calls.push(["method", dt, name, method]); return Promise.resolve({ docs: [{ employees: site.picked }] }); },
		apiWrite: (dt, name, p) => { calls.push(["write", dt, name, p]); return Promise.resolve({ ok: true }); },
		apiSubmitDraft: (dt, name) => { calls.push(["submit", dt, name]); return Promise.resolve({}); },
	};
});

/* A download needs a real browser; the workbook it would have downloaded is
   built here and kept, so a test can open it. */
vi.mock("@/lib/registerxlsx", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		registerXlsx: async (rows, opts) => { made.push({ rows, opts, wb: await actual.registerWorkbook(rows, opts) }); },
		registerBookXlsx: async (parts, opts) => { made.push({ parts, opts, wb: await actual.registerBook(parts, opts) }); },
		registerDesignBookXlsx: async (parts, opts) => { made.push({ design: true, parts, opts, wb: await actual.registerBook(parts, opts) }); },
	};
});

import { pageFor } from "@/routes/registry";
import PayrollRun from "@/features/payroll/PayrollRun";
import { payKey } from "@/api/payroll";
import { periodOf } from "@/lib/payroll";
import { lastMonth } from "@/lib/payrollrun";
import { periodLabel } from "@/lib/salarysheet";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

const YM = lastMonth();
const [START, END] = periodOf(YM).iso;
const CO = { default_payroll_payable_account: "Payroll Payable - MR", cost_center: "Main - MR", default_currency: "INR" };
const ALL3 = [
	{ name: "Leave Encashment", type: "Earning", disabled: 0 },
	{ name: "Salary Advance", type: "Deduction", disabled: 0 },
	{ name: "Loan EMI", type: "Deduction", disabled: 0 },
];

beforeEach(() => {
	calls.length = 0;
	made.length = 0;
	site = {
		entries: [], slips: [], ssa: [], details: [], components: ALL3, extras: [], company: CO, picked: [],
		employees: [], attendance: [], shifts: [],
	};
	resetStore();
	act(() => set({ ...loadedState(), site: "https://erp.example.invalid", company: "Manna Rubber" }));
});

const draw = async () => {
	let view;
	await act(async () => { view = render(<Provider store={store}><PayrollRun /></Provider>); });
	await act(async () => {});
	return view;
};
const button = (v, text) => [...v.container.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const click = (el) => act(async () => { el.click(); });
const pick = (v, id, value) => act(async () => { fireEvent.change(v.container.querySelector(id), { target: { value } }); });

describe("the page", () => {
	it("is the Payroll module's page", () => {
		expect(pageFor("payroll", "overview")).toBe(PayrollRun);
	});

	it("goes down four steps in order, each one done on this page", async () => {
		const v = await draw();
		const titles = [...v.container.querySelectorAll(".panel h3")].map((h) => h.textContent);
		const want = ["Check the set-up", "Advances, loans and bonuses", "Run the salary", "Check it and pay"];
		expect(titles).toHaveLength(4);
		want.forEach((w, i) => expect(titles[i], w).toContain(w));
	});

	it("opens the first step that is not done and folds the rest", async () => {
		const v = await draw();
		/* Nobody has a salary structure, so step 1 needs somebody. */
		const shut = [...v.container.querySelectorAll(".panel")].map((p) => p.classList.contains("shut"));
		expect(shut).toEqual([false, true, true, true]);
	});

	it("re-reads when the month is changed", async () => {
		const v = await draw();
		const sel = v.container.querySelector("#prmonth");
		expect(sel.value).toBe(YM);
		await pick(v, "#prmonth", [...sel.options].map((o) => o.value).find((x) => x !== YM));
		expect(v.container.querySelector("#prmonth").value).not.toBe(YM);
	});
});

describe("step 1 — the set-up", () => {
	it("makes the missing salary components, each as hrms's own Salary Component", async () => {
		site.components = [ALL3[0]];
		const v = await draw();
		await click(button(v, "Make Salary Advance, Loan EMI"));
		const made = calls.filter((c) => c[0] === "create");
		expect(made.map((c) => c[1])).toEqual(["Salary Component", "Salary Component"]);
		expect(made.map((c) => [c[2].salary_component, c[2].type, c[2].salary_component_abbr])).toEqual(
			[["Salary Advance", "Deduction", "SADV"], ["Loan EMI", "Deduction", "LEMI"]]);
	});

	it("offers nothing to make when the components are all there", async () => {
		const v = await draw();
		expect([...v.container.querySelectorAll("button")].some((b) => /^Make /.test(b.textContent))).toBe(false);
	});

	it("says who has no salary structure and sends them to Frappe to be given one", async () => {
		const v = await draw();
		expect(v.container.textContent).toContain("no salary structure");
		const a = [...v.container.querySelectorAll("a")].find((x) => x.textContent === "Assign salary structures");
		expect(a.getAttribute("href")).toBe("https://erp.example.invalid/app/bulk-salary-structure-assignment/new");
	});
});

describe("step 2 — advances, loans and bonuses", () => {
	it("adds an advance as an Additional Salary dated the month's last day, then submits it", async () => {
		const v = await draw();
		await pick(v, "#pr-person", "HR-EMP-00001");
		await pick(v, "#pr-kind", "advance");
		await pick(v, "#pr-amt", "5000");
		await click([...v.container.querySelectorAll("button")].find((b) => b.textContent.startsWith("Add to ")));
		await act(async () => {});
		const made = calls.find((c) => c[0] === "create" && c[1] === "Additional Salary");
		expect(made[2]).toMatchObject({ employee: "HR-EMP-00001", company: "Manna Rubber", salary_component: "Salary Advance",
			amount: 5000, payroll_date: END, overwrite_salary_structure_amount: 1 });
		expect(calls.find((c) => c[0] === "submit")).toEqual(["submit", "Additional Salary", "HR-ADD-1"]);
		expect(v.container.textContent).toContain("Advance taken of ₹5,000");
	});

	it("travels a loan instalment through Loan EMI and leave encashment through Leave Encashment", async () => {
		const v = await draw();
		for (const [kind, component] of [["loan", "Loan EMI"], ["encash", "Leave Encashment"]]) {
			await pick(v, "#pr-person", "HR-EMP-00002");
			await pick(v, "#pr-kind", kind);
			await pick(v, "#pr-amt", "1200");
			await click([...v.container.querySelectorAll("button")].find((b) => b.textContent.startsWith("Add to ")));
			await act(async () => {});
			const last = calls.filter((c) => c[0] === "create" && c[1] === "Additional Salary").pop();
			expect(last[2].salary_component, kind).toBe(component);
		}
	});

	it("lets a bonus choose its component from what the site has", async () => {
		site.components = [...ALL3, { name: "Bonus", type: "Earning", disabled: 0 }];
		const v = await draw();
		await pick(v, "#pr-kind", "other");
		expect([...v.container.querySelector("#pr-comp").options].map((o) => o.value)).toContain("Bonus");
		await pick(v, "#pr-person", "HR-EMP-00001");
		await pick(v, "#pr-comp", "Bonus");
		await pick(v, "#pr-amt", "2000");
		await click([...v.container.querySelectorAll("button")].find((b) => b.textContent.startsWith("Add to ")));
		await act(async () => {});
		expect(calls.find((c) => c[0] === "create" && c[1] === "Additional Salary")[2].salary_component).toBe("Bonus");
	});

	it("will not add without a person or an amount, and says which", async () => {
		const v = await draw();
		const add = () => [...v.container.querySelectorAll("button")].find((b) => b.textContent.startsWith("Add to "));
		await click(add());
		expect(v.container.textContent).toContain("Pick the person.");
		await pick(v, "#pr-person", "HR-EMP-00001");
		await click(add());
		expect(v.container.textContent).toContain("Type the amount");
		expect(calls.some((c) => c[0] === "create")).toBe(false);
	});

	it("submits the drafts of the month only after a confirm", async () => {
		site.extras = [{ name: "HR-ADD-7", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", salary_component: "Loan EMI", amount: 800, docstatus: 0 }];
		const v = await draw();
		expect(v.container.textContent).toContain("Anand Raghavan");
		await click(button(v, "Submit 1 draft"));
		expect(calls.some((c) => c[0] === "submit")).toBe(false);
		await click(button(v, "Yes, submit 1"));
		await act(async () => {});
		expect(calls.find((c) => c[0] === "submit")).toEqual(["submit", "Additional Salary", "HR-ADD-7"]);
	});

	it("says loans are not on the site rather than inventing any", async () => {
		const v = await draw();
		expect(v.container.textContent).toContain("Loans are not on this site");
	});
});

describe("step 3 — the salary run", () => {
	it("starts the month's run: a draft Payroll Entry, and hrms picks who is on it", async () => {
		site.picked = [{ employee: "HR-EMP-00001", employee_name: "Anand", department: "P", designation: "O", name: "x1", idx: 1 }];
		const v = await draw();
		await click(button(v, "Start the salary run"));
		await act(async () => {});
		const made = calls.find((c) => c[0] === "create" && c[1] === "Payroll Entry");
		expect(made[2]).toMatchObject({ company: "Manna Rubber", start_date: START, end_date: END, payroll_frequency: "Monthly" });
		expect(calls.find((c) => c[0] === "method")).toEqual(["method", "Payroll Entry", "HR-PRUN-1", "fill_employee_details"]);
		expect(v.container.textContent).toContain("HR-PRUN-1 made");
	});

	it("starts nothing for all companies at once", async () => {
		act(() => set({ company: "" }));
		const v = await draw();
		expect(button(v, "Start the salary run").disabled).toBe(true);
		expect(v.container.textContent).toContain("Pick a company");
	});

	it("starts nothing over a month that already has its run", async () => {
		site.entries = [{ name: "HR-PRUN-1", docstatus: 0, company: "Manna Rubber", creation: "2026-09-01" }];
		const v = await draw();
		expect(button(v, "Start the salary run")).toBeUndefined();
	});

	it("makes the slips only after a confirm, by submitting the entry", async () => {
		site.entries = [{ name: "HR-PRUN-1", docstatus: 0, company: "Manna Rubber", creation: "2026-09-01", number_of_employees: 3 }];
		const v = await draw();
		await click(button(v, "Create salary slips"));
		expect(calls.some((c) => c[0] === "submit")).toBe(false);
		await click(button(v, "Yes, create 3 salary slips"));
		await act(async () => {});
		expect(calls.find((c) => c[0] === "submit")).toEqual(["submit", "Payroll Entry", "HR-PRUN-1"]);
	});

	it("leaves submitting the slips — the step that pays — to Frappe", async () => {
		site.entries = [{ name: "HR-PRUN-1", docstatus: 1, company: "Manna Rubber", creation: "2026-09-01" }];
		site.slips = [{ name: "SAL-1", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", docstatus: 0, gross_pay: 13000, total_deduction: 500, net_pay: 12500, payment_days: 30 }];
		const v = await draw();
		const a = [...v.container.querySelectorAll("a")].find((x) => x.textContent === "Submit the slips in Frappe");
		expect(a.getAttribute("href")).toBe("https://erp.example.invalid/app/payroll-entry/HR-PRUN-1");
		expect([...v.container.querySelectorAll("button")].some((b) => /submit the slips/i.test(b.textContent))).toBe(false);
	});

	it("never writes a Salary Slip", async () => {
		site.entries = [{ name: "HR-PRUN-1", docstatus: 0, company: "Manna Rubber", creation: "2026-09-01" }];
		const v = await draw();
		await click(button(v, "Create salary slips"));
		await click(button(v, "Yes, create salary slips"));
		await act(async () => {});
		expect(calls.some((c) => c.includes("Salary Slip"))).toBe(false);
	});
});

describe("step 4 — the sheet", () => {
	const slips = () => {
		site.entries = [{ name: "HR-PRUN-1", docstatus: 1, company: "Manna Rubber", creation: "2026-09-01" }];
		site.slips = [{ name: "SAL-1", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", docstatus: 1, gross_pay: 13000, total_deduction: 2500, net_pay: 10500, payment_days: 30 }];
		/* The 5-tab carries only people with a salary assigned (14 Oct 2026). */
		site.ssa = ["HR-EMP-00001", "HR-EMP-00002"].map((employee, i) => ({
			name: `SSA-${i + 1}`, employee, salary_structure: "Staff", from_date: "2026-01-01", base: 13000, company: "Manna Rubber", docstatus: 1,
		}));
		site.details = [
			{ parent: "SAL-1", parentfield: "earnings", salary_component: "Basic", amount: 12000, idx: 1 },
			{ parent: "SAL-1", parentfield: "earnings", salary_component: "Leave Encashment", amount: 1000, idx: 2 },
			{ parent: "SAL-1", parentfield: "deductions", salary_component: "Salary Advance", amount: 2000, idx: 1 },
			{ parent: "SAL-1", parentfield: "deductions", salary_component: "Loan EMI", amount: 500, idx: 2 },
		];
	};

	it("lays the slip's own figures out with leave encashment, the advance and the loan as columns", async () => {
		slips();
		const v = await draw();
		const heads = [...v.container.querySelectorAll("table[aria-label^='Salary sheet'] th")].map((h) => h.textContent);
		expect(heads.join("|")).toMatch(/Leave Encashment.*leave encashment/);
		expect(heads.join("|")).toMatch(/Salary Advance.*advance/);
		expect(heads.join("|")).toMatch(/Loan EMI.*loan EMI/);
		expect(v.container.textContent).toContain("12,000.00");
		expect(v.container.textContent).toContain("10,500.00");
	});

	it("has an Excel button that is off until there is something to put in it", async () => {
		const v = await draw();
		expect(button(v, "Download Excel").disabled).toBe(true);
	});

	/* Waits for the register to be built and the page to say so. */
	const made1 = () => act(async () => {
		await vi.waitFor(() => { if (!made.length) throw new Error("not made yet"); });
	});
	const people = () => {
		site.employees = [
			{ name: "HR-EMP-00002", employee_name: "Bindu Thomas", employee_number: "MR002", status: "Active", date_of_joining: "2020-01-01" },
			{ name: "HR-EMP-00001", employee_name: "Anand Raghavan", employee_number: "MR001", status: "Active", date_of_joining: "2019-04-01",
				custom_uan: "100000000001", custom_esic_number: "3100000001", default_shift: "General" },
		];
		site.attendance = [{ employee: "HR-EMP-00001", attendance_date: `${YM}-01`, status: "Present" }];
		site.shifts = [{ name: "General", start_time: "09:00:00", end_time: "17:30:00" }];
	};

	it("turns the salary sheet off without slips and says why on the button, but keeps the wages register on as a preview", async () => {
		const v = await draw();
		expect(button(v, "Download Excel").disabled).toBe(true);
		expect(button(v, "Wages register (Excel)").disabled).toBe(false);
		expect(button(v, "Download Excel").getAttribute("title")).toBe(`The salary sheet needs salary slips, and there are none for ${periodLabel(YM)} yet.`);
		expect(v.container.textContent).not.toContain("The wages register beside it works now");
		expect(button(v, "Wages register (Excel)").getAttribute("title")).toMatch(/preview/i);
	});

	it("makes the preview from the site's records when there are no slips, and says it is Excel's working and not to be paid from", async () => {
		people();
		const v = await draw();
		await click(button(v, "Wages register (Excel)"));
		await made1();
		await act(async () => {});
		const [{ rows, opts, wb }] = made;
		expect(opts.preview).toBe(true);
		expect(rows.map((r) => [r.code, r.kind, r.pfMember, r.esiMember, r.otPerDay])).toEqual([
			["MR001", "Salary", true, true, 8], ["MR002", "Salary", false, false, 8],
		]);
		const ws = wb.getWorksheet("Wages Register");
		expect(ws.getCell("B1").value).toMatch(/ - PREVIEW, NOT FROM SALARY SLIPS$/);
		expect(ws.getCell("BL6").value).toEqual({ formula: 'IF(BC6="Wages",(BE6/26)*AT6,BE6-BK6)' });
		const text = v.container.textContent;
		expect(text).toContain(`A preview of the wages register for ${periodLabel(YM)} was made, with 2 people.`);
		expect(text).toContain("worked out by Excel from the sheet's own formulas and the attendance, not by the salary slips, so do not pay from it");
		expect(text).toMatch(/Left empty for you to fill in the file: monthly pay, daily wage, food allowance, bata, Labour Welfare Fund/);
		expect(text).toContain("change Type of Remuneration to Wages");
		expect(text).toContain("taken from the UAN, PF and ESIC numbers on each person's record");
		/* Reading only: nothing is written to make a preview. */
		expect(calls).toEqual([]);
	});

	it("takes a day Frappe has not marked from the person's punches, and says how many it took", async () => {
		people();
		/* Bindu has no Attendance at all, only an In and an Out on the 2nd. */
		site.punches = [
			{ name: "P1", employee: "HR-EMP-00002", time: `${YM}-02 08:58:00`, log_type: "IN" },
			{ name: "P2", employee: "HR-EMP-00002", time: `${YM}-02 17:31:00`, log_type: "OUT" },
			{ name: "P3", employee: "SOMEBODY-ELSE", time: `${YM}-03 09:00:00`, log_type: "IN" },
		];
		const v = await draw();
		await click(button(v, "Wages register (Excel)"));
		await made1();
		await act(async () => {});
		const [{ rows }] = made;
		const bindu = rows.find((r) => r.code === "MR002");
		expect(bindu.days[1]).toBe(1);
		expect(bindu.days.filter((d) => d === 1).length).toBe(1);
		expect(v.container.textContent).toContain("1 day had no Attendance in Frappe and was taken from the punches.");
		expect(calls).toEqual([]);
	});

	it("leaves somebody with no salary structure assigned out of the 5-tab Excel, and says so", async () => {
		slips();
		site.ssa = site.ssa.filter((a) => a.employee !== "HR-EMP-00001");
		site.employees = [{ name: "HR-EMP-00001", employee_name: "Anand Raghavan", employee_number: "MR001", status: "Active" }];
		const v = await draw();
		await click(button(v, "Download 5-tab Excel"));
		await act(async () => { fireEvent.click(v.container.querySelector("input[name='pr-epf']")); });
		await click(button(v, "Download"));
		await made1();
		await act(async () => {});
		expect(made[0].parts.flatMap((p) => p.rows.map((r) => r.code))).not.toContain("MR001");
		expect(v.container.textContent).toContain("1 person has no salary structure assigned and is not in the file.");
	});

	it("puts only Active people in the 5-tab Excel, and names whoever it left out", async () => {
		slips();
		site.slips.push({ name: "SAL-2", employee: "HR-EMP-00002", employee_name: "Bindu Thomas", docstatus: 1, gross_pay: 9000, total_deduction: 0, net_pay: 9000, payment_days: 12 });
		site.employees = [
			{ name: "HR-EMP-00001", employee_name: "Anand Raghavan", employee_number: "MR001", status: "Active" },
			{ name: "HR-EMP-00002", employee_name: "Bindu Thomas", employee_number: "MR002", status: "Left", relieving_date: `${YM}-12` },
		];
		const v = await draw();
		await click(button(v, "Download 5-tab Excel"));
		await act(async () => { fireEvent.click(v.container.querySelector("input[name='pr-epf']")); });
		await click(button(v, "Download"));
		await made1();
		await act(async () => {});
		const codes = made[0].parts.flatMap((p) => p.rows.map((r) => r.code));
		expect(codes).toContain("MR001");
		expect(codes).not.toContain("MR002");
		expect(v.container.textContent).toContain("Left out because they are not Active: Bindu Thomas (Left). Pay anybody who has left through Full & Final.");
	});

	it("asks for the EPF calculation before the 5-tab Excel, and makes nothing until one is chosen", async () => {
		slips();
		const v = await draw();
		await click(button(v, "Download 5-tab Excel"));
		expect(v.container.textContent).toContain("EPF calculation for this file");
		expect(button(v, "Download").disabled).toBe(true);
		expect(made).toEqual([]);
		await click(button(v, "Cancel"));
		expect(v.container.textContent).not.toContain("EPF calculation for this file");
		expect(made).toEqual([]);
	});

	it("makes the 5-tab Excel with EPF wages by the calculation chosen, and says which", async () => {
		slips();
		const v = await draw();
		await click(button(v, "Download 5-tab Excel"));
		const half = [...v.container.querySelectorAll("input[name='pr-epf']")][1];
		await act(async () => { fireEvent.click(half); });
		await click(button(v, "Download"));
		await made1();
		await act(async () => {});
		const [{ design, parts }] = made;
		expect(design).toBe(true);
		const rows = parts.flatMap((p) => p.rows);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.every((r) => r.pfShare === 50)).toBe(true);
		expect(v.container.textContent).toContain("with EPF wages by Calculation 2");
		/* Manna Rubber is picked in the top bar, so the file is that company alone,
		   on tabs under its own abbreviation. */
		expect(parts.map((p) => p.sheet)).toEqual(["MR Salary-1", "MR Cash-1", "MR Diff Cash", "MR Labour supply"]);
		expect(v.container.textContent).toContain("— Manna Rubber —");
	});

	it("makes the register from the slips, not a preview, when the month has slips", async () => {
		slips();
		const v = await draw();
		expect(v.container.textContent).not.toContain("The salary sheet needs salary slips");
		await click(button(v, "Wages register (Excel)"));
		await made1();
		const [{ rows, opts, wb }] = made;
		expect(opts.preview).toBeUndefined();
		expect(rows[0]).not.toHaveProperty("kind");
		expect(wb.getWorksheet("Wages Register").getCell("B1").value).toBe(`Employee Salary / Wages Register-${periodLabel(YM).toUpperCase()}`);
	});

	it("makes one file with a sheet per company when all companies are chosen — the slips' register where there are slips, the preview where not", async () => {
		slips();
		site.slips[0].company = "Manna Rubber";
		people();
		act(() => set({ company: "" }));
		const v = await draw();
		const btn = button(v, "Wages register (Excel)");
		expect(btn.disabled).toBe(false);
		await click(btn);
		await made1();
		await act(async () => {});
		const [{ parts, wb }] = made;
		expect(parts.map((p) => [p.company, Boolean(p.preview)])).toEqual([["Manna Rubber", false], ["Manna Tyre UAE", true]]);
		expect(wb.worksheets.map((w) => w.name)).toEqual(["Manna Rubber", "Manna Tyre UAE"]);
		expect(wb.getWorksheet("Manna Rubber").getCell("B1").value).not.toMatch(/PREVIEW/);
		expect(wb.getWorksheet("Manna Tyre UAE").getCell("B1").value).toMatch(/ - PREVIEW, NOT FROM SALARY SLIPS$/);
		expect(v.container.textContent).toContain(`The wages register for ${periodLabel(YM)} was made with 2 sheets, one per company.`);
		expect(calls).toEqual([]);
	});

	it("tiles the month from the slips", async () => {
		slips();
		const v = await draw();
		expect(v.container.textContent).toContain("₹13,000");
		expect(v.container.textContent).toContain("₹10,500");
	});
});

describe("reading", () => {
	it("keys the month on company and period like the rest of payroll", async () => {
		await draw();
		expect(store.getState().app.pay[payKey("Manna Rubber", START, END)].state).toBe("ok");
	});
});
