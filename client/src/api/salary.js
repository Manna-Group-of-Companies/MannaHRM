import { apiCreate, getDoc, listAll } from "@/api/client";
import { abbrFor, planRevision } from "@/lib/salary";

/* Re-exported so the form has one import for the whole feature, and so the
   parser the subtotals use is provably the parser the writer uses. */
export { num, planRevision } from "@/lib/salary";

/* ---------------------------------------------------------------------------
   Salary Master's SAVE, and the only place on this site that writes payroll.

   What it makes, in this order and no other:

     1. any `Salary Component` a typed row needs and the site does not have
     2. one `Salary Structure` holding the typed amounts        — DRAFT
     3. one `Salary Structure Assignment` for the person and date — DRAFT

   **Both documents are drafts and this cannot make them anything else.** The
   proxy refuses a `docstatus` that is not 0 (see DRAFT_ONLY in
   server/index.js), and `Salary Slip` and `Payroll Entry` are not reachable
   through it at all. So a save here is a document sitting on the site waiting
   for a human to read and submit it — which is the point. Submitting is the act
   that decides what somebody is paid, and it belongs where the approval and the
   audit trail on it live. CLAUDE.md §1.

   The order matters and the failures are not symmetric. Components first,
   because a structure naming one that does not exist is refused whole. The
   assignment last, because it is the document that points at a person: a
   structure with nobody attached is a leftover, while an assignment pointing at
   a structure that failed to write is a dangling reference. If step 3 fails,
   step 2's structure is left on the site and named in the report rather than
   silently deleted — deleting on a failure path is how the wrong thing gets
   deleted.

   Nothing here is a rule. Every check below is for a clear message before the
   round trip; the site's own validation is what actually decides, and when it
   refuses, its sentence is passed through verbatim rather than reworded.
   --------------------------------------------------------------------------- */

/** A name a person can read on the site, and one that cannot collide with the
    next save. Prompt-named doctype, so this side has to supply it.

    No slashes: a document name goes into a URL on the desk, and a slash there
    breaks the link to the very document somebody is being sent to read. */
