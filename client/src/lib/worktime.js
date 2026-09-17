/* ---------------------------------------------------------------------------
   Employee Working Time — which shift each person is measured against.

   Asked for on 16 September 2026: HR or an admin sets an employee's working
   time, and the working time differs from company to company. On this site a
   working time is a `Shift Type` (start and end, e.g. 08:30–17:30) and the
   person's is `Employee.default_shift`, which is what hrms's shift job falls
   back to when nobody is rostered with a dated Shift Assignment.

   Pure — the page does the reading and the one PUT per person.
   --------------------------------------------------------------------------- */

import { clockMinutes } from "./roster.js";

const two = (n) => String(n).padStart(2, "0");

/** `"8:30:00"` → `"08:30"`. */
export function hhmmOf(t) {
	const m = clockMinutes(t);
	return m == null ? "" : `${two(Math.floor(m / 60))}:${two(m % 60)}`;
}

/** A shift as a person reads it: `Office Shift · 08:30–17:30 (9:00 hrs)`. */
export function shiftText(name, windows) {
	if (!name) return "";
	const w = (windows || {})[name];
	if (!w || clockMinutes(w.start_time) == null || clockMinutes(w.end_time) == null) return name;
	let mins = clockMinutes(w.end_time) - clockMinutes(w.start_time);
	if (mins <= 0) mins += 24 * 60; // a night shift ends the next morning
	return `${name} · ${hhmmOf(w.start_time)}–${hhmmOf(w.end_time)} (${Math.floor(mins / 60)}:${two(mins % 60)} hrs)`;
}

/** The shifts to offer for a company: the ones its people already use first,
    then every other shift on the site — Shift Type carries no company, so a
    shift one company made is not hidden from another. */
export function shiftsFor(company, employees, shiftTypes) {
	const used = new Map();
	for (const e of employees || []) {
		if (company && e.company !== company) continue;
		if (e.default_shift) used.set(e.default_shift, (used.get(e.default_shift) || 0) + 1);
	}
	const names = (shiftTypes || []).map((x) => (typeof x === "string" ? x : x.name));
	for (const n of used.keys()) if (!names.includes(n)) names.push(n);
	return names
		.map((name) => ({ name, people: used.get(name) || 0 }))
		.sort((a, b) => (b.people - a.people) || a.name.localeCompare(b.name));
}

/** Who a change would actually touch: the picked people whose shift differs. */
export function changesFor(people, picked, shift) {
	return (people || []).filter((e) => picked.has(e.name) && (e.default_shift || "") !== (shift || ""));
}


/* ---------------------------------------------------------------------------
   Day, Night — and for supervisors, General (16 September 2026).

   Every company has its own three Shift Types on the site, named with the
   company's abbreviation so each can keep its own hours:

       HRI-Day Shift     08:30–20:30      MRPPL-…, MT-…, MTR-… the same
       HRI-Night Shift   20:30–08:30      (times changed per company on
       HRI-General Shift 09:00–18:00       Manage Shift / Working Time ✎)

   Workers are offered Day and Night. A supervisor — a designation with
   "supervisor" in it — is offered all three. Shifts already in use by the
   company (named some other way, from before) stay offered, so nobody on one
   is shown a list that no longer holds their own shift.
   --------------------------------------------------------------------------- */

export const SHIFT_KINDS = ["Day Shift", "Night Shift", "General Shift"];

/** Whether this person works supervisor shifts. */
export const isSupervisor = (e) => /supervisor/i.test(String((e && e.designation) || ""));

/** The company's abbreviation, off the Company rows the app has loaded. */
export function abbrOf(company, companies) {
	const c = (companies || []).find((x) => x.name === company);
	return (c && c.abbr) || "";
}

/**
 * The shifts to offer one person, in order: Day, Night, then General for a
 * supervisor, then whatever else their company already uses.
 *
 * @param {object} e            the Employee row
 * @param {object[]} shiftTypes `[{name}]` off the site
 * @param {object[]} companies  `[{name, abbr}]`
 * @param {object[]} employees  everybody, to see what the company already uses
 */
export function shiftChoices(e, shiftTypes, companies, employees) {
	const names = (shiftTypes || []).map((x) => (typeof x === "string" ? x : x.name));
	const abbr = abbrOf(e && e.company, companies);
	const kinds = isSupervisor(e) ? SHIFT_KINDS : SHIFT_KINDS.slice(0, 2);
	const own = abbr ? kinds.map((k) => `${abbr}-${k}`).filter((n) => names.includes(n)) : [];
	const used = new Set((employees || []).filter((x) => x.company === (e && e.company) && x.default_shift).map((x) => x.default_shift));
	if (e && e.default_shift) used.add(e.default_shift);
	const legacy = [...used].filter((n) => !own.includes(n) && !SHIFT_KINDS.some((k) => n.endsWith("-" + k))).sort();
	/* A company with none of its own yet (Manna Tyre UAE, say) is offered every shift. */
	return own.length ? own.concat(legacy) : names;
}
