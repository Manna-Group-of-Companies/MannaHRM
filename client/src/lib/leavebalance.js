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

/** Joined with a NUL rather than a space, because every leave type on the site
    has a space in its name. The same key LeaveBalances tallies Availed under. */
export const lvbKey = (employee, type) => employee + "\0" + (type || "—");

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
	if (head === "Assigned") return LETTER_FILL.L;
	if (head === "Carried Fwd") return LETTER_FILL.LA;
	if (head === "Expired") return n > 0 ? LETTER_FILL.MP : null;
	if (head === "Availed") return n > 0 ? LETTER_FILL.HD : null;
	if (head === "Balance") return n > 0 ? LETTER_FILL.P : n < 0 ? LETTER_FILL.A : LETTER_FILL.WO;
	return null;
}
