import { SAL_REV_COMP, SAL_REV_ROWS, SAL_REV_TWINS } from "../data/masters.js";

/* ---------------------------------------------------------------------------
   What a salary revision becomes, worked out without a site.

   Everything here is a pure function of what somebody typed, so the decision
   that matters most on this dashboard — which figure lands on which half of a
   Salary Structure, and which figures must never land on one at all — can be
   argued about in `tests/salary.test.js` with no browser and no ERPNext. The
   writing itself is `api/salary.js`; this is only what it will do.

   Relative import, not the `@` alias, for exactly that reason: `npm test` runs
   these files in Node, where the alias does not exist. Same rule as
   `lib/rules.js` and `routes/paths.js`. CLAUDE.md §2.
   --------------------------------------------------------------------------- */

/** Amounts as people here actually type them: "1,20,000" is how a lakh is
    written, and a box that refuses it is a box that argues with whoever is
    filling the form.

    Anything left that is not a number reads as nothing rather than as zero. A
    half-typed "12," must never become a figure in a subtotal, and it must never
    reach a Salary Structure as an amount. */
export const num = (v) => {
	const t = String(v == null ? "" : v).trim();
	const n = Number(t.replace(/[,\s]/g, ""));
	return t && isFinite(n) ? n : null;
};

/** Frappe wants an abbreviation on a Salary Component and generates one from
    initials on its own form. Generated here instead so a collision is resolved
    before the site sees it — two components sharing an abbreviation is the kind
    of thing that surfaces months later as an unreadable payslip column. */
export function abbrFor(name, taken) {
	const base = (name.match(/[A-Za-z0-9]+/g) || [])
		.map((w) => w[0].toUpperCase())
		.join("")
		.slice(0, 5) || "SC";
	if (!taken.has(base)) return base;
	for (let i = 2; i < 100; i++) {
		if (!taken.has(base + i)) return base + i;
	}
	return base + Date.now().toString().slice(-4);
}

/** What a save would do, worked out before anything is written.

    Separated from the writing on purpose: this is what the form shows in its
    confirmation, so what somebody agrees to is computed by the same code that
    then does it, rather than by a sentence beside it that can drift.

    @param {{on: string, cells: Record<string, {amt?: string, ref?: string}>}} draft
    @returns {{rows: object[], skipped: object[], base: number|null, twins: string[][]}} */
export function planRevision(draft) {
	const rows = [];
	const skipped = [];
	let base = null;

	for (const r of SAL_REV_ROWS) {
		if (!r.desc) continue;
		const cell = draft.cells?.[r.desc];
		const amt = num(cell?.amt);
		if (amt == null) continue;

		const m = SAL_REV_COMP[r.desc];
		if (m.skip) {
			/* CTC TOTAL is a skip that still lands somewhere: hrms carries the same
			   idea as the assignment's `base` rather than as a component. The other
			   two are sums of the rows around them, and writing a sum as a component
			   counts the same money twice. */
			if (r.desc === "CTC TOTAL") base = amt;
			skipped.push({ desc: r.desc, amt, why: m.skip });
			continue;
		}
		rows.push({
			desc: r.desc,
			comp: m.comp,
			kind: m.kind,
			ctc: Boolean(m.ctc),
			amt,
			ref: (cell?.ref || "").trim(),
		});
	}

	/* Their form asks for professional tax, ESI and PF twice — once as a
	   deduction and once restated as CTC. Only one of each pair moves money, so
	   both being typed is worth saying out loud before a draft is written. Not a
	   refusal: it is their form that asks twice, and the figures are the ones
	   somebody typed. Rounding in the safe direction here means a sentence a
	   human reads, not a save that fails. */
	const typed = new Set(rows.map((r) => r.desc));
	const twins = SAL_REV_TWINS.filter(([a, b]) => typed.has(a) && typed.has(b));

	return { rows, skipped, base, twins };
}
