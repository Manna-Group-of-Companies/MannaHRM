/* ---------------------------------------------------------------------------
   The three cards over Apply Leave — Frappe HR's own, asked for on 29
   September 2026: employees on leave today, employees on leave this month,
   and holidays in this month. Drawn where somebody is picking a person, so
   "who else is off" and "which days are not working days" are answered before
   the dates are.

   Pure: rows in, three numbers out. `rows` is approved leave for the month;
   `people` is who the cards are about; `holidays` is one calendar's rows.
   --------------------------------------------------------------------------- */

import { lastOfMonth } from "./format.js";

const day = (v) => String(v || "").slice(0, 10);

/** Whether an application covers `iso`. */
const covers = (r, iso) => day(r.from_date) <= iso && iso <= day(r.to_date);

/** Whether an application touches any day from `first` to `last`. */
const overlaps = (r, first, last) => day(r.from_date) <= last && day(r.to_date) >= first;

/** The three numbers, for the month `ym` (`YYYY-MM`) and the day `today`.

    **People, not applications.** Somebody with two approved applications in a
    month is one person on leave that month, and Frappe's card counts them
    once too. Only people in `people` are counted, so the cards follow the
    same company scope as the rest of the page.

    "On leave today" is about today whichever month the calendar is on —
    `rows` covers both (see loadLeaveMonth). */
export function leaveCards({ rows, people, ym, today, holidays }) {
	const who = new Set((people || []).map((e) => e.name));
	const approved = (rows || []).filter((r) => who.has(r.employee) && r.status === "Approved");
	const first = `${ym}-01`;
	const last = lastOfMonth(ym);

	const onToday = new Set(approved.filter((r) => covers(r, today)).map((r) => r.employee)).size;
	const inMonth = new Set(approved.filter((r) => overlaps(r, first, last)).map((r) => r.employee)).size;

	/* Frappe's card counts every row of the calendar in the month, weekly offs
	   included — four Sundays is four. The split is kept so the card can say
	   which is which. */
	const mine = holidays ? holidays.filter((h) => day(h.holiday_date).slice(0, 7) === ym) : null;
	const weekly = mine ? mine.filter((h) => Number(h.weekly_off)).length : 0;

	return {
		onToday,
		inMonth,
		holidays: mine ? { total: mine.length, weekly, other: mine.length - weekly } : null,
	};
}
