import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import EmpPick from "@/components/EmpPick";

const PEOPLE = [
	{ name: "HR-EMP-001", employee_name: "Anu Joseph", employee_number: "MR101", attendance_device_id: "4417" },
	{ name: "HR-EMP-002", employee_name: "Biju Thomas", employee_number: "MR102", attendance_device_id: "4420" },
	{ name: "HR-EMP-003", employee_name: "Anil Kumar", employee_number: "MF007" },
];

const draw = (value = "", onChange = vi.fn()) => {
	const view = render(<EmpPick people={PEOPLE} value={value} onChange={onChange} all="every employee" />);
	return { view, box: view.getByRole("combobox"), onChange };
};

const shown = (view) => [...view.container.querySelectorAll("[role=option]")].map((b) => b.textContent);

describe("the searchable employee picker", () => {
	it("narrows the list by name as it is typed", () => {
		const { view, box } = draw();
		fireEvent.focus(box);
		fireEvent.change(box, { target: { value: "an" } });
		expect(shown(view).join("|")).toContain("Anu Joseph");
		expect(shown(view).join("|")).toContain("Anil Kumar");
		expect(shown(view).join("|")).not.toContain("Biju");
	});

	it("finds somebody by the number on the machine, which is how the gate knows them", () => {
		const { view, box } = draw();
		fireEvent.focus(box);
		fireEvent.change(box, { target: { value: "4420" } });
		expect(shown(view)).toHaveLength(1);
		expect(shown(view)[0]).toContain("Biju Thomas");
	});

	it("picks with Enter and sends the employee's document name", () => {
		const { box, onChange } = draw();
		fireEvent.focus(box);
		fireEvent.change(box, { target: { value: "MF007" } });
		fireEvent.keyDown(box, { key: "Enter" });
		expect(onChange).toHaveBeenCalledWith("HR-EMP-003");
	});

	it("never sends a half-typed name — leaving the box puts the old pick back", () => {
		const { box, onChange } = draw("HR-EMP-001");
		fireEvent.focus(box);
		fireEvent.change(box, { target: { value: "Bij" } });
		fireEvent.blur(box);
		expect(onChange).not.toHaveBeenCalled();
		expect(box.value).toBe("Anu Joseph (MR101)");
	});

	it("offers everybody first while nothing is typed, so a pick is one click to clear", () => {
		const { view, box, onChange } = draw("HR-EMP-002");
		fireEvent.focus(box);
		const first = view.container.querySelector("[role=option]");
		expect(first.textContent).toBe("every employee");
		fireEvent.mouseDown(first);
		expect(onChange).toHaveBeenCalledWith("");
	});

	it("says so when nobody matches rather than showing an empty box", () => {
		const { view, box } = draw();
		fireEvent.focus(box);
		fireEvent.change(box, { target: { value: "zzz" } });
		expect(view.container.textContent).toContain("Nobody matches");
	});
});
