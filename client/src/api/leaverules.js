import { runAbsenceRule } from "@/api/absencerule";
import { runSundayLeave } from "@/api/sundayleave";
import { loadLeaveFor } from "@/api/load";
import { getState, set } from "@/store";
import { nowStamp, todayIso } from "@/lib/format";
import { AUTO_LEAVE_RULES } from "@/lib/absencerule";

/* ---------------------------------------------------------------------------
   HR's two automatic leave rules, run by the dashboard while it is open.

   Sunday leave first, then the office absence rule, every time: a Sunday
   worked puts a day in the balance, and Monday's absence is then taken
   from it rather than refused for want of one. The site does the same in one
   hourly job (manna_hr/leaverules_site.py) once `manna_hr` is installed.

   Started by App.jsx for a login that can create an Employee — HR User, HR
   Manager, System Manager — once the employee list has been read, because
   designation is what says who is office staff.

   **One tab at a time.** hrms's duplicate checks are plain reads, so two tabs
   reading a month together can both give it a leave. The browser's Web Locks
   make every tab of this origin take turns; a tick that finds another tab
   mid-run skips rather than queues, because that tab is doing the same work.

   **Not from `npm run dev` unless asked.** The dev server talks to the live
   site, and a half-saved edit to a rule would be applied to real leave on
   the next reload. `VITE_LEAVE_RULES=on` in client/.env turns it on there.
   --------------------------------------------------------------------------- */

const EVERY = 30 * 60 * 1000;

const LOCK = "manna-leave-rules";

/** Run `fn` holding the cross-tab lock. `wait` false skips (resolving null)
    when another tab holds it. Without Web Locks — jsdom, an old browser — it
    simply runs: one tab is the common case, and the site still refuses a
    second leave for one day. */
export function exclusive(fn, { wait = true } = {}) {
	const locks = typeof navigator !== "undefined" ? navigator.locks : null;
	if (!locks?.request) return fn();
	return locks.request(LOCK, wait ? {} : { ifAvailable: true }, (lock) => (lock ? fn() : null));
}

/** Whether this build may run the rules by itself. Never while HR has them
    switched off (`AUTO_LEAVE_RULES`, 14 October 2026), whatever the build. */
export function autoRuns(env = import.meta.env, on = AUTO_LEAVE_RULES) {
	return on && (!env.DEV || env.VITE_LEAVE_RULES === "on");
}

/** One pass of both. Never throws: a refusal in one is not a reason to skip
    the other. The result is kept in the store as `leaveRules`, so Apply Leave
    can say why somebody's absence or Sunday was not turned into leave. */
export async function runLeaveRules() {
	const sunday = await runSundayLeave().catch((e) => ({ given: [], refused: [{ error: String(e?.message || e) }] }));
	const absence = await runAbsenceRule()
		.catch((e) => ({ given: [], returned: [], waiting: [], refused: [{ error: String(e?.message || e) }] }));
	set({ leaveRules: { at: nowStamp(), sunday, absence } });

	/* Apply Leave open on somebody the rules just changed: read them again,
	   so the balance and the calendar say what the site now holds rather than
	   what it held when the page was opened. */
	const f = getState().apply || {};
	const touched = [...sunday.given, ...absence.given, ...(absence.returned || [])].some((x) => x.employee === f.emp);
	if (f.emp && touched) void loadLeaveFor(f.emp, f.month || (f.from || todayIso()).slice(0, 7));
	return { sunday, absence };
}

/** Run now and every half hour. Returns the function that stops it. */
export function startLeaveRules() {
	if (!autoRuns()) return undefined;
	let busy = false;
	const tick = () => {
		if (busy) return;
		busy = true;
		void exclusive(runLeaveRules, { wait: false }).catch(() => {}).finally(() => { busy = false; });
	};
	tick();
	const id = setInterval(tick, EVERY);
	return () => clearInterval(id);
}

/** Apply Leave open on somebody whose month still holds a first absence the
    absence rule has not turned into Casual Leave: run the rule for them now,
    so the calendar shows the leave rather than an A until the next half-hourly
    run. The same rule and the same lock as the timed runs — and, like them,
    not from `npm run dev` unless asked. What it could not do joins the last
    run's notes, so Apply Leave says why the day is still A.
    @returns {Promise<object|null>} the run's result, or null when it did not run */
export async function settleFirstAbsence(emp, ym, env = import.meta.env, on = AUTO_LEAVE_RULES) {
	if (!emp || !autoRuns(env, on)) return null;
	const r = await exclusive(() => runAbsenceRule({ only: emp, ym })).catch(() => null);
	if (!r) return null;
	const prev = getState().leaveRules || {};
	const was = prev.absence || {};
	const keep = (xs) => (xs || []).filter((x) => x.employee !== emp);
	set({ leaveRules: { ...prev, at: prev.at || nowStamp(), absence: {
		given: [...keep(was.given), ...r.given],
		returned: [...keep(was.returned), ...r.returned],
		refused: [...keep(was.refused), ...r.refused],
		waiting: [...keep(was.waiting), ...r.waiting],
	} } });
	if (r.given.length || r.returned.length) await loadLeaveFor(emp, ym);
	return r;
}

/** What the last run said about one person, for Apply Leave: refusals and
    absences left Absent for want of a balance, newest run only. */
export function leaveRulesFor(state, emp) {
	const r = state.leaveRules;
	if (!r || !emp) return [];
	const mine = (xs) => (xs || []).filter((x) => x.employee === emp);
	return [
		...mine(r.absence?.waiting).map((x) => ({ ...x, rule: "absence" })),
		...mine(r.absence?.refused).map((x) => ({ ...x, rule: "absence" })),
		...mine(r.sunday?.refused).map((x) => ({ ...x, rule: "sunday" })),
	];
}
