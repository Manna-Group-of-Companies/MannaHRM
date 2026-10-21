import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import Checklist from "@/features/checklist/Checklist";
import { http } from "@/api/client";
import { store, set, getState, resetStore } from "@/store";
import { todayIso } from "@/lib/format";
import { loadedState } from "./fixture";

/* ---------------------------------------------------------------------------
   Checklist as the HRDashboard reference draws it (21 October 2026): the
   signed-in person's to-dos on ToDo, and one person's onboarding as the Tasks
   its activities made. Nothing is deleted: a to-do is cancelled.
   --------------------------------------------------------------------------- */

const HR = "hr@mannarubber.com";
const today = todayIso();
const TODOS = [
	{ name: "T1", description: "<p>Send offer letter</p>", status: "Open", priority: "High", date: "2020-01-01", allocated_to: HR, creation: "2020-01-01 10:00:00" },
	{ name: "T2", description: "Order a laptop", status: "Open", priority: "Medium", date: today, allocated_to: HR, creation: `${today} 10:00:00` },
	{ name: "T3", description: "Old one", status: "Closed", priority: "Low", date: "2020-01-01", allocated_to: HR, creation: "2020-01-01 10:00:00" },
];
const draw = () => render(<Provider store={store}><Checklist /></Provider>);
beforeEach(() => resetStore());
afterEach(() => vi.restoreAllMocks());

describe("the to-do list", () => {
	it("groups what is open into Overdue, Today and Upcoming, as text and never as markup", async () => {
		await act(async () => set({ ...loadedState(), user: HR, section: "checklist", subtab: "overview", todos: { state: "ok", rows: TODOS } }));
		const { container } = draw();
		expect([...container.querySelectorAll(".k-group-h")].map((h) => h.firstChild.textContent)).toEqual(["Overdue", "Today"]);
		expect(container.textContent).toContain("Send offer letter");
		expect(container.innerHTML).not.toContain("<p>Send offer letter</p>");
		expect(container.textContent).not.toContain("Old one");
	});

	it("closes a to-do when it is ticked, and writes nothing else", async () => {
		await act(async () => set({ ...loadedState(), user: HR, section: "checklist", subtab: "overview", todos: { state: "ok", rows: TODOS } }));
		const wrote = [];
		vi.spyOn(http, "put").mockImplementation((url, body) => { wrote.push([decodeURIComponent(url), body]); return Promise.resolve({ data: {} }); });
		const { container } = draw();
		await act(async () => { container.querySelector('input[aria-label="Mark Order a laptop done"]').click(); });
		expect(wrote).toEqual([["/api/resource/ToDo/T2", { status: "Closed" }]]);
		expect(getState().todos.rows.find((t) => t.name === "T2").status).toBe("Closed");
	});

	it("quick-adds a to-do for the signed-in person, due today", async () => {
		await act(async () => set({ ...loadedState(), user: HR, section: "checklist", subtab: "overview", todos: { state: "ok", rows: [] } }));
		const sent = [];
		vi.spyOn(http, "post").mockImplementation((url, body) => { sent.push([decodeURIComponent(url), body]); return Promise.resolve({ data: { data: { name: "T9" } } }); });
		vi.spyOn(http, "get").mockImplementation(() => Promise.resolve({ data: { data: [] } }));
		const { container } = draw();
		const box = container.querySelector('input[aria-label="New task"]');
		fireEvent.change(box, { target: { value: "Book the training room" } });
		expect(box.value).toBe("Book the training room");
		await act(async () => { fireEvent.submit(box.closest("form")); });
		expect(sent[0][0]).toBe("/api/resource/ToDo");
		expect(sent[0][1]).toMatchObject({ description: "Book the training room", allocated_to: HR, date: today, status: "Open" });
	});
});

describe("one person's onboarding", () => {
	it("ticks an activity by completing the Task the site made for it", async () => {
		const doc = {
			name: "HR-EMP-ONB-1", employee: "HR-EMP-00001", employee_name: "Anand Raghavan", boarding_status: "In Process",
			activities: [{ name: "a1", activity_name: "Issue ID card", task: "TASK-1", role: "HR User" }],
		};
		vi.spyOn(http, "get").mockImplementation((url) => Promise.resolve({
			data: { data: decodeURIComponent(String(url)).includes("Employee Onboarding") ? doc : [{ name: "TASK-1", subject: "Issue ID card", status: "Open" }] },
		}));
		const wrote = [];
		vi.spyOn(http, "put").mockImplementation((url, body) => { wrote.push([decodeURIComponent(url), body]); return Promise.resolve({ data: {} }); });
		await act(async () => set({ ...loadedState(), section: "checklist", subtab: "list", chkList: { kind: "Onboarding", name: doc.name } }));
		let view;
		await act(async () => { view = draw(); });
		await vi.waitFor(() => expect(view.container.textContent).toContain("Issue ID card"));
		expect(view.container.textContent).toContain("0/1");
		await act(async () => { view.container.querySelector('input[aria-label="Mark Issue ID card done"]').click(); });
		expect(wrote).toEqual([["/api/resource/Task/TASK-1", { status: "Completed" }]]);
	});
});
