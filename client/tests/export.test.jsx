import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import { plain, sheetNames, sheetsPdf, sheetsXlsx } from "@/lib/export";
import { REPORTS, askText, reportFor, reportInput, specSheet } from "@/data/reports";
import ReportsHub, { reportTables } from "@/features/reports/ReportsHub";
import { FACTOHR_MENU } from "@/data/factohr";
import { isHidden } from "@/data/sections";
import { pathFor } from "@/routes/router";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Reports as Excel and PDF files.

   The files are really built — ExcelJS and jsPDF both run under jsdom — and
   caught at the one point they leave the page, the Blob handed to an anchor.
   The workbook is read back, because a sheet Excel "repairs" by deleting it
   is a failure that only shows up when somebody opens the file.
   --------------------------------------------------------------------------- */

/* jsdom's Blob has no `arrayBuffer`; FileReader it does have. */
const bytes = (b) => new Promise((ok, bad) => {
	const r = new FileReader();
	r.onload = () => ok(r.result);
	r.onerror = bad;
	r.readAsArrayBuffer(b);
});

/* ExcelJS and jsPDF are a megabyte of parsing on first import, and under the
   whole suite's parallel load that alone can pass vitest's 5s default. */
const SLOW = 30000;

let blobs;
beforeEach(() => {
	blobs = [];
	globalThis.URL.createObjectURL = vi.fn((b) => { blobs.push(b); return "blob:x"; });
	globalThis.URL.revokeObjectURL = vi.fn();
	HTMLAnchorElement.prototype.click = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

const SHEET = {
	title: "Present Report", sub: "Manna Rubber · 24-09-2026",
	head: ["Emp code", "Name", "Punches"],
	rows: [["MR001", "Anil", 2], ["MR002", "Beena", 1]],
	note: "An OUT with no IN counts.",
};

describe("sheet names", () => {
	it("keeps a sheet name inside Excel's 31 characters and out of its forbidden set", () => {
		const [n] = sheetNames(["Head Count And Attendance: by company / department [all]"]);
		expect(n.length).toBeLessThanOrEqual(31);
		expect(n).not.toMatch(/[[\]:*?/\\]/);
	});

	it("never gives two sheets the same name, whatever case they differ in", () => {
		const names = sheetNames(["MSP Report", "msp report", "MSP Report"]);
		expect(new Set(names.map((x) => x.toLowerCase())).size).toBe(3);
	});
});

describe("the files", () => {
	it("writes one worksheet per report, with the header row and every data row", async () => {
		await sheetsXlsx([SHEET, { ...SHEET, title: "Absent Report", rows: [] }], "r.xlsx");
		expect(blobs).toHaveLength(1);
		const ExcelJS = (await import("exceljs")).default;
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(await bytes(blobs[0]));
		expect(wb.worksheets.map((w) => w.name)).toEqual(["Present Report", "Absent Report"]);
		const values = [];
		wb.worksheets[0].eachRow((r) => values.push(r.values.slice(1)));
		expect(values).toContainEqual(["Emp code", "Name", "Punches"]);
		expect(values).toContainEqual(["MR002", "Beena", 1]);
	}, SLOW);

	it("writes a PDF that is a PDF", async () => {
		await sheetsPdf([SHEET, SHEET], "r.pdf");
		expect(blobs).toHaveLength(1);
		expect(blobs[0].type).toBe("application/pdf");
		const head = new TextDecoder().decode((await bytes(blobs[0])).slice(0, 5));
		expect(head).toBe("%PDF-");
	}, SLOW);
});

describe("a report as a sheet", () => {
	it("writes an empty string where the screen draws a dash", () => {
		const spec = reportFor("employees", "directory");
		const sh = specSheet(spec, [{ name: "E1", employee_name: "Anil" }], "x");
		expect(sh.head).toEqual(spec.cols.map((c) => c[0]));
		expect(sh.rows[0]).not.toContain(undefined);
		expect(sh.rows[0]).not.toContain(null);
	});

	it("carries the note without its markup", () => {
		expect(plain("Off <code>date_of_joining</code> &amp; more")).toBe("Off date_of_joining & more");
		for (const spec of REPORTS) expect(specSheet(spec, [], "").note).not.toMatch(/<[a-z]/);
	});

	it("says which company and which day the file is about", () => {
		const spec = reportFor("attendance", "present");
		expect(askText(spec, { day: "2026-09-24" }, "Manna Treads")).toMatch(/Manna Treads.*24/);
		expect(askText(spec, { day: "2026-09-24" }, "")).toMatch(/All companies/);
	});
});

describe("the Reports page", () => {
	beforeEach(() => { resetStore(); set({ ...loadedState(), section: "reports", subtab: "overview" }); });

	const draw = async () => {
		let out;
		await act(async () => { out = render(<Provider store={store}><ReportsHub /></Provider>); });
		return out;
	};

	/* The spec reports the hub builds: not Absent, whose own tab replaced it,
	   and not one whose page is hidden — hiding a page and then offering its
	   download one module over is not hiding it. */
	const shown = () => REPORTS.filter((r) => r.id !== "absent" && !isHidden(r.section, r.id));

	it("lists every spec report except the Absent spec and those on hidden pages", async () => {
		const { container } = await draw();
		const text = container.textContent;
		for (const spec of shown()) expect(text).toContain(spec.title);
		for (const spec of REPORTS.filter((r) => isHidden(r.section, r.id))) expect(text).not.toContain(spec.title);
		expect(reportInput(getState(), "leave").rows.every((e) => e.status === "Active")).toBe(true);
	});

	const theirs = () => FACTOHR_MENU.filter((r) => r[1] === "Reports" && !isHidden(r[0]));

	it("shows every report of Factor HR's that opens a page here", async () => {
		const { container } = await draw();
		const text = container.textContent;
		for (const r of theirs().filter((x) => x[5] && !isHidden(x[5][0], x[5][1]))) {
			const spec = REPORTS.find((x) => x.section === r[5][0] && x.id === r[5][1]);
			expect(text).toContain(spec && spec.id !== "absent" ? spec.title : r[3]);
		}
	});

	it("leaves off the reports of theirs that are not built here", async () => {
		const { container } = await draw();
		const unbuilt = theirs().filter((r) => !r[5]);
		expect(unbuilt.length).toBeGreaterThan(10);
		for (const r of unbuilt) expect(container.textContent).not.toContain(r[3]);
	});

	it("lists each page once, whichever table it is in", () => {
		const specs = REPORTS.filter((r) => r.id !== "absent" && !isHidden(r.section, r.id));
		const { elsewhere } = reportTables(specs);
		const addresses = [...specs.map((r) => r.section + "/" + r.id), ...elsewhere.map((r) => r.section + "/" + r.subtab)];
		expect(new Set(addresses).size).toBe(addresses.length);
	});

	it("leaves off the reports of modules hidden from the rail", async () => {
		const { container } = await draw();
		expect(container.textContent).not.toContain("Salary Register");
		expect(container.textContent).not.toContain("Loan Register");
		expect(container.textContent).not.toContain("Form 16");
	});

	it("sends their Overtime Report to the OT Report, which reads Employee Overtime", async () => {
		const { getByText } = await draw();
		expect(getByText("Overtime Report →").getAttribute("href")).toBe(pathFor("attendance", "ot"));
	});

	it("downloads every report as one workbook from Download all", async () => {
		const { getByText } = await draw();
		await act(async () => { fireEvent.click(getByText("Download all — Excel")); });
		await vi.waitFor(() => expect(blobs).toHaveLength(1));
		const ExcelJS = (await import("exceljs")).default;
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(await bytes(blobs[0]));
		expect(wb.worksheets).toHaveLength(shown().length);
	}, SLOW);
});
