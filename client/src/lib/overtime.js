/* ---------------------------------------------------------------------------
   Overtime: worked out from the punches, paid only once approved
   (asked for 18 November 2026).

   Until then OT was only what HR typed into Employee Overtime. Now every day
   shows the OT its punches earned, and that figure is *pending*: it is not on
   anybody's pay until somebody using the dashboard for that company approves
   it, and they may change the hours when they do. Who may approve is the
   site's answer, not this file's — a company login is locked to its own
   company by a User Permission, so it can only write its own people's rows
   (docs/COMPANY_USERS.md).

   The rule HR chose: time worked beyond the shift's own length, counted only
   from 30 minutes, and in whole half hours. So an 8-hour worker who works a
   12-hour slot earns 4:00, and 12:20 on a 12-hour shift earns nothing.

   Pure: no store, no network.
   --------------------------------------------------------------------------- */

export const OT_APPROVED = "Approved";
export const OT_PENDING = "Pending Approval";
export const OT_REJECTED = "Rejected";

/** OT below this is not OT at all. */
export const OT_MIN_MINUTES = 30;
/** And above it, counted in steps of this many minutes, rounded down. */
export const OT_STEP_MINUTES = 30;

/** Whether an Employee Overtime row is paid. A row with no status was entered
    before approval existed (or on a site without the field) — every one of
    those was HR's own entry, which is what approval means, so it counts. */
export const otCounts = (r) => Boolean(r) && (!r.status || r.status === OT_APPROVED);

/** `"8:30:00"` or `"08:30"` → minutes after midnight, or null. */
function clockMinutes(t) {
	const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "").trim());
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** A shift's length in minutes from its window, wrapping past midnight; null
    when the window is not known. 20:30–08:30 is 720, not -720. */
export function shiftMinutes(w) {
	const a = clockMinutes(w && w.start_time);
	const b = clockMinutes(w && w.end_time);
	if (a == null || b == null || a === b) return null;
	return b > a ? b - a : b + 1440 - a;
}

/** The OT a day's work earns under the rule above: minutes beyond the shift,
    nothing under 30, then rounded down to a half hour. 0 when either figure is
    missing — a day with no known shift earns no automatic OT rather than a
    guessed one. */
export function autoOtMinutes(workMin, shiftMin) {
	if (!(workMin > 0) || !(shiftMin > 0)) return 0;
	const extra = workMin - shiftMin;
	if (extra < OT_MIN_MINUTES) return 0;
	return Math.floor(extra / OT_STEP_MINUTES) * OT_STEP_MINUTES;
}

/** One day's OT, from its Employee Overtime row (if any) and what the punches
    earned:

      approved  the row is paid — its hours, whatever the punches said;
      rejected  somebody said no — nothing paid, nothing pending;
      pending   no decision yet — the punches' figure (or a pending row's own
                hours) waits for approval and is not paid;
      ""        no OT at all.

    `paidMin` is the only figure payroll may read. */
export function otDay(row, autoMin) {
	if (row && otCounts(row)) {
		return { state: "approved", paidMin: Math.round(Number(row.hours || 0) * 60), pendingMin: 0, autoMin, row };
	}
	if (row && row.status === OT_REJECTED) return { state: "rejected", paidMin: 0, pendingMin: 0, autoMin, row };
	const pendingMin = row ? Math.round(Number(row.hours || 0) * 60) : autoMin;
	return { state: pendingMin > 0 ? "pending" : "", paidMin: 0, pendingMin, autoMin, row: row || null };
}

/** `"2:30"` / `"2.5"` / `"2"` → minutes, or null when it is not an amount of
    time. What somebody types into the edit box. */
export function parseOtInput(text) {
	const t = String(text ?? "").trim();
	if (!t) return 0;
	let m = /^(\d{1,2}):([0-5]\d)$/.exec(t);
	if (m) return Number(m[1]) * 60 + Number(m[2]);
	m = /^\d{1,2}(\.\d+)?$/.exec(t);
	if (m) return Math.round(Number(t) * 60);
	return null;
}
