import { entryFor, runState, slipTotals, withoutStructure } from "@/lib/payroll";
import { missingComponents } from "@/lib/payrollsetup";

/* ---------------------------------------------------------------------------
   Payroll → Payroll: where a month is, in the four things that have to happen
   to it, and what to do next.

   Pure, so the sentence a person reads can be argued about without a site.
   **Nothing here computes pay.** It counts documents and reads their states;
   the figures are hrms's (see lib/payroll.js).

   A step is one of
     done     nothing left to do
     warn     something needs a person — said in words, with where to go
     wait     the site is working on it
     todo     not started
     unknown  the site would not say, which is not the same as nothing
   --------------------------------------------------------------------------- */

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The four steps of one month, and the index of the first one not done.

    @param setup   `{ components: Salary Component rows | null }`
    @param extras  Additional Salary rows for the month, or null if refused
    @param pay     the month's read, from api/payroll.js (`state: "ok"` when read)
    @param people  the active employees this month's run is for
    @param end     last day of the month, `YYYY-MM-DD`  */
export function homeSteps({ setup, extras, pay, people, end }) {
	const ok = pay && pay.state === "ok";
	const missing = missingComponents(setup && setup.components);
	const bare = ok ? withoutStructure(people, pay.assignments, end) : null;

	/* 1 — set up */
	let setupStep;
	if (missing === null && bare === null) {
		setupStep = { state: "unknown", text: "Checking what the site has…" };
	} else if (!((missing && missing.length) || (bare && bare.length)) && (missing === null || bare === null)) {
		/* One of the two could not be read and the other is clean: not "done". */
		setupStep = {
			state: "unknown", bare: bare || [], missing: [],
			text: missing === null
				? "Everybody has a salary structure. The salary components could not be checked — this login may not read them."
				: "The salary components are on the site. Who has a salary structure is still being read.",
		};
	} else if ((missing && missing.length) || (bare && bare.length)) {
		const bits = [];
		if (missing && missing.length) {
			bits.push(`${plural(missing.length, "salary component is", "salary components are")} missing on the site: ${missing.map((c) => c.name).join(", ")}`);
		}
		if (bare && bare.length) {
			bits.push(`${plural(bare.length, "person has", "people have")} no salary structure, so they will not be paid`);
		}
		setupStep = { state: "warn", text: bits.join(". ") + ".", bare: bare || [], missing: missing || [] };
	} else {
		setupStep = { state: "done", text: "Salary components are on the site and everybody has a salary structure.", bare: [], missing: [] };
	}

	/* 2 — advances, loans, bonuses */
	let extra;
	if (extras === undefined) {
		extra = { state: "unknown", text: "Checking what has been added for this month…" };
	} else if (!Array.isArray(extras)) {
		extra = { state: "unknown", text: "The site would not say what has been added for this month." };
	} else {
		const live = extras.filter((x) => Number(x.docstatus) < 2);
		const drafts = live.filter((x) => Number(x.docstatus) === 0);
		extra = !live.length
			? { state: "done", text: "Nothing has been added this month — no advance, loan instalment or bonus.", drafts: 0, count: 0 }
			: drafts.length
				? {
					state: "warn", count: live.length, drafts: drafts.length,
					text: `${plural(drafts.length, "item is", "items are")} still a draft. Frappe takes nothing from pay until it is submitted.`,
				}
				: { state: "done", text: `${plural(live.length, "item", "items")} added and submitted.`, drafts: 0, count: live.length };
	}

	/* 3 — run the salary */
	const entry = ok ? entryFor(pay.entries) : null;
	const run = ok ? runState(entry, pay.slips) : "";
	const tot = ok ? slipTotals(pay.slips) : null;
	let runStep;
	if (!ok) runStep = { state: "unknown", text: pay && pay.state === "error" ? pay.err : "Reading the month…" };
	else if (run === "none") runStep = { state: "todo", text: "Salary has not been run for this month yet." };
	else if (run === "draft") runStep = { state: "todo", text: "The people are picked. Create the salary slips to continue." };
	else if (run === "queued") runStep = { state: "wait", text: "Frappe is making the salary slips. Refresh in a minute." };
	else if (run === "failed") runStep = { state: "warn", text: "The salary run failed. Open it in Frappe to see why." };
	else if (run === "slips") runStep = { state: "warn", text: `${plural(tot.count - tot.submitted, "slip is", "slips are")} still a draft. Pay the bank, then press Transferred on Bank Transfer.` };
	else runStep = { state: "done", text: `${plural(tot.count, "slip", "slips")} submitted.` };
	runStep.run = run;

	/* 4 — check and pay */
	const reviewStep = run === "final"
		? { state: "done", text: "Everything is submitted. Download the sheet, the register and the bank file." }
		: ok && tot && tot.count
			? { state: "todo", text: "Look over the Salary Sheet while the slips are in draft." }
			: { state: "todo", text: "The salary sheet comes once the salary slips exist. A preview of the wages register can be made now." };

	const steps = [
		{ id: "setup", title: "Check the set-up", ...setupStep },
		{ id: "extras", title: "Advances, loans and bonuses", ...extra },
		{ id: "run", title: "Run the salary", ...runStep },
		{ id: "review", title: "Check it and pay", ...reviewStep },
	];
	const current = steps.findIndex((s) => s.state !== "done");
	return { steps, current: current < 0 ? steps.length : current, run, totals: tot };
}

