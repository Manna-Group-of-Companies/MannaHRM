import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { Provider } from "react-redux";

import CompanyChart from "@/features/employees/CompanyChart";
import { chartNote, startFrom } from "@/lib/orgchart";
import { store, set, resetStore } from "@/store";
import { loadedState } from "./fixture";

/* Employees → Hierarchy Chart → a company: the chart HR draws. The site is
   stubbed at the network calls, so api/orgchart.js runs for real. */

/* jsdom has no PointerEvent, so a pointer event it fires carries no
   coordinates. A MouseEvent carries them, and is what a browser's is. */
if (!window.PointerEvent) {
	window.PointerEvent = class extends MouseEvent {
		constructor(type, init = {}) {
			super(type, init);
			this.pointerId = init.pointerId ?? 1;
		}
	};
}

let site;
let writes;

vi.mock("@/api/client", async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		listAll: async () => [],
		getDoc: async (dt, name) => (dt === "Company" ? { name, ...(site.field ? { custom_org_chart: site.field } : {}) } : null),
		api: async (path, params) => (path.includes("form.load.getdoc")
			? { docinfo: { comments: site.comments.filter((c) => c.reference_name === params.name) } }
			: {}),
		apiCall: async (method, body) => {
			writes.push(["call", method, body]);
			site.comments.push({ ...body, creation: `2026-10-14 10:0${site.comments.length}:00` });
			return {};
		},
		apiWrite: async (dt, name, patch) => { writes.push(["write", dt, name, patch]); return { ok: true }; },
		whoami: async () => "hr@mannarubber.com",
	};
});

const CO = "Manna Treads";
const EMPS = [
	{ name: "E1", employee_name: "Ravi Varma", employee_number: "MT-1", company: CO, status: "Active", designation: "Maintenance Manager" },
	{ name: "E2", employee_name: "Anu Joseph", employee_number: "MT-2", company: CO, status: "Active", designation: "Stores In-charge" },
	{ name: "E3", employee_name: "Bindu Paul", employee_number: "MT-3", company: CO, status: "Active", designation: "Accounts Manager" },
];

async function draw() {
	let view;
	await act(async () => { view = render(<Provider store={store}><CompanyChart /></Provider>); });
	return view;
}

const button = (view, label) => [...view.container.querySelectorAll("button")].find((b) => b.textContent === label);
const cardOf = (view, who) => view.getByLabelText(`${who} — drag, or use the arrow keys, to move`);

beforeEach(() => {
	resetStore();
	act(() => set({
		...loadedState(), employees: EMPS,
		companies: [{ name: "Manna Group Headquarters" }, { name: CO }],
		hcCompany: CO, sepState: "ok", seps: [],
	}));
	site = { comments: [], field: "" };
	writes = [];
});

