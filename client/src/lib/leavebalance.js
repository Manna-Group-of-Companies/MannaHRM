/* ---------------------------------------------------------------------------
   The Leave Balance Report's entitlement half, off hrms's Leave Ledger Entry.

   **The ledger is hrms's, and this only adds it up** — the same bargain
   `monthCarry` in lib/monthlyleave.js makes. Every allocation is a positive
   `Leave Allocation` entry dated the day it took effect: one a month for the
   monthly Casual Leave, one for a carry-forward flagged `is_carry_forward`. A
   year end writes what lapsed as a negative `Leave Allocation` entry flagged
   `is_expired`. So what somebody had been given by a date is every such entry
   on or before it; nothing here decides what anybody is owed.

   `Leave Application` entries are skipped on purpose: Availed is read off the
   applications themselves and clipped at the As On Date (see LeaveBalances),
   and counting the ledger's debit as well would take the same leave twice.
   --------------------------------------------------------------------------- */

import { LETTER_FILL } from "@/lib/fills";
import { lastOfMonth } from "@/lib/format";

/** Joined with a NUL rather than a space, because every leave type on the site
    has a space in its name. The same key LeaveBalances tallies Availed under. */
export const lvbKey = (employee, type) => employee + "\0" + (type || "—");

/** Days of one application that fall on or before `ason`.

    Whole applications are taken at their own `total_leave_days`, which is the
    site's number and already accounts for the half-day flag — recomputing it
    here would be a second opinion about somebody's leave, and the site's is the
    one payroll would use.

    An application still running on `ason` is clipped instead, because leave
    not yet taken is not yet availed. The clip counts whole days and then gives
    back the half if the half-day falls inside the window. */
export function availedUpTo(row, ason) {
	const from = String(row.from_date || "").slice(0, 10);
	const to = String(row.to_date || from).slice(0, 10);
	if (!from || from > ason) return 0;
	if (to <= ason) return Number(row.total_leave_days) || 0;

	const days = Math.round((Date.parse(ason) - Date.parse(from)) / 86400000) + 1;
	const half = String(row.half_day_date || "").slice(0, 10);
	const halved = row.half_day && half && half >= from && half <= ason ? 0.5 : 0;
	return Math.max(0, days - halved);
}

/** Per person per type, on or before `ason`: assigned (new allocations),
    carried (carry-forward allocations) and expired (what lapsed, as a positive
    number). Anything else negative on an allocation — an encashment, which the
    site has none of — is counted with expired, so the columns still add up to
    the balance. */
export function ledgerUpTo(ledger, ason) {
	const out = new Map();
	for (const e of ledger || []) {
		if (e.transaction_type === "Leave Application") continue;
		const d = String(e.from_date || "").slice(0, 10);
		if (!d || d > ason) continue;
		const n = Number(e.leaves) || 0;
		if (!n) continue;
		const k = lvbKey(e.employee, e.leave_type);
		const cur = out.get(k) || { assigned: 0, carried: 0, expired: 0 };
		if (n < 0) cur.expired -= n;
		else if (Number(e.is_carry_forward)) cur.carried += n;
		else cur.assigned += n;
		out.set(k, cur);
	}
	return out;
}

/** What is left: everything given, less what lapsed and what was taken.
    `null` when nothing was ever allocated — Leave Without Pay has no
    allocation to be short of, and a balance of minus its days would read as a
    debt nobody owes. */
export function balanceOf(row) {
	if (!row.alloc) return null;
	return row.alloc.assigned + row.alloc.carried - row.alloc.expired - row.availed;
}

/** Approved days per person per type, on or before `ason`. */
function takenUpTo(applications, ason) {
	const out = new Map();
	for (const r of applications || []) {
		const n = availedUpTo(r, ason);
		if (!n) continue;
		const k = lvbKey(r.employee, r.leave_type);
		out.set(k, (out.get(k) || 0) + n);
	}
	return out;
}

/** One month of leave per person per type, for Leave Monthly Availed: what
    came in from before, what the month added, what was taken in it, what
    lapsed in it, and what is **available** at its end.

    **Two balances subtracted, never a second way of adding up.** Available is
    exactly what the Leave Balance Report prints as Balance with the As On Date
    set to the month's last day, and Brought Fwd is that report on the day
    before the month — so the two reports cannot disagree about anybody.

    A year-start carry-forward is counted in Brought Fwd, because that is what
    it is; the old year's unused leave shows as Lapsed on the day hrms expires
    it (31 December), so December ends at what lapsed and January starts at
    what was carried.

    Leave crossing a month boundary is split at it — the days in this month
    are this month's — unlike Leave History, which files a whole application
    under the day it starts.

    A type never allocated (Leave Without Pay) has no balance to have: it is a
    row only in a month it was taken, with everything but Availed `null`.
    A blank is not a zero. */
export function monthLeave(ledger, applications, ym) {
	const end = lastOfMonth(ym);
	const [y, m] = ym.split("-").map(Number);
	const before = lastOfMonth(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`);

	const was = ledgerUpTo(ledger, before);
	const now = ledgerUpTo(ledger, end);
	const tookBefore = takenUpTo(applications, before);
	const tookNow = takenUpTo(applications, end);
	const none = { assigned: 0, carried: 0, expired: 0 };

	const out = new Map();
	for (const [k, a] of now) {
		const p = was.get(k) || none;
		const availed = (tookNow.get(k) || 0) - (tookBefore.get(k) || 0);
		const brought = p.assigned + p.carried - p.expired - (tookBefore.get(k) || 0) + (a.carried - p.carried);
		const earned = a.assigned - p.assigned;
		const lapsed = a.expired - p.expired;
		out.set(k, { brought, earned, availed, lapsed, available: brought + earned - availed - lapsed });
	}
	for (const [k, n] of tookNow) {
		const availed = n - (tookBefore.get(k) || 0);
		if (out.has(k) || !availed) continue;
		out.set(k, { brought: null, earned: null, availed, lapsed: null, available: null });
	}
	return out;
}

/** The export's colours, by column — the same pale set the attendance exports
    paint with (lib/fills.js), so a green cell means the same good news in
    either file. Files only: the screen is drawn in the palette's roles, and a
    fixed pale fill there would be unreadable in the dark one. Only a figure is
    coloured; a `—` is left white, because a blank that is tinted reads as a
    value. */
export function lvbFill(v, head) {
	if (head === "Status") return v === "Active" ? LETTER_FILL.P : v && v !== "—" ? LETTER_FILL.WO : null;
	const n = v === "—" || v === "" || v == null ? NaN : Number(v);
	if (Number.isNaN(n)) return null;
	/* Leave Monthly Availed's columns are painted as their Leave Balance
	   counterparts, so the same figure is the same colour in either file. */
	if (head === "Assigned" || head === "Earned") return LETTER_FILL.L;
	if (head === "Carried Fwd" || head === "Brought Fwd") return LETTER_FILL.LA;
	if (head === "Expired" || head === "Lapsed") return n > 0 ? LETTER_FILL.MP : null;
	if (head === "Availed") return n > 0 ? LETTER_FILL.HD : null;
	if (head === "Balance" || head === "Available") return n > 0 ? LETTER_FILL.P : n < 0 ? LETTER_FILL.A : LETTER_FILL.WO;
	return null;
}
