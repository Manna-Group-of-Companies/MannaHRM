import { apiCreate, apiWrite, listAll } from "@/api/client";
import { load } from "@/api/load";
import { LEVELS, suggestedWrites } from "@/lib/hierarchy";

/* ---------------------------------------------------------------------------
   Employees → Hierarchy Chart: the seven levels on the site, and saving a
   suggested one onto a person.

   Every write goes as the signed-in person, so whether they may make a grade
   or set one is their roles on the site, and the site's refusal is shown in
   its words. Nothing here decides anything (CLAUDE.md §1); the one rule — which
   level a designation is — is lib/hierarchy.js, and it only suggests.
   --------------------------------------------------------------------------- */

/** The Employee Grades on the site, by name. `null` when the read failed, so
    the page can tell "none made yet" from "could not ask". */
export async function readGrades() {
	const rows = await listAll("Employee Grade", ["name"]).catch(() => null);
	return rows ? rows.map((r) => r.name) : null;
}

/** Make whichever of the seven levels the site does not have, in order. Stops
    at the first refusal and says which, so a half-made ladder is named rather
    than discovered. */
export async function makeGrades(have) {
	const made = [];
	for (const level of LEVELS) {
		if ((have || []).includes(level)) continue;
		try {
			await apiCreate("Employee Grade", { __newname: level });
			made.push(level);
		} catch (e) {
			return { ok: false, made, msg: `The site refused to make the grade ${level}: ${e.message}` };
		}
	}
	return { ok: true, made, msg: made.length ? `Made ${made.join(", ")}.` : "All seven levels are on the site." };
}

/**
 * Save every suggestion as the person's grade.
 *
 * One PUT per person; a refusal is collected and the rest go on, because a
 * grade is one field on one record and the thirtieth person's save does not
 * depend on the first's. The list is reread afterwards so the chart draws what
 * the site holds, not what was sent.
 */
export async function saveSuggested(placed) {
	const writes = suggestedWrites(placed);
	const refused = [];
	let saved = 0;
	for (const [name, patch] of writes) {
		const r = await apiWrite("Employee", name, patch);
		if (r.ok) saved += 1;
		else refused.push(`${name}: ${r.error}`);
	}
	if (writes.length) await load().catch(() => null);
	return {
		ok: refused.length === 0,
		saved,
		msg: (saved ? `${saved} ${saved === 1 ? "grade" : "grades"} saved.` : "Nothing to save.")
			+ (refused.length ? ` Refused — ${refused.join("; ")}` : ""),
	};
}
