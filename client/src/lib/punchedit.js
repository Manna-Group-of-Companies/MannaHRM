/* ---------------------------------------------------------------------------
   Editing a day's Time In and Time Out on Attendance Regularization.

   Asked for on 16 September 2026: every punch-in and punch-out on the month
   editable, in place. What "edit" is allowed to mean here is fixed by two rules
   this repo does not bend (CLAUDE.md §5, lib/write.js):

     · **Attendance is never written.** The day is rebuilt from punches.
     · **A punch is never deleted or rewritten.** It is evidence, and the
       machine's copy may already be gone.

   So an edit is three things, all traceable:

     1. an `Employee Attendance Regularization`, raised as Pending Approval
        with the reason typed — the record of who asked for what and why.
        Nothing below happens until somebody else approves it
        (features/approvals/decide.js, since 17 September 2026);
     2. on approval, the new punch, `device_id` REG-<user>, the same spelling an approved
        correction writes (features/approvals/decide.js);
     3. the punches the new time replaces, **marked** `skip_auto_attendance`
        rather than removed — the flag hrms's shift job already honours, so
        the day is built without them and they stay on the record.

   Only the punches that would still win are marked. The day's Time In is its
   first punch and its Time Out its last, whatever key was pressed (16 November
   2026), so moving the in earlier needs nothing marked; moving it later has to
   set aside every IN before the new time, or the old one still wins. Time Out
   mirrors that with every punch after it — a leaving punched as IN included.

   **Any time may be typed** (22 October 2026, asked for by HR). A Time Out at
   or before the Time In is the next morning — a night shift, which belongs to
   the day it started (CLAUDE.md §5) — and sets aside the day's own OUTs. A side
   left empty is **cleared**: its punches are set aside, as above, and none is
   written; api/punchedit.js leaves a comment on each saying who and why.

   Everything here is pure, so the plan can be tested without a site.
   --------------------------------------------------------------------------- */

import { dayPunches } from "./roster.js";

const hhmm = (t) => String(t || "").slice(11, 16);
const at = (day, v) => `${day} ${v}:00`;