async function freeStructureName(emp, on) {
	const stem = `${emp.employee_number || emp.name} ${on}`.replace(/[/\\?#]/g, "-");
	for (let i = 0; i < 50; i++) {
		const name = i ? `${stem} (${i + 1})` : stem;
		if (!(await getDoc("Salary Structure", name))) return name;
	}
	return `${stem} ${Date.now().toString().slice(-5)}`;
}

/** Write one revision. Reports what it did in the same shape whether it got all
    the way or not, because "which of the three steps got through" is the first
    question anybody asks when a save half-fails.

    @param {object} emp the employee document
    @param {object} draft `{ on, cells }`
    @param {(step: string) => void} [say] progress, for the button's label
    @returns {Promise<object>} the report the form draws */
export async function saveRevision(emp, draft, say = () => {}) {
	const on = draft.on;
	const plan = planRevision(draft);
	const report = {
		on,
		employee: emp.name,
		created: [],
		reused: [],
		skipped: plan.skipped,
		twins: plan.twins,
		structure: "",
		assignment: "",
	};

	if (!plan.rows.length) {
		throw new Error(
			"Nothing to save: no wage type has an amount against it."
			+ (plan.skipped.length
				? " The figures typed are all totals, which hrms derives rather than stores."
				: ""),
		);
	}
	if (!emp.company) {
		// Every payroll document is scoped to one company, and guessing which is
		// how somebody ends up on another entity's payroll.
		throw new Error(`${emp.employee_name} has no Company on their Employee record.`);
	}

	/* ------------------------------------------------ 1. the components */
	say("reading components");
	const have = await listAll("Salary Component", ["name", "type", "salary_component_abbr"]);
	const byName = new Map(have.map((c) => [c.name, c]));
	const abbrs = new Set(have.map((c) => c.salary_component_abbr).filter(Boolean));

	for (const r of plan.rows) {
		const found = byName.get(r.comp);
		if (found) {
			/* Reused rather than corrected. If the site's component is the other
			   type — an Earning where this row is a Deduction — the amount would
			   land on the wrong half of the structure, and quietly. Refuse instead:
			   it is one edit on the site, and the alternative is a wrong payslip. */
			if (found.type && found.type !== r.kind) {
				throw new Error(
					`The site's Salary Component "${r.comp}" is an ${found.type}, but `
					+ `${r.desc} is a ${r.kind}. Nothing was written. Fix the component on the `
					+ "site, or change what this row maps to in client/src/data/masters.js.",
				);
			}
			report.reused.push(r.comp);
			continue;
		}
		say(`creating ${r.comp}`);
		const abbr = abbrFor(r.comp, abbrs);
		abbrs.add(abbr);
		await apiCreate("Salary Component", {
			salary_component: r.comp,
			salary_component_abbr: abbr,
			type: r.kind,
			/* Employer cost carried inside the CTC. Without this flag an employer's
			   PF contribution is paid to the employee as salary. */
			do_not_include_in_total: r.ctc ? 1 : 0,
			/* Their form's figures are amounts somebody typed, not formulae. Saying
			   so here stops hrms treating a blank formula as one. */
			amount_based_on_formula: 0,
		});
		byName.set(r.comp, { name: r.comp, type: r.kind });
		report.created.push(r.comp);
	}

	/* ------------------------------------------------ 2. the structure */
	say("writing the structure");
	const detail = (r) => ({
		doctype: "Salary Detail",
		parentfield: r.kind === "Earning" ? "earnings" : "deductions",
		parenttype: "Salary Structure",
		salary_component: r.comp,
		amount: r.amt,
		amount_based_on_formula: 0,
		do_not_include_in_total: r.ctc ? 1 : 0,
	});

	const name = await freeStructureName(emp, on);
	const structure = await apiCreate("Salary Structure", {
		name,
		company: emp.company,
		currency: "INR",
		payroll_frequency: "Monthly",
		is_active: "Yes",
		salary_slip_based_on_timesheet: 0,
		docstatus: 0,
		earnings: plan.rows.filter((r) => r.kind === "Earning").map(detail),
		deductions: plan.rows.filter((r) => r.kind === "Deduction").map(detail),
	});
	report.structure = structure.name;

	/* ------------------------------------------------ 3. the assignment */
	say("writing the assignment");
	try {
		const asg = await apiCreate("Salary Structure Assignment", {
			employee: emp.name,
			salary_structure: structure.name,
			from_date: on,
			company: emp.company,
			currency: "INR",
			// CTC TOTAL if it was typed. hrms carries it here rather than as a row.
			base: plan.base ?? 0,
			variable: 0,
			docstatus: 0,
		});
		report.assignment = asg.name;
	} catch (e) {
		/* The structure is real and named, so say so. Deleting it here would be
		   this code deciding to remove a document it cannot see the rest of. */
		e.message = `The structure saved as "${structure.name}", but the assignment `
			+ `naming ${emp.employee_name} was refused:\n\n${e.message}`;
		throw e;
	}

	return report;
}

/** Later-dated assignments for the same person — what their second button
    claims to rewrite.

    Drafts can be repointed at the new structure. Submitted ones cannot be
    touched from here at all and are only listed: amending a submitted
    assignment changes the basis of pay somebody may already have been given,
    and that wants a human and an approval, not a button on a dashboard. */
export async function laterAssignments(emp, on) {
	const rows = await listAll(
		"Salary Structure Assignment",
		["name", "from_date", "salary_structure", "docstatus"],
		[["employee", "=", emp.name], ["from_date", ">", on]],
	);
	return {
		drafts: rows.filter((r) => r.docstatus === 0),
		submitted: rows.filter((r) => r.docstatus === 1),
	};
}
