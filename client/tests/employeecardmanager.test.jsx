import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import EmployeeCard from "@/components/EmployeeCard";

/* Employee Master's cards show the Manager tag and who a person reports to
   (asked for by HR, 18 November 2026). */

const person = (over) => ({
	name: "E1", employee_name: "Asha Nair", employee_number: "MR001", status: "Active",
	designation: "Accountant", department: "Accounts - MR", ...over,
});

describe("a card on Employee Master", () => {
	it("carries a Manager tag for somebody tagged as one", () => {
		const v = render(<EmployeeCard e={person({ custom_is_manager: 1 })} onOpen={() => {}} />);
		expect(v.container.querySelector(".emgr").textContent).toBe("Manager");
	});

	it("has no tag for everybody else, whether the field is 0, empty or absent on the site", () => {
		for (const over of [{ custom_is_manager: 0 }, { custom_is_manager: "" }, {}]) {
			const v = render(<EmployeeCard e={person(over)} onOpen={() => {}} />);
			expect(v.container.querySelector(".emgr")).toBeNull();
			v.unmount();
		}
	});

	it("says who the person reports to", () => {
		const v = render(<EmployeeCard e={person({ reports_to: "E9" })} boss={{ name: "E9", employee_name: "Biju Varghese" }} onOpen={() => {}} />);
		expect(v.container.textContent).toContain("Reports to Biju Varghese");
	});

	it("says nothing is set, as a dash, when they have no manager", () => {
		const v = render(<EmployeeCard e={person()} onOpen={() => {}} />);
		const line = [...v.container.querySelectorAll(".eline")].find((l) => l.getAttribute("title")?.includes("Reporting Manager"));
		expect(line.classList.contains("off")).toBe(true);
		expect(line.textContent).toBe("-");
	});

	it("shows neither for somebody who is not active, whose details stay hidden", () => {
		const v = render(<EmployeeCard e={person({ status: "Left", custom_is_manager: 1, reports_to: "E9" })}
			boss={{ name: "E9", employee_name: "Biju" }} onOpen={() => {}} />);
		expect(v.container.querySelector(".emgr")).toBeNull();
		expect(v.container.textContent).not.toContain("Reports to");
	});
});
