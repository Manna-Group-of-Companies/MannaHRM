import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------------------------------------------------------------------
   Export Employees Data's whole-record file — lib/employeeexport.js.

   The reads are stubbed at `@/api/client`; the workbook is really built and
   read back, for the reason tests/export.test.jsx gives: a sheet Excel
   "repairs" by deleting it only shows up when somebody opens the file.
   --------------------------------------------------------------------------- */

const listAll = vi.fn();
const getDoc = vi.fn();
vi.mock("@/api/client", async (importOriginal) => ({
	...(await importOriginal()),
	listAll: (...a) => listAll(...a),
	getDoc: (...a) => getDoc(...a),
}));

const { EMP_SECTION_KEYS, employeesXlsx, exportSheets, readForExport } = await import("@/lib/employeeexport");

const bytes = (b) => new Promise((ok, bad) => {
	const r = new FileReader();
	r.onload = () => ok(r.result);
	r.onerror = bad;
	r.readAsArrayBuffer(b);
});

const PEOPLE = [
	{ name: "HR-EMP-1", employee_name: "Anu", employee_number: "MT001", company: "Manna Treads" },
	{ name: "HR-EMP-2", employee_name: "Biju", employee_number: "MT002", company: "Manna Treads" },
];

const FLAT = [
	{ ...PEOPLE[0], custom_aadhaar_number: "123456789012", custom_uan: "100200300400", ctc: 240000,
		date_of_birth: "1990-04-05", custom_father_name: "Mathew", department: "Stores - MT" },
	{ ...PEOPLE[1], passport_number: "P1234567" },
	/* Somebody from the same company the dialog did not ask for. */
	{ name: "HR-EMP-9", employee_name: "Other", company: "Manna Treads" },
];

let onboarding = [];

function stubSite({ joinFails = false } = {}) {
	listAll.mockImplementation(async (doctype, fields) => {
		if (doctype === "Employee Onboarding") return onboarding;
		if (doctype === "Salary Structure Assignment") {
			return [
				{ employee: "HR-EMP-1", salary_structure: "Old", from_date: "2025-04-01", base: 18000, docstatus: 1 },
				{ employee: "HR-EMP-1", salary_structure: "New", from_date: "2026-04-01", base: 20000, docstatus: 0 },
			];
		}
		if (fields.some((f) => f.includes("tabEmployee Education"))) {
			if (joinFails) throw new Error("417");
			return [
				{ name: "HR-EMP-1", edu_qualification: "B.Com", edu_school_univ: "MG University", edu_year_of_passing: 2011 },
				{ name: "HR-EMP-1", edu_qualification: "M.Com", edu_school_univ: "MG University", edu_year_of_passing: 2013 },
				{ name: "HR-EMP-2" },
			];
		}
		return FLAT;
	});
	getDoc.mockImplementation(async (_, n) => (n === "HR-EMP-2"
		? { name: n, education: [{ qualification: "ITI", school_univ: "Govt ITI" }] } : { name: n, education: [] }));
}