/** What the two Excel buttons of "Check it and pay" can make, and the line under
    them that says why one cannot — in words HR can act on.

    The salary sheet is the slips' own, so it needs them. The wages register is
    made from the slips when the month has any; before then it is a preview whose
    figures Excel works out from attendance and the sheet's formulas, not from
    any slip. With every company in the top bar it is every company's register in
    one file, a sheet each (9 October 2026: payroll is paid for all of them, and
    the company's own register file keeps a sheet per company). Each sheet is
    then whichever of the two that company's month holds, and says so at its top.

    @param company  the company in the top bar, or "" for all of them
    @param label    the month in words, "September 2026"
    @param slips    how many live salary slips the month has
    @param state    the month's payroll read: "ok", "error", or anything else while it is read
    @returns {{sheet: string, register: string, mode: "slips"|"preview"|"all"|"", hint: string, line: string}}
      `sheet` and `register` are why each button is off, "" when it is on; `mode`
      is which register the button makes. */
export function exportWhy({ company, label, slips = 0, state }) {
	if (state !== "ok" && state !== "error") {
		const reading = `Reading ${label}'s payroll…`;
		return { sheet: reading, register: reading, mode: "", hint: reading, line: reading };
	}
	const sheet = state === "ok" && slips > 0 ? ""
		: state === "error"
			? "The salary slips could not be read, so the salary sheet cannot be made."
			: `The salary sheet needs salary slips, and there are none for ${label} yet.`;
	if (!company) {
		return {
			sheet, register: "", mode: "all",
			hint: "Every company's Form 25 wages register in one file, a sheet each: from the salary slips where a company has them, a preview where it has not.",
			line: [sheet, "The wages register makes every company's sheet in one file. A company with no salary slips yet gets a preview that Excel works out from attendance and the sheet's formulas — do not pay from those sheets."].filter(Boolean).join(" "),
		};
	}
	if (state === "ok" && slips > 0) {
		return { sheet: "", register: "", mode: "slips", line: "", hint: "The month's salary slips as the company's Form 25 wages register." };
	}
	const works = state === "error"
		? "The wages register beside it still works, as a preview: Excel works it out from attendance and the sheet's formulas."
		: "The wages register beside it works now: Excel works it out from attendance and the sheet's formulas.";
	return {
		sheet, register: "", mode: "preview",
		hint: "A preview of the Form 25 wages register. Excel works it out from attendance and the sheet's formulas, not from salary slips — do not pay from it.",
		line: `${sheet} ${works}`,
	};
}
