import { beforeEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import CreateEmployee from "@/features/employees/CreateEmployee";
import { NEW_EMP_STEPS } from "@/data/employees";
import { PROFILE_CHECKS } from "@/data/profile";
import { EMP_FIELDS_TAGGED } from "@/api/load";
import { NEW_EMP_BLANK, employeeDoc, managerChoices } from "@/lib/newemp";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Managers, tagged (asked for by HR, 9 November 2026).

   A person is ticked as a Manager when they are created, or later on their
   profile; Create Employee's Reporting Manager then offers only the tagged
   managers of the company the new person is joining. A company with nobody
   tagged yet still offers everybody, and says so — an empty list would leave
   HR unable to create anybody.
   --------------------------------------------------------------------------- */

const person = (name, company, over = {}) => ({
	name, employee_name: name, company, status: "Active", designation: "", ...over,
});

describe("who Reporting Manager offers", () => {
	const pool = [
		person("Asha", "Manna Rubber", { custom_is_manager: 1 }),
		person("Biju", "Manna Rubber"),
		person("Chitra", "Manna Rubber", { custom_is_manager: 1, status: "Left" }),
	];

	it("is only the active people ticked as a Manager", () => {
		const r = managerChoices(pool);
		expect(r.list.map((e) => e.name)).toEqual(["Asha"]);
		expect(r.tagged).toBe(true);
	});

	it("is everybody active when nobody is tagged, and says nobody is", () => {
		const r = managerChoices([person("Biju", "Manna Rubber"), person("Dev", "Manna Rubber", { custom_is_manager: 0 })]);
		expect(r.list.map((e) => e.name)).toEqual(["Biju", "Dev"]);
		expect(r.tagged).toBe(false);
	});

	it("reads a site that has no Manager field as nobody tagged", () => {
		expect(managerChoices([person("Biju", "Manna Rubber")]).tagged).toBe(false);
	});
});

describe("the Manager tick", () => {
	it("is on Create Employee beside Reporting Manager, and sent when ticked", () => {
		const org = NEW_EMP_STEPS.find((st) => st[0] === "org");
		const group = org[2].find(([, rows]) => rows.some((r) => r[0] === "reports_to"));
		expect(group[1].map((r) => r[0])).toContain("custom_is_manager");
		expect(employeeDoc({ ...NEW_EMP_BLANK().f, custom_is_manager: 1 }).custom_is_manager).toBe(1);
		expect(employeeDoc({ ...NEW_EMP_BLANK().f, custom_is_manager: "" })).not.toHaveProperty("custom_is_manager");
	});

	it("is read with the employees, and editable as Yes / No on the profile", () => {
		expect(EMP_FIELDS_TAGGED).toContain("custom_is_manager");
		expect(PROFILE_CHECKS.has("custom_is_manager")).toBe(true);
	});
});

describe("Create Employee's Reporting Manager", () => {
	beforeEach(() => resetStore());

	const drawOrgStep = (employees, company) => {
		const step = NEW_EMP_STEPS.findIndex((st) => st[0] === "org");
		const blank = NEW_EMP_BLANK();
		act(() => set({ ...loadedState(), employees,
			newemp: { ...blank, step, f: { ...blank.f, company } } }));
		return render(<Provider store={store}><CreateEmployee /></Provider>);
	};
	const offered = (view) => [...view.container.querySelectorAll("#ne-reports_to option")]
		.map((o) => o.value).filter(Boolean);

	it("offers only the tagged managers of the company being typed in", () => {
		const view = drawOrgStep([
			person("HR-EMP-1", "Manna Rubber", { custom_is_manager: 1 }),
			person("HR-EMP-2", "Manna Rubber"),
			person("HR-EMP-3", "Manna Treads", { custom_is_manager: 1 }),
		], "Manna Rubber");
		expect(offered(view)).toEqual(["HR-EMP-1"]);
		expect(view.container.querySelector(".wizmgr")).toBeNull();
	});

	it("offers everybody in the company, and says why, when nobody there is tagged", () => {
		const view = drawOrgStep([
			person("HR-EMP-2", "Manna Rubber"),
			person("HR-EMP-3", "Manna Treads", { custom_is_manager: 1 }),
		], "Manna Rubber");
		expect(offered(view)).toEqual(["HR-EMP-2"]);
		expect(view.container.querySelector(".wizmgr").textContent).toContain("Nobody in Manna Rubber is tagged as a Manager");
	});
});
