/* ---------------------------------------------------------------------------
   Employee Working Time — which shift each person is measured against.

   Asked for on 16 September 2026: HR or an admin sets an employee's working
   time, and the working time differs from company to company. On this site a
   working time is a `Shift Type` (start and end, e.g. 08:30–17:30) and the
   person's is `Employee.default_shift`, which is what hrms's shift job falls
   back to when nobody is rostered with a dated Shift Assignment.

   It had its own page until 24 September 2026, when it was folded into Manage
   Shift; what is left here is the shift picker Regularization's "Set as working
   time" uses. Pure.
   --------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   Day, Night — and for supervisors, General (16 September 2026).

   Every company has its own three Shift Types on the site, named with the
   company's abbreviation so each can keep its own hours:

       HRI-Day Shift     08:30–20:30      MRPPL-…, MT-…, MTR-… the same
       HRI-Night Shift   20:30–08:30      (times changed per company on
       HRI-General Shift 09:00–18:00       Manage Shift ✎)

   HR's shift sheet of 8 October 2026 retires these, and the company's shifts
   off it are offered after them (`SHIFT_PREFIX`); the three stay here for a
   site the sheet has not been applied to.

   Workers are offered Day and Night. A supervisor — a designation with
   "supervisor" in it — is offered all three. Shifts already in use by the
   company (named some other way, from before) stay offered, so nobody on one
   is shown a list that no longer holds their own shift. Those come first in
   the picker; every other shift on the site follows them (`shiftOptions`).
   --------------------------------------------------------------------------- */

export const SHIFT_KINDS = ["Day Shift", "Night Shift", "General Shift"];

/* HR's shift sheet of 8 October 2026 (tools/apply_shift_sheet.py) retires the
   three above and names every shift by its company, in the company's own
   spelling rather than the Company record's — `Manna Rubber Products Pvt.Ltd`
   for `Manna Rubber Products Private Limited`. By abbreviation, because that is
   what a Company row carries. Hi-Tech Pretreads has no Company on the site, so
   its shifts are offered among everybody's. */
export const SHIFT_PREFIX = {
	MRPPL: "Manna Rubber Products Pvt.Ltd-",
	HRI: "Hi-Tech Rubber Industries-",
	MTR: "Manna Tyre Retreads-",
	MT: "MANNA TREADS PVT.LTD-",
};

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
	const prefix = (SHIFT_PREFIX[abbr] || "").toLowerCase();
	const sheet = prefix ? names.filter((n) => n.toLowerCase().startsWith(prefix)).sort() : [];
	const own = (abbr ? kinds.map((k) => `${abbr}-${k}`).filter((n) => names.includes(n)) : []).concat(sheet);
	const used = new Set((employees || []).filter((x) => x.company === (e && e.company) && x.default_shift).map((x) => x.default_shift));
	if (e && e.default_shift) used.add(e.default_shift);
	const legacy = [...used].filter((n) => !own.includes(n) && !SHIFT_KINDS.some((k) => n.endsWith("-" + k))).sort();
	/* A company with none of its own yet (Manna Tyre UAE, say) is offered every shift. */
	return own.length ? own.concat(legacy) : names;
}

/**
 * Every shift on the site, split for the picker: this person's own choices
 * first, then all the rest. Asked for on 1 October 2026 — a list of two hid the
 * shift HR was looking for whenever somebody worked to another company's hours,
 * so the suggestion now leads the list rather than being all of it.
 *
 * @returns {{suggested: string[], others: string[]}}
 */
export function shiftOptions(e, shiftTypes, companies, employees) {
	const names = (shiftTypes || []).map((x) => (typeof x === "string" ? x : x.name));
	const suggested = shiftChoices(e, shiftTypes, companies, employees);
	const others = names.filter((n) => !suggested.includes(n)).sort();
	return { suggested, others };
}
