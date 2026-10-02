import { dayAfter, dayBefore } from "@/lib/roster";

/* ---------------------------------------------------------------------------
   A new shift for dates, laid over the ones a person already has (1 October
   2026). Changing somebody's shift *is* adding a new one: Factor HR's Change
   Shift Report is a list of exactly that, and hrms refuses the new assignment
   while any active one overlaps it — unless HR Settings' "Allow Multiple Shift
   Assignments for Same Date" is on.

   **That setting stays off.** With it on a person has two shifts on one day,
   and which one a punch is measured against becomes hrms's guess; the guess
   decides the late, the early and the hours somebody is paid for. So the new
   shift wins on its own dates, and the old one keeps the rest:

     · the part of an old one **before** the new one stays — its end date moves
       to the day before;
     · an old one **wholly inside** the new dates is set Inactive;
     · the part of an old one **after** the new one comes back as an
       assignment of its own from the day after (hrms will not move a
       submitted start date — `end_date` and `status` are the only two fields
       it lets change after submit).

   Nothing is cancelled or deleted: Inactive and an earlier end date are both
   undone by writing the old value back, which is what api/shiftassign.js does
   when the site refuses the new one.

   Dates are `YYYY-MM-DD`; an empty end is open-ended, as on the site.
   --------------------------------------------------------------------------- */

const END = "9999-12-31";
const endOf = (a) => (a && a.end_date ? String(a.end_date) : END);

/** What has to change in `existing` (active, submitted assignments) to make
    room for `{shift, from, to}`.
    @returns {{same: boolean, trim: object[], retire: object[], resume: object[]}} */
export function spliceShift(existing, { shift, from, to }) {
	const until = to || END;
	const hit = (existing || []).filter((a) => String(a.start_date) <= until && endOf(a) >= from);
	const out = { same: false, trim: [], retire: [], resume: [] };

	/* Already that shift on every one of those dates: nothing to write, and
	   writing it anyway would split one assignment into three. */
	if (hit.length === 1 && hit[0].shift_type === shift && String(hit[0].start_date) <= from && endOf(hit[0]) >= until) {
		return { ...out, same: true };
	}

	for (const a of hit) {
		if (String(a.start_date) < from) {
			out.trim.push({ name: a.name, shift_type: a.shift_type, start_date: a.start_date, end_date: dayBefore(from), was: a.end_date || "" });
		} else {
			out.retire.push({ name: a.name, shift_type: a.shift_type, start_date: a.start_date, end_date: a.end_date || "" });
		}
		if (to && endOf(a) > to) {
			out.resume.push({ shift_type: a.shift_type, start_date: dayAfter(to), end_date: a.end_date || "", after: a.name });
		}
	}
	return out;
}

/** The plan in a sentence, for the panel before the button is pressed and the
    note after it. Empty when nothing else changes. */
export function spliceText(plan, dmy) {
	const span = (a) => `${dmy(a.start_date)}${a.end_date ? `–${dmy(a.end_date)}` : " →"}`;
	return [
		...plan.trim.map((a) => `${a.shift_type} (${a.name}) now ends ${dmy(a.end_date)}`),
		...plan.retire.map((a) => `${a.shift_type} ${span(a)} (${a.name}) set Inactive`),
		...plan.resume.map((a) => `${a.shift_type} resumes ${span(a)}`),
	].join(" · ");
}
