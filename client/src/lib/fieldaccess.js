/* ---------------------------------------------------------------------------
   Settings → Security → Employee fields: which Employee fields a login may
   type into, only see, or not be shown — on Create Employee ("new") and on
   Employee Profile's edit ("edit"), set separately, because "set once when
   they join, never changed after" is the rule most of these exist for.

   Held on the site as `Manna HR Settings.employee_field_access`:

     {"new": {"attendance_device_id": "read"}, "edit": {"employee_number": "read", "ctc": "hidden"}}

   Only "read" and "hidden" are stored; a field with no entry is "write", which
   is how both forms behaved before this existed.

   **The rules bind every login except the page admin** (data/menus.js
   PAGE_ADMINS) — the one who sets them would otherwise be able to lock
   themselves out of a field with no way back but Desk.

   **Read and write are enforced by the site; hidden is only a screen.** The
   site refuses a change to a field that is "read" or "hidden" for this login
   (`rules.employee_access_refusals`), so a hidden field cannot be written. But
   every login that can read an Employee still reads every field of it through
   the API — hiding a field takes it off these two forms and nothing more.
   --------------------------------------------------------------------------- */

import { NEW_EMP_ELSEWHERE, NEW_EMP_STEPS } from "@/data/employees";
import { PROFILE_HEAD, PROFILE_PANES, PROFILE_TABS } from "@/data/profile";
import { PAGE_ADMINS } from "@/data/menus";

export const FORMS = ["new", "edit"];
export const LEVELS = ["write", "read", "hidden"];

const login = (user) => String(user || "").trim().toLowerCase();

/** Whether the rules pass this login by. */
export const exempt = (user) => PAGE_ADMINS.includes(login(user));

/** The rules the site holds, cleaned. Anything that is not a form, a fieldname
    and "read" or "hidden" is dropped rather than obeyed. */
export function parseFieldAccess(text) {
	let raw;
	try { raw = typeof text === "string" ? JSON.parse(text || "{}") : text; } catch { return {}; }
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const out = {};
	for (const form of FORMS) {
		const rows = raw[form];
		if (!rows || typeof rows !== "object" || Array.isArray(rows)) continue;
		for (const [field, level] of Object.entries(rows)) {
			if (/^[a-z0-9_]+$/.test(field) && (level === "read" || level === "hidden")) {
				(out[form] ||= {})[field] = level;
			}
		}
	}
	return out;
}

/** "write", "read" or "hidden": what this login may do with one field on one
    form. Given several fieldnames — a profile row's alternatives — the
    tightest of them, so a rule set on the row cannot be dodged by the other
    spelling. */
export function accessFor(rules, form, fields, user) {
	if (exempt(user)) return "write";
	const names = Array.isArray(fields) ? fields : [fields];
	let most = 0;
	for (const f of names) most = Math.max(most, LEVELS.indexOf(rules?.[form]?.[f] || "write"));
	return LEVELS[most];
}

/** The fieldnames this login may not write on this form — what a payload has
    to leave out. */
export const lockedFields = (rules, user, form) =>
	exempt(user) ? new Set() : new Set(Object.keys(rules?.[form] || {}));

/* ---------------------------------------------------------------------------
   The list the Security page draws: every Employee field either form has, once.
   --------------------------------------------------------------------------- */

/* Fields Create Employee cannot do without. Locking one would leave everybody
   but the admin unable to create anybody — so these are always "write" there.
   Machine Code is on it though the wizard asks for it only for a machine
   punch: without it every punch that person makes is dropped
   (docs/NEW_EMPLOYEE.md), and a login that cannot type it is a login that
   enrols people who are never paid for turning up. */
const REQUIRED_NEW = new Set([
	...NEW_EMP_STEPS.flatMap((st) => st[2].flatMap((g) => g[1])).filter((r) => r[0] && r[3]).map((r) => r[0]),
	...Object.keys(NEW_EMP_ELSEWHERE),
	"attendance_device_id",
]);

/** Whether a rule may change this field on this form. */
export const canLock = (form, field) => !(form === "new" && REQUIRED_NEW.has(field));

const PANE_LABEL = Object.fromEntries(
	PROFILE_TABS.flatMap((t) => [t, ...(t[3] || [])]).map((t) => [t[0], t[1]]),
);

/** `[{ fields, label, group, onNew, onEdit }]` in the order the forms draw
    them: Create Employee's steps first, then the profile's panes for what
    the wizard does not ask. A profile row naming a field the wizard has is
    merged into the wizard's entry, so each field is one row with two
    switches. */
function buildList() {
	const out = [];
	const byField = new Map();
	const add = (names, label, group, form) => {
		const hit = names.map((n) => byField.get(n)).find(Boolean);
		if (hit) {
			hit[form === "new" ? "onNew" : "onEdit"] = true;
			for (const n of names) if (!hit.fields.includes(n)) { hit.fields.push(n); byField.set(n, hit); }
			return;
		}
		const row = { fields: [...names], label, group, onNew: form === "new", onEdit: form === "edit" };
		out.push(row);
		for (const n of names) byField.set(n, row);
	};
	for (const [, title, groups] of NEW_EMP_STEPS) {
		for (const [, rows] of groups) {
			for (const r of rows) if (r[0] && !NEW_EMP_ELSEWHERE[r[0]]) add([r[0]], r[1], "New employee · " + title, "new");
		}
	}
	const profileRows = [["", PROFILE_HEAD], ...Object.entries(PROFILE_PANES)
		.flatMap(([key, pane]) => (pane.groups || []).map((g) => [key, g[1]]))];
	for (const [key, rows] of profileRows) {
		for (const [label, field] of rows) {
			const names = field == null ? [] : Array.isArray(field) ? field : [field];
			if (names.length) add(names, label, "Profile · " + (PANE_LABEL[key] || "Header"), "edit");
		}
	}
	return out;
}

export const ACCESS_FIELDS = buildList();
