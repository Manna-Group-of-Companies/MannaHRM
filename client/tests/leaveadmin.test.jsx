import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { act, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Approvals from "@/features/approvals/Approvals";
import { load } from "@/api/load";
import { LEAVE_ADMINS, SALARY_VIEW_ONLY, leaveAdmin } from "@/data/menus";
import { store, set, getState, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* Leave is the administrator's alone to see and decide (19 October 2026). The
   phone app sends every application to one login; the dashboard shows open
   leave to that login and nobody else. */

const ADMIN = "hr@mannarubber.com";

beforeEach(() => resetStore());

describe("who sees leave", () => {
	it("is the very login the phone app sends every application to", () => {
		const dart = fs.readFileSync(path.resolve(__dirname, "../../app/lib/core/constants.dart"), "utf8");
		const approver = /const String kLeaveApprover = '([^']+)';/.exec(dart)[1];
		expect(LEAVE_ADMINS).toEqual([approver]);
	});

	it("is the administrator, and none of the four company logins", () => {
		expect(leaveAdmin(ADMIN)).toBe(true);
		expect(leaveAdmin(" HR@MannaRubber.com ")).toBe(true);
		for (const u of SALARY_VIEW_ONLY) expect(leaveAdmin(u)).toBe(false);
	});
});

describe("the Approvals page", () => {
	const draw = async (user, apptab = "attendance") => {
		act(() => set({ ...loadedState(), user, apptab }));
		let view;
		await act(async () => { view = render(<Provider store={store}><Approvals /></Provider>); });
		return view;
	};
	const tabNames = (view) => [...view.container.querySelectorAll('[role="tab"]')].map((b) => b.textContent.replace(/\d+$/, "").trim());

	it("shows the Leave queue to the administrator", async () => {
		expect(tabNames(await draw(ADMIN))).toContain("Leave");
	});

	it("shows no Leave queue to anybody else, and moves a remembered Leave tab to the next queue", async () => {
		const view = await draw("mannatreads@gmail.com", "leave");
		expect(tabNames(view)).not.toContain("Leave");
		expect(getState().apptab).toBe("attendance");
	});
});

describe("the page load", () => {
	const leaveReads = () => axios.get.mock.calls.filter(([url]) => String(url).includes("Leave%20Application"));

	it("reads open leave for the administrator", async () => {
		axios.get.mockClear();
		act(() => set({ user: ADMIN }));
		await load();
		expect(leaveReads().length).toBeGreaterThan(0);
	});

	it("does not even ask for open leave for any other login", async () => {
		axios.get.mockClear();
		act(() => set({ user: "hitechrubber@gmail.com" }));
		await load();
		expect(leaveReads()).toEqual([]);
	});
});
