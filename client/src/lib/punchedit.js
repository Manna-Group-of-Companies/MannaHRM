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
   earliest IN, so moving it earlier needs nothing marked; moving it later has
   to set aside every IN before the new time, or the old one still wins. Time
   Out mirrors that with the latest OUT.

   Everything here is pure, so the plan can be tested without a site.
   --------------------------------------------------------------------------- */

const hhmm = (t) => String(t || "").slice(11, 16);
const at = (day, v) => `${day} ${v}:00`;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * What saving one row would write.
 *
 * @param {string} day   `YYYY-MM-DD`
 * @param {object[]} punches  the day's punches as read (`name`, `time`, `log_type`, `skip_auto_attendance`)
 * @param {{in: string, out: string}} next  `HH:MM`, or "" to clear that side
 * @returns {{ok: boolean, why: string, add: {log_type, time}[], skip: {name, time, log_type}[], requestedIn: string, requestedOut: string, changed: boolean}}
 */
export function editPlan(day, punches, next) {
	const live = (punches || []).filter((c) => String(c.time || "").slice(0, 10) === day
		&& !Number(c.skip_auto_attendance));
	const ins = live.filter((c) => c.log_type !== "OUT");
	const outs = live.filter((c) => c.log_type === "OUT");
	const curIn = ins.map((c) => c.time).sort()[0] || "";
	const curOut = outs.map((c) => c.time).sort().slice(-1)[0] || "";

	const wantIn = String(next.in || "").trim();
	const wantOut = String(next.out || "").trim();
	const out = { ok: false, why: "", add: [], skip: [], requestedIn: "", requestedOut: "", changed: false };

	if (wantIn && !TIME.test(wantIn)) return { ...out, why: "Time In is not a time." };
	if (wantOut && !TIME.test(wantOut)) return { ...out, why: "Time Out is not a time." };
	/* A night shift's out is on the next calendar day, and this row is one day.
	   Refused rather than guessed: a guessed date is somebody's hours. */
	if (wantIn && wantOut && wantOut <= wantIn) {
		return { ...out, why: "Time Out is not after Time In. A shift that ends after midnight is corrected on the desk." };
	}

	const inChanged = wantIn !== hhmm(curIn);
	const outChanged = wantOut !== hhmm(curOut);
	if (!inChanged && !outChanged) return { ...out, why: "Nothing changed." };

	if (inChanged) {
		if (wantIn) {
			const t = at(day, wantIn);
			if (!ins.some((c) => String(c.time).slice(0, 19) === t)) out.add.push({ log_type: "IN", time: t });
			out.skip.push(...ins.filter((c) => String(c.time).slice(0, 19) < t));
		} else {
			out.skip.push(...ins);
		}
	}
	if (outChanged) {
		if (wantOut) {
			const t = at(day, wantOut);
			if (!outs.some((c) => String(c.time).slice(0, 19) === t)) out.add.push({ log_type: "OUT", time: t });
			out.skip.push(...outs.filter((c) => String(c.time).slice(0, 19) > t));
		} else {
			out.skip.push(...outs);
		}
	}

	return {
		...out,
		ok: true,
		changed: true,
		skip: out.skip.map((c) => ({ name: c.name, time: c.time, log_type: c.log_type || "IN" })),
		requestedIn: wantIn ? at(day, wantIn) : "",
		requestedOut: wantOut ? at(day, wantOut) : "",
	};
}

/**
 * The punches an approved correction replaces: every live IN before the
 * requested Time In, every live OUT after the requested Time Out. A side the
 * request leaves empty replaces nothing — that is a missed punch being added,
 * not a time being moved.
 *
 * @param {object[]} punches  the day's punches (`name`, `time`, `log_type`, `skip_auto_attendance`)
 * @param {string} requestedIn  `YYYY-MM-DD HH:MM:SS` or ""
 * @param {string} requestedOut `YYYY-MM-DD HH:MM:SS` or ""
 * @returns {{name, time, log_type}[]}
 */
export function supersededBy(punches, requestedIn, requestedOut) {
	const t = (c) => String(c.time || "").slice(0, 19);
	return (punches || [])
		.filter((c) => !Number(c.skip_auto_attendance))
		.filter((c) => (c.log_type === "OUT"
			? Boolean(requestedOut) && t(c) > requestedOut
			: Boolean(requestedIn) && t(c) < requestedIn))
		.map((c) => ({ name: c.name, time: c.time, log_type: c.log_type || "IN" }));
}