describe("drawing a company's chart", () => {
	it("starts the drawing from the chart as it is drawn now, with nothing saved until Save", async () => {
		const view = await draw();
		await act(async () => { button(view, "Edit chart").click(); });
		expect(cardOf(view, "Ravi Varma")).toBeTruthy();
		expect(cardOf(view, "Anu Joseph")).toBeTruthy();
		expect(writes).toEqual([]);
	});

	it("moves a card where it is dragged, snapped to the grid", async () => {
		const view = await draw();
		await act(async () => { button(view, "Edit chart").click(); });
		const card = cardOf(view, "Anu Joseph");
		const left = parseInt(card.style.left, 10);
		const top = parseInt(card.style.top, 10);
		await act(async () => {
			fireEvent.pointerDown(card, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
			fireEvent.pointerMove(card, { clientX: 163, clientY: 141, pointerId: 1 });
			fireEvent.pointerUp(card, { pointerId: 1 });
		});
		expect(parseInt(cardOf(view, "Anu Joseph").style.left, 10)).toBe(left + 64);
		expect(parseInt(cardOf(view, "Anu Joseph").style.top, 10)).toBe(top + 40);
	});

	it("pans the chart when empty space is dragged, and leaves the cards where they are", async () => {
		const view = await draw();
		await act(async () => { button(view, "Edit chart").click(); });
		const wrap = view.container.querySelector(".hcfreewrap");
		/* jsdom lays nothing out, so the box's scroll position is held here. */
		let left = 300;
		let top = 200;
		Object.defineProperty(wrap, "scrollLeft", { get: () => left, set: (v) => { left = v; } });
		Object.defineProperty(wrap, "scrollTop", { get: () => top, set: (v) => { top = v; } });
		const card = cardOf(view, "Anu Joseph").style.left;
		await act(async () => {
			fireEvent.pointerDown(wrap, { clientX: 500, clientY: 400, button: 0, pointerId: 2 });
			fireEvent.pointerMove(wrap, { clientX: 440, clientY: 330, pointerId: 2 });
			fireEvent.pointerUp(wrap, { pointerId: 2 });
		});
		expect([left, top]).toEqual([360, 270]);
		expect(cardOf(view, "Anu Joseph").style.left).toBe(card);
		expect(wrap.className).not.toContain("hcpanning");
	});

	it("moves a focused card a grid step with the arrow keys", async () => {
		const view = await draw();
		await act(async () => { button(view, "Edit chart").click(); });
		const left = parseInt(cardOf(view, "Bindu Paul").style.left, 10);
		await act(async () => { fireEvent.keyDown(cardOf(view, "Bindu Paul"), { key: "ArrowRight" }); });
		expect(parseInt(cardOf(view, "Bindu Paul").style.left, 10)).toBe(left + 8);
	});

	it("adds a vacant seat and a title, and removes a card", async () => {
		const view = await draw();
		await act(async () => { button(view, "Edit chart").click(); });
		fireEvent.change(view.getByLabelText("Vacant seat to add"), { target: { value: "Logistics Head" } });
		await act(async () => { button(view, "Add vacant seat").click(); });
		expect(cardOf(view, "Logistics Head (vacant)")).toBeTruthy();
		fireEvent.change(view.getByLabelText("Title to add"), { target: { value: "Department heads" } });
		await act(async () => { button(view, "Add title").click(); });
		expect(cardOf(view, "Department heads")).toBeTruthy();
		await act(async () => { view.getByLabelText("Remove Bindu Paul").click(); });
		expect(view.queryByLabelText("Bindu Paul — drag, or use the arrow keys, to move")).toBeNull();
	});

	it("offers only employees not already on the chart", async () => {
		const view = await draw();
		await act(async () => { button(view, "Edit chart").click(); });
		await act(async () => { view.getByLabelText("Remove Bindu Paul").click(); });
		const options = [...view.getByLabelText("Employee to add").options].map((o) => o.value).filter(Boolean);
		expect(options).toEqual(["E3"]);
	});

	it("saves as a comment on the Company where the site has no field, and draws it from then on", async () => {
		const view = await draw();
		await act(async () => { button(view, "Edit chart").click(); });
		await act(async () => { button(view, "Save chart").click(); });
		const call = writes.find((w) => w[0] === "call");
		expect(call[2]).toMatchObject({ reference_doctype: "Company", reference_name: CO });
		expect(call[2].content.startsWith("Org chart<br>")).toBe(true);
		expect(view.container.textContent).toContain("Chart saved.");
		/* The drawn chart, not the edit, and not the automatic rows. */
		expect(button(view, "Edit chart")).toBeTruthy();
		expect(view.container.querySelector(".hcfree:not(.hcedit)")).not.toBeNull();
	});

	it("draws the latest chart comment when the company has one", async () => {
		const chart = startFrom([{ label: "Top", items: [{ kind: "person", emp: "E3" }] }]);
		site.comments = [{ reference_name: CO, creation: "2026-10-14 09:00:00", content: chartNote(chart).split("\n").join("<br>") }];
		const view = await draw();
		expect(view.container.querySelectorAll(".hcfcard")).toHaveLength(2);
		expect(view.container.textContent).toContain("Bindu Paul");
		expect(view.container.textContent).not.toContain("Ravi Varma");
	});

	it("saves into the field where the site has it", async () => {
		const chart = startFrom([{ label: "Top", items: [{ kind: "person", emp: "E3" }] }]);
		site.field = JSON.stringify(chart);
		const view = await draw();
		await act(async () => { button(view, "Edit chart").click(); });
		await act(async () => { button(view, "Save chart").click(); });
		expect(writes.map((w) => w[0])).toEqual(["write"]);
		expect(writes[0].slice(0, 2)).toEqual(["write", "Company"]);
		expect(JSON.parse(writes[0][3].custom_org_chart).cards).toHaveLength(2);
	});

	it("Remove drawn chart brings the automatic chart back", async () => {
		const chart = startFrom([{ label: "Top", items: [{ kind: "person", emp: "E3" }] }]);
		site.comments = [{ reference_name: CO, creation: "2026-10-14 09:00:00", content: chartNote(chart).split("\n").join("<br>") }];
		const view = await draw();
		await act(async () => { button(view, "Edit chart").click(); });
		await act(async () => { button(view, "Remove drawn chart").click(); });
		expect(view.container.querySelector(".hcfree")).toBeNull();
		expect(view.container.textContent).toContain("Drawn chart removed.");
	});
});