let blobs;
beforeEach(() => {
	listAll.mockReset();
	onboarding = [];
	getDoc.mockReset();
	blobs = [];
	globalThis.URL.createObjectURL = vi.fn((b) => { blobs.push(b); return "blob:x"; });
	globalThis.URL.revokeObjectURL = vi.fn();
	HTMLAnchorElement.prototype.click = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("reading every person's whole record", () => {
	it("fills the identity and PF numbers the dashboard's own list never holds", async () => {
		stubSite();
		const { docs } = await readForExport(PEOPLE, ["identity", "pf"]);
		expect(docs).toHaveLength(2);
		const [id] = exportSheets(docs, ["identity"]);
		expect(id.rows[0]).toContain("123456789012");
		expect(id.rows[1]).toContain("P1234567");
	});

	it("keeps an Aadhaar number as text so Excel cannot round its last digits away", async () => {
		stubSite();
		const { docs } = await readForExport(PEOPLE, ["identity"]);
		const [id] = exportSheets(docs, ["identity"]);
		expect(typeof id.rows[0][2]).toBe("string");
	});

	it("puts the latest salary structure on the salary sheet and says it is only a draft", async () => {
		stubSite();
		const { docs } = await readForExport(PEOPLE, ["salary"]);
		const [sal] = exportSheets(docs, ["salary"]);
		const row = Object.fromEntries(sal.head.map((h, i) => [h, sal.rows[0][i]]));
		expect(row["Salary Structure"]).toBe("New");
		expect(row["Structure State"]).toBe("Draft");
		expect(row.CTC).toBe(240000);
	});

	it("gives a person one qualification row per degree, and one blank row when they have none", async () => {
		stubSite();
		const { docs } = await readForExport(PEOPLE, ["qualification"]);
		const [q] = exportSheets(docs, ["qualification"]);
		expect(q.rows.map((r) => r[0])).toEqual(["MT001", "MT001", "MT002"]);
		expect(q.rows[1]).toContain("M.Com");
		expect(q.rows[2].slice(2).every((v) => v === "")).toBe(true);
		expect(getDoc).not.toHaveBeenCalled();
	});

	it("falls back to one document read per person when the site refuses the joined read", async () => {
		stubSite({ joinFails: true });
		const { docs } = await readForExport(PEOPLE, ["qualification"]);
		const [q] = exportSheets(docs, ["qualification"]);
		expect(getDoc).toHaveBeenCalledTimes(2);
		expect(q.rows.find((r) => r[0] === "MT002")).toContain("ITI");
	});

	it("writes a note under the salary sheet when salary structures cannot be read, rather than blank columns that look like nobody has one", async () => {
		stubSite();
		const base = listAll.getMockImplementation();
		listAll.mockImplementation(async (dt, ...rest) => {
			if (dt === "Salary Structure Assignment") throw new Error("403 Forbidden");
			return base(dt, ...rest);
		});
		const { docs, notes } = await readForExport(PEOPLE, ["salary"]);
		const [sal] = exportSheets(docs, ["salary"], { notes });
		expect(sal.note).toMatch(/could not be read/);
	});
});

describe("finding the numbers wherever the site keeps them", () => {
	it("takes Aadhaar and both addresses from the onboarding form when the Employee record has none", async () => {
		stubSite();
		onboarding = [{ name: "ONB-1", employee_name: "biju ", company: "Manna Treads",
			custom_aadhaar_number: "999988887777", custom_current_address: "Kottayam", custom_permanent_address: "Pala" }];
		const { docs, notes } = await readForExport(PEOPLE, ["identity", "personal"], undefined);
		const [id, per] = exportSheets(docs, ["identity", "personal"], { notes });
		expect(id.rows[1]).toContain("999988887777");
		expect(per.rows[1]).toContain("Kottayam");
		expect(per.rows[1]).toContain("Pala");
		expect(id.note).toMatch(/1 employee\(s\) had blanks filled/);
	});

	it("never overwrites an Aadhaar the Employee already holds with the one typed on the form", async () => {
		stubSite();
		onboarding = [{ employee: "HR-EMP-1", custom_aadhaar_number: "000000000000" }];
		const { docs } = await readForExport(PEOPLE, ["identity"]);
		const [id] = exportSheets(docs, ["identity"]);
		expect(id.rows[0]).toContain("123456789012");
		expect(id.rows[0]).not.toContain("000000000000");
	});

	it("reads the Aadhaar the bridge writes under custom_aadhaar_no", async () => {
		stubSite();
		FLAT[1].custom_aadhaar_no = "111122223333";
		try {
			const { docs } = await readForExport(PEOPLE, ["identity"]);
			expect(exportSheets(docs, ["identity"])[0].rows[1]).toContain("111122223333");
		} finally {
			delete FLAT[1].custom_aadhaar_no;
		}
	});

	it("adds a PF or ESI field nobody mapped as a column of its own, rather than leaving it out of the file", async () => {
		stubSite();
		FLAT[0].custom_esi_ip_number = "3100123456";
		try {
			const { docs } = await readForExport(PEOPLE, ["pf"]);
			const [pf] = exportSheets(docs, ["pf"]);
			expect(pf.head).toContain("ESI Ip Number");
			expect(pf.rows[0]).toContain("3100123456");
		} finally {
			delete FLAT[0].custom_esi_ip_number;
		}
	});
});

describe("the colour-coded workbook", () => {
	it("has All Details first, then one coloured tab per section, and dates written day first", async () => {
		stubSite();
		const { docs } = await readForExport(PEOPLE, EMP_SECTION_KEYS);
		await employeesXlsx(exportSheets(docs, EMP_SECTION_KEYS, { sub: "Manna Treads" }), "e.xlsx");

		const ExcelJS = (await import("exceljs")).default;
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(await bytes(blobs[0]));
		expect(wb.worksheets.map((w) => w.name)).toEqual([
			"All Details", "Basic Details", "Identity Detail", "PF - ESIC Detail",
			"Salary Master Detail", "Personal Detail", "Family Detail", "Qualification Detail",
		]);
		const idn = wb.getWorksheet("Identity Detail");
		expect(idn.properties.tabColor.argb).toBe("FF0B6E6E");

		const pers = wb.getWorksheet("Personal Detail");
		const values = [];
		pers.eachRow((r) => values.push(...r.values.filter(Boolean).map(String)));
		expect(values).toContain("05-04-1990");
	}, 30000);
});

describe("the Export Employees Data dialog", () => {
	it("lets somebody pick a company and PDF, and writes one file for just that company", async () => {
		const { act, fireEvent, render } = await import("@testing-library/react");
		const { Provider } = await import("react-redux");
		const { store, set, getState, resetStore } = await import("@/store");
		const { EXP_BLANK } = await import("@/data/employees");
		const { loadedState } = await import("./fixture");
		const ExportEmployees = (await import("@/features/employees/ExportEmployees")).default;

		resetStore();
		const st = loadedState();
		set({ ...st, company: "", exp: { ...EXP_BLANK(), open: true } });
		const co = st.companies[0].name;
		listAll.mockImplementation(async () => st.employees);

		let out;
		await act(async () => { out = render(<Provider store={store}><ExportEmployees onClose={() => {}} /></Provider>); });
		fireEvent.change(out.container.querySelector("#expCompany"), { target: { value: co } });
		fireEvent.click(out.getByRole("radio", { name: "PDF" }));
		await act(async () => { fireEvent.click(out.getByText("Generate Report")); });

		await vi.waitFor(() => expect(getState().exp.msg).toMatch(/written to employees-.*\.pdf/), { timeout: 20000 });
		expect(blobs).toHaveLength(1);
		expect(blobs[0].type).toBe("application/pdf");
		const n = st.employees.filter((e) => e.company === co).length;
		expect(getState().exp.msg).toContain(`${n} employee(s)`);
	}, 30000);
});
