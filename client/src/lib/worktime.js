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