/** The calendar day after `YYYY-MM-DD`, worked in UTC so no clock change moves it. */
export function nextDay(day) {
	const d = new Date(`${day}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * What saving one row would write.
 *
 * @param {string} day   `YYYY-MM-DD`
 * @param {object[]} punches  the day's punches as read (`name`, `time`, `log_type`, `skip_auto_attendance`)
 * @param {{in: string, out: string}} next  `HH:MM`, or "" to clear that side
 * @returns {{ok: boolean, why: string, add: {log_type, time}[], skip: {name, time, log_type}[], requestedIn: string, requestedOut: string, changed: boolean, overnight: boolean, cleared: {in: boolean, out: boolean}}}
 */
export function editPlan(day, punches, next) {
	const live = (punches || []).filter((c) => String(c.time || "").slice(0, 10) === day
		&& !Number(c.skip_auto_attendance));
	const ins = live.filter((c) => c.log_type !== "OUT");
	const outs = live.filter((c) => c.log_type === "OUT");
	const t19 = (c) => String(c.time).slice(0, 19);
	/* What the page shows for the day — its first punch and its last, whatever
	   key was pressed (lib/roster.js `dayPunches`, 16 November 2026) — so a
	   leaving punched as IN is the Time Out being edited. */
	const cur = dayPunches(live);
	const keyOf = (t) => (live.find((c) => String(c.time) === t) || {}).log_type || "";

	const wantIn = String(next.in || "").trim();
	const wantOut = String(next.out || "").trim();
	const out = { ok: false, why: "", add: [], skip: [], requestedIn: "", requestedOut: "", changed: false, overnight: false, cleared: { in: false, out: false } };

	if (wantIn && !TIME.test(wantIn)) return { ...out, why: "Time In is not a time." };
	if (wantOut && !TIME.test(wantOut)) return { ...out, why: "Time Out is not a time." };
	/* An out at or before the in is the next morning: the one reading of it that
	   is a shift. A day already ending past midnight is read the same way, so
	   saving it again unchanged writes nothing. */
	const overnight = Boolean(wantIn && wantOut && wantOut <= wantIn);
	const outDay = overnight ? nextDay(day) : day;

	/* A side left on its own keeps only its key to go on (`dayPunches`): a lone
	   IN reads as an arrival and a lone OUT as a leaving. So a lone side whose
	   punch carries the other key is rewritten with the right one, or clearing
	   the other side would turn it round. */
	const inChanged = wantIn !== hhmm(cur.inAt)
		|| Boolean(wantIn && !wantOut && cur.inAt && keyOf(cur.inAt) === "OUT");
	const outChanged = overnight || wantOut !== hhmm(cur.outAt)
		|| Boolean(wantOut && !wantIn && cur.outAt && keyOf(cur.outAt) !== "OUT");
	if (!inChanged && !outChanged) return { ...out, why: "Nothing changed." };

	const skip = (side, rows) => rows.forEach((c) => out.skip.push({ ...c, side }));
	/* The in that stays: the new one, or the punch already there. */
	const keptIn = wantIn ? (inChanged ? at(day, wantIn) : t19({ time: cur.inAt })) : "";

	if (inChanged) {
		if (wantIn) {
			const t = at(day, wantIn);
			if (!ins.some((c) => t19(c) === t)) out.add.push({ log_type: "IN", time: t });
			out.skip.push(...ins.filter((c) => t19(c) < t).map((c) => ({ ...c, side: "in" })));
		} else {
			skip("in", ins);
		}
	}
	if (outChanged) {
		if (wantOut) {
			const t = at(outDay, wantOut);
			if (!outs.some((c) => t19(c) === t)) out.add.push({ log_type: "OUT", time: t });
			/* Overnight, every OUT on the day itself is earlier than the new one
			   and would still end the day there. A punch keyed IN after the new
			   out — or, overnight, after the in — would be read as the out
			   instead, so it goes too. An OUT before the in is not touched: it
			   may be last night's leaving. */
			skip("out", outs.filter((c) => overnight || t19(c) > t));
			skip("out", ins.filter((c) => (overnight ? keptIn && t19(c) > keptIn : t19(c) > t)));
		} else {
			skip("out", outs);
			skip("out", ins.filter((c) => keptIn && t19(c) > keptIn));
		}
	}
	/* One punch, set aside once, under the side that took it first. */
	const seen = new Set();
	out.skip = out.skip.filter((c) => !seen.has(c.name) && seen.add(c.name));
	if (!out.add.length && !out.skip.length) return { ...out, why: "Nothing changed." };

	return {
		...out,
		ok: true,
		changed: true,
		overnight,
		cleared: {
			in: inChanged && !wantIn && out.skip.some((c) => c.side === "in"),
			out: outChanged && !wantOut && out.skip.some((c) => c.side === "out"),
		},
		skip: out.skip.map((c) => ({ name: c.name, time: c.time, log_type: c.log_type || "IN", side: c.side })),
		requestedIn: wantIn ? at(day, wantIn) : "",
		requestedOut: wantOut ? at(outDay, wantOut) : "",
	};
}

/**
 * The punches an approved correction replaces: every live IN before the
 * requested Time In, and every live punch after the requested Time Out on its
 * day — an IN as well as an OUT, because the day's last punch is its out
 * whatever key was pressed (16 November 2026), and a leaving punched as IN
 * would otherwise still end the day. On a same-day correction an OUT before
 * the Time In is not replaced: it may be last night's leaving. A side the request leaves empty
 * replaces nothing — that is a missed punch being added, not a time being
 * moved.
 *
 * @param {object[]} punches  the day's punches (`name`, `time`, `log_type`, `skip_auto_attendance`)
 * @param {string} requestedIn  `YYYY-MM-DD HH:MM:SS` or ""
 * @param {string} requestedOut `YYYY-MM-DD HH:MM:SS` or ""
 * @returns {{name, time, log_type}[]}
 */
export function supersededBy(punches, requestedIn, requestedOut) {
	const t = (c) => String(c.time || "").slice(0, 19);
	/* An out on a later day than the punch — a night shift's — replaces every
	   OUT on that punch's day, not only the later ones. */
	return (punches || [])
		.filter((c) => !Number(c.skip_auto_attendance))
		.filter((c) => (c.log_type === "OUT"
			? Boolean(requestedOut) && (t(c) > requestedOut || requestedOut.slice(0, 10) > t(c).slice(0, 10))
			: (Boolean(requestedIn) && t(c) < requestedIn)
				|| (Boolean(requestedOut) && t(c) > requestedOut && t(c).slice(0, 10) === requestedOut.slice(0, 10))))
		.map((c) => ({ name: c.name, time: c.time, log_type: c.log_type || "IN" }));
}
