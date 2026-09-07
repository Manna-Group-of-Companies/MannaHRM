import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";

import Categories from "@/features/employees/Categories";
import { store, set, getState, resetStore } from "@/store";
import { http } from "@/api/client";
import { CAT_MAKE, CAT_SHEET_COLS, planImport, templateRows } from "@/lib/catsheet";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   The ↑ on Employees → Categories: **Data import from file** and **Download
   template**, both of which used to end somewhere else.

   The half worth testing hardest is the plan, not the dialog. Every row of a
   dropped file gets exactly one verdict, and the one that matters is which rows
   are *created*: this writes on the site, as the person, and a rule that says
   "new" about a value already there adds a second Operator beside the first —
   which reads as a real designation right up until half the fitters are filed
   under one and half under the other.

   So the tests are named after the rules rather than after the screen. The two
   at the end are the wiring: a menu item that calls nothing looks exactly like
   a menu item that works, and that is a bug nobody reports as one.
   --------------------------------------------------------------------------- */

const s = () => ({ ...loadedState(), empFields: [], empFieldsState: "ok" });

/** A sheet as `parseCsv` hands one over: objects keyed by the header row. */
const sheet = (...rows) => rows;

const row = (type, desc, extra) => ({
	"Category Type": type, ID: "", Code: "", Description: desc, Status: "", Company: "", ...extra,
});

describe("what the plan says a row would do", () => {
	it("creates a designation the site does not hold", () => {
		const plan = planImport(s(), sheet(row("Designation", "Welder")));
		expect(plan.counts.make).toBe(1);
		expect(plan.rows[0].dt).toBe("Designation");
		expect(CAT_MAKE.Designation(plan.rows[0])).toEqual({ designation_name: "Welder" });
	});

	it("leaves a designation the site already holds alone", () => {
		const plan = planImport(s(), sheet(row("Designation", "Operator")));
		expect(plan.counts.have).toBe(1);
		expect(plan.make).toHaveLength(0);
	});

	it("matches a department on its tidied name as well as on its id", () => {
		/* The site holds "Production - MR" and the screen draws "Production".
		   A file carrying either is the same department, and creating a second
		   one because the file said the short name is the whole failure this
		   test exists for. */
		const plan = planImport(s(), sheet(
			row("Department", "Production"),
			row("Department", "Production - MR"),
		));
		expect(plan.counts.have).toBe(2);
	});

	it("creates one record for a value listed twice in the same file", () => {
		const plan = planImport(s(), sheet(
			row("Designation", "Welder"),
			row("Designation", "welder"),
		));
		expect(plan.counts.make).toBe(1);
		expect(plan.counts.have).toBe(1);
	});

	it("reads a department's company off the abbreviation and sends the full name", () => {
		const plan = planImport(s(), sheet(row("Department", "Packing", { Company: "MR" })));
		expect(CAT_MAKE.Department(plan.rows[0], s()))
			.toEqual({ department_name: "Packing", company: "Manna Rubber", is_group: 0 });
	});

	it("sends no company at all when the file names one this site has not got", () => {
		/* Absent rather than empty: `company: ""` is a request to file the
		   department under a company called "", which the site would refuse
		   after the row had already been sent. */
		const plan = planImport(s(), sheet(row("Department", "Packing", { Company: "ZZZ" })));
		expect(CAT_MAKE.Department(plan.rows[0], s())).not.toHaveProperty("company");
	});

	it("carries Disabled onto the department it creates", () => {
		const plan = planImport(s(), sheet(row("Department", "Packing", { Status: "Disabled" })));
		expect(CAT_MAKE.Department(plan.rows[0], s()).disabled).toBe(1);
	});

	it("never creates a company, and says why on the row", () => {
		const plan = planImport(s(), sheet(row("Company", "Manna Exports")));
		expect(plan.counts.skip).toBe(1);
		expect(plan.make).toHaveLength(0);
		expect(plan.rows[0].why).toMatch(/chart of accounts/i);
	});

	/* **A case was removed here on 7 September 2026.** A row naming a category
	   type that is a pay rule — Factor HR's Gratuity Applicable — was skipped
	   with the reason on it. The category types are read from the site now and
	   none of them is a pay rule, so no sheet can name one: a row naming
	   "Gratuity Applicable" is a row naming a type this screen does not have,
	   which is the "bad" case two tests above already covers. */


	it("refuses a row with no value in it", () => {
		const plan = planImport(s(), sheet(row("Designation", "")));
		expect(plan.counts.bad).toBe(1);
	});

	it("refuses a row naming a category type this screen does not know", () => {
		const plan = planImport(s(), sheet(row("Blood Group", "O+")));
		expect(plan.counts.bad).toBe(1);
	});

	it("says the file names no type at all rather than blaming every row", () => {
		const plan = planImport(s(), sheet({ Description: "Welder" }));
		expect(plan.needType).toBe(true);
	});

	it("reads every row as the drill's own type when the dialog was opened from one", () => {
		/* The screen is one master there, so a Category Type column naming
		   another is a file dropped on the wrong screen — ignored, not obeyed. */
		const desig = { name: "Designation", key: "Designation", dt: "Designation" };
		const plan = planImport(s(), sheet(row("Department", "Welder")), desig);
		expect(plan.rows[0].dt).toBe("Designation");
		expect(plan.counts.make).toBe(1);
	});

	it("reads a sheet exported from Frappe, whose column is designation_name", () => {
		const plan = planImport(s(), sheet({ "Category Type": "Designation", designation_name: "Welder" }));
		expect(plan.counts.make).toBe(1);
	});
});

