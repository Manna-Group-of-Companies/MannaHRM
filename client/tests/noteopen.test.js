import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { openDoc } from "@/features/help/NotesHelp";
import { getState, resetStore, set } from "@/store";
import { loadedState } from "./fixture";
import { MANAGED } from "@/data/manage";
import { isHidden } from "@/data/sections";

/* A notification opens where the work is done in this app, not the desk. */

beforeEach(() => {
	resetStore();
	act(() => set(loadedState()));
	vi.spyOn(window, "open").mockImplementation(() => null);
});

describe("opening a notification", () => {
	it("takes a correction to the Attendance tab of Approvals", () => {
		act(() => openDoc(getState(), { document_type: "Employee Attendance Regularization", document_name: "HR-REG-2026-00002" }));
		const s = getState();
		expect([s.section, s.subtab, s.apptab]).toEqual(["dashboard", "approvals", "attendance"]);
		expect(window.open).not.toHaveBeenCalled();
	});

	it("opens a managed doctype's own page with that record asked for", () => {
		const page = MANAGED.find((m) => !isHidden(m[0], m[1]));
		act(() => openDoc(getState(), { document_type: page[3], document_name: "X-0001" }));
		const s = getState();
		expect([s.section, s.subtab]).toEqual([page[0], page[1]]);
		expect(s.openRecord).toEqual({ doctype: page[3], name: "X-0001" });
	});

	it("sends a managed doctype whose page is hidden to the desk rather than to a page that is not there", () => {
		const hidden = MANAGED.find((m) => isHidden(m[0], m[1]));
		if (!hidden) return;
		act(() => openDoc({ ...getState(), site: "https://x.example" }, { document_type: hidden[3], document_name: "X-1" }));
		expect(window.open).toHaveBeenCalled();
		expect(getState().openRecord).toBeNull();
	});

	it("sends a doctype with no page here to the desk", () => {
		act(() => openDoc({ ...getState(), site: "https://x.example" }, { document_type: "Sales Order", document_name: "SO-1" }));
		expect(window.open).toHaveBeenCalledWith("https://x.example/app/sales-order/SO-1", "_blank", "noreferrer");
	});
});
