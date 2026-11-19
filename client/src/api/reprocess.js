/** Rebuild days from the punches — manna_hr/reprocess_site.py.

    The site decides which days and does it; this only asks. Preview writes
    nothing; apply cancels the days the shift job made, gives punches their
    shift again, and starts the shift job. Never a day hand-written
    (CLAUDE.md §5), never a frozen month, never a leave's day. */

import { apiCall } from "@/api/client";

const BASE = "manna_hr.reprocess_site";

export const previewRebuild = (employees, from, to, scope = "unassigned") =>
	apiCall(`${BASE}.preview`, { employees, from_date: from, to_date: to, scope });

export const applyRebuild = (employees, from, to, scope = "unassigned") =>
	apiCall(`${BASE}.apply`, { employees, from_date: from, to_date: to, scope });

/** One line for the page, out of either answer. */
export function rebuildSummary(out) {
	if (!out) return "";
	const people = (out.employees || []).filter((e) => e.cancel.length || e.refetch.length).length;
	const skipped = (out.employees || []).reduce((n, e) => n + e.skipped.length, 0);
	const errors = (out.employees || []).reduce((n, e) => n + e.errors.length, 0);
	const verb = out.write ? "Rebuilt" : "Would rebuild";
	const parts = [
		`${verb}: ${out.cancelled} day${out.cancelled === 1 ? "" : "s"} for ${people} ${people === 1 ? "person" : "people"}`,
		`${out.refetched} punch${out.refetched === 1 ? "" : "es"} given ${out.write ? "their" : "a new"} shift`,
	];
	if (skipped) parts.push(`${skipped} left alone (leave, or a submitted month)`);
	if (errors) parts.push(`${errors} could not be done`);
	return parts.join(" · ") + ".";
}