describe("the template", () => {
	it("writes every value the site holds, under the columns the plan reads back", () => {
		const rows = templateRows(s());
		expect(CAT_SHEET_COLS[0]).toBe("Category Type");
		/* Two companies, three departments, four designations. */
		expect(rows).toHaveLength(9);
	});

	it("round-trips: everything it writes reads back as already there", () => {
		const st = s();
		const rows = templateRows(st).map((r) =>
			Object.fromEntries(CAT_SHEET_COLS.map((c, i) => [c, r[i]])));
		const plan = planImport(st, rows);
		expect(plan.make).toHaveLength(0);
		expect(plan.counts.bad).toBe(0);
	});

	it("writes only the one master when the drill asks for it", () => {
		const desig = { name: "Designation", key: "Designation", dt: "Designation" };
		expect(templateRows(s(), desig)).toHaveLength(4);
	});
});

/* --------------------------------------------------------------------------- */

const draw = () => render(<Provider store={store}><Categories /></Provider>);

/** The ↑ on the list header, opened. Both headers draw one and only the list's
    is on screen until a category is opened, so the first is the list's. */
function menu() {
	const view = draw();
	act(() => { view.getAllByLabelText("Import")[0].click(); });
	return within(view.container.querySelector(".catimpmenu"));
}

beforeEach(() => {
	resetStore();
	act(() => set(s()));
});

describe("the menu items", () => {
	it("opens the file picker from Data import from file", () => {
		/* `menu()` renders, so it is called outside `act` — a `render` inside an
		   act scope has not committed until that scope closes, and the container
		   read halfway through it is empty. */
		const m = menu();
		act(() => { m.getByText("Data import from file").click(); });
		expect(getState().catfile).toBeTruthy();
		expect(document.querySelector("#dlgtitle").textContent).toBe("Data import from file");
		expect(document.querySelector('input[type="file"]')).toBeTruthy();
	});

	it("hands a file to the browser from Download template, and says how many rows", () => {
		/* The anchor's own click is what saves the file. Stubbed rather than
		   watched on `URL.createObjectURL`, which the setup already fills in for
		   every export on this dashboard — what is being tested here is that the
		   item does the work at all, which it did not before. */
		const click = vi.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {});
		const m = menu();
		act(() => { m.getByText("Download template").click(); });
		expect(click).toHaveBeenCalled();
		expect(getState().catmsg).toMatch(/9 row/);
		click.mockRestore();
	});
});

describe("the picker, end to end", () => {
	/** The dialog, open, with one file dropped on it. */
	async function dropped(csv) {
		const m = menu();
		act(() => { m.getByText("Data import from file").click(); });
		const input = document.querySelector('input[type="file"]');
		fireEvent.change(input, {
			target: { files: [new File([csv], "categories.csv", { type: "text/csv" })] },
		});
		/* `FileReader` answers on a later tick, so the plan is not on screen the
		   moment the file is handed over. */
		await waitFor(() => expect(document.body.textContent).toMatch(/What happens/));
	}

	it("shows what a row would do, and then creates exactly that record", async () => {
		http.post.mockClear();
		await dropped("Category Type,Description\r\nDesignation,Welder\r\n");
		expect(document.body.textContent).toContain("will be created");

		const go = [...document.querySelectorAll("button")]
			.find((b) => b.textContent.trim() === "Import 1");
		await act(async () => { go.click(); });

		expect(http.post).toHaveBeenCalledWith(
			"/api/resource/Designation",
			expect.objectContaining({ designation_name: "Welder" }),
			expect.anything(),
		);
	});

	it("sends nothing at all for a file of values the site already holds", async () => {
		http.post.mockClear();
		await dropped("Category Type,Description\r\nDesignation,Operator\r\n");
		expect(document.body.textContent).toContain("already there");
		const go = [...document.querySelectorAll("button")]
			.find((b) => b.textContent.trim() === "Import");
		expect(go).toBeDisabled();
		expect(http.post).not.toHaveBeenCalled();
	});

	it("refuses a spreadsheet by name rather than reading it as text", async () => {
		const m = menu();
		act(() => { m.getByText("Data import from file").click(); });
		fireEvent.change(document.querySelector('input[type="file"]'), {
			target: { files: [new File(["PK"], "categories.xlsx")] },
		});
		await waitFor(() => expect(document.body.textContent).toMatch(/is not a CSV/));
	});
});
