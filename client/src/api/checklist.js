/* ---------------------------------------------------------------------------
   Checklist, as the HRDashboard reference draws it (21 October 2026), on the
   site's own records:

   - the to-do list is Frappe's ToDo — the same list the desk's bell keeps —
     assigned to the signed-in person, without subtasks (D12: ToDo has none);
   - onboarding and offboarding are hrms's Employee Onboarding and Employee
     Separation, and one person's checklist is the Tasks their activities made;
   - the settings are hrms's two templates, read.

   On Board (`/onboard`: the employee's Google Form, letters, documents,
   assets) is a different job and is untouched.
   --------------------------------------------------------------------------- */

import { apiCreate, apiWrite, getDoc, listAll } from "@/api/client";
import { getState, set } from "@/store";

const TODO = ["name", "description", "status", "priority", "date", "allocated_to", "reference_type", "reference_name", "assigned_by", "creation"];

/** The signed-in person's to-dos, open and closed. */
export async function loadTodos({ fresh = false } = {}) {
	const cur = getState().todos;
	if (!fresh && (cur.state === "loading" || cur.state === "ok")) return;
	set({ todos: { ...cur, state: "loading" } });
	const user = getState().user;
	const rows = await listAll("ToDo", TODO, [["allocated_to", "=", user], ["status", "!=", "Cancelled"]], 500).catch(() => null);
	set({ todos: rows ? { state: "ok", rows } : { state: "error", rows: [] } });
}

/** A new to-do for the signed-in person. */
export async function addTodo({ description, date, priority }) {
	const doc = { description: description.trim(), priority: priority || "Medium", allocated_to: getState().user, status: "Open" };
	if (date) doc.date = date;
	await apiCreate("ToDo", doc);
	await loadTodos({ fresh: true });
}

/** Tick or untick one: Closed is done, Open is not. */
export async function setTodo(name, done) {
	const status = done ? "Closed" : "Open";
	const r = await apiWrite("ToDo", name, { status });
	if (!r.ok) throw new Error(r.error || "The site would not change it.");
	const { todos } = getState();
	set({ todos: { ...todos, rows: todos.rows.map((t) => (t.name === name ? { ...t, status } : t)) } });
}

/** Change one: its words, date or priority. */
export async function saveTodo(name, patch) {
	const r = await apiWrite("ToDo", name, patch);
	if (!r.ok) throw new Error(r.error || "The site would not save it.");
	await loadTodos({ fresh: true });
}

/** Cancelled, never deleted: the desk keeps cancelled to-dos too. */
export const cancelTodo = (name) => saveTodo(name, { status: "Cancelled" });

/* ---- onboarding and offboarding ------------------------------------------- */

export const KINDS = {
	Onboarding: { doctype: "Employee Onboarding", template: "Employee Onboarding Template", date: "date_of_joining" },
	Offboarding: { doctype: "Employee Separation", template: "Employee Separation Template", date: "boarding_begins_on" },
};
const BOARD = ["name", "employee", "employee_name", "department", "designation", "company", "boarding_status", "creation"];

/** Every onboarding and separation, read together. */
export async function loadBoarding({ fresh = false } = {}) {
	const cur = getState().boarding;
	if (!fresh && (cur.state === "loading" || cur.state === "ok")) return;
	set({ boarding: { ...cur, state: "loading" } });
	const read = (kind) => listAll(KINDS[kind].doctype, BOARD.concat(KINDS[kind].date), null, 500)
		.catch(() => listAll(KINDS[kind].doctype, BOARD, null, 500)).catch(() => null);
	const [on, off] = await Promise.all([read("Onboarding"), read("Offboarding")]);
	set({ boarding: { state: on || off ? "ok" : "error", Onboarding: on || [], Offboarding: off || [] } });
}

/** One person's checklist: the document, its activities, and the Task each
    activity made — whose status is what "done" means. */
export async function readChecklist(kind, name) {
	const doc = await getDoc(KINDS[kind].doctype, name);
	if (!doc) return null;
	const acts = doc.activities || [];
	const names = acts.map((a) => a.task).filter(Boolean);
	const tasks = names.length
		? await listAll("Task", ["name", "subject", "status", "exp_end_date"], [["name", "in", names]]).catch(() => [])
		: [];
	const byName = new Map(tasks.map((t) => [t.name, t]));
	return { doc, items: acts.map((a) => ({ ...a, taskDoc: byName.get(a.task) || null })) };
}

/** Tick one activity: its Task Completed, or back to Open. */
export async function setTask(name, done) {
	const r = await apiWrite("Task", name, { status: done ? "Completed" : "Open" });
	if (!r.ok) throw new Error(r.error || "The site would not change it.");
}

/** The templates, read (Checklist settings). */
export const readTemplates = (kind) => listAll(KINDS[kind].template, ["name", "designation", "department", "company"]).catch(() => []);
export const readTemplate = (kind, name) => getDoc(KINDS[kind].template, name);
