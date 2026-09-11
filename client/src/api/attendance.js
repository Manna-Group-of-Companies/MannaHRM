import { listAll } from "@/api/client";
import { getState, set } from "@/store";

/* ---------------------------------------------------------------------------
   One person's month, read from the site.

   Behind Attendance → Attendance Regularization, once somebody is picked. Four
   narrow reads rather than one wide one, and narrow is the whole design: the
   first load of this dashboard already asks for every employee and *today's*
   punches, and a month of punches for the whole group would be tens of
   thousands of rows nobody asked for. This asks for one person and one month.

   ## Why it is not part of `load()`

   Most people who open this page open it to look somebody up, and the ones who
   do not never pay for the read. It is keyed and cached on `employee|month`,
   so paging back to a month already read costs nothing — and `force` is what
   the Refresh icon passes.

   ## Every read here is filtered on the employee

   Not for privacy — the site decides that, and it decides it per row under the
   person's own roles, which is the only place it can be decided (CLAUDE.md §1).
   It is for size and for honesty: a screen about one person that quietly held
   the whole company's punches in the store would show the right thing and be
   the wrong shape, and the next screen written against that store would find
   them there.

   ## Corrections are read at every status, unlike the queue

   `pendingRegularizations()` in load.js asks for open ones, because it is
   filling an approval queue and a decided request is not a row in a backlog.
   This screen is the opposite question — *what happened to my 19th of August* —
   and the answer is often "it was refused". So this asks for all of them.
   --------------------------------------------------------------------------- */

/* **Each read has a short list behind it.** Frappe answers 417 for the *whole*
   read when asked for one field a site has not got — it does not drop the
   column it did not recognise — so a single unknown field turns a month of
   punches into "the site would not answer". The long list is what makes the
   screen good and the short list is what the screen needs; asking for the
   second when the first is refused is the same bargain `api/load.js` makes
   eight times over. */
const PUNCH_FIELDS = ["name", "employee", "time", "log_type", "device_id", "shift"];
const PUNCH_MIN = ["name", "employee", "time", "log_type"];

const LEAVE_FIELDS = ["name", "employee", "leave_type", "from_date", "to_date",
	"half_day", "half_day_date", "status", "description"];
const LEAVE_MIN = ["name", "employee", "leave_type", "from_date", "to_date", "status"];

/** The correction doctype under either name — the same two the queue tries, in
    the same order, and for the same reason: which one answers decides where a
    decision would later be written. `regDoctype` is settled by the first load;
    this follows it rather than guessing again. */
const AR_FIELDS = ["name", "employee", "attendance_date", "requested_in", "requested_out",
	"reason", "status", "creation", "owner", "modified", "modified_by"];
const AR_MIN = ["name", "employee", "attendance_date", "status"];

/** `YYYY-MM` → the first and last day of it, as the site writes dates.

    `-01` and `-31` rather than the real last day: a `<=` against `-31` catches
    every month, and no date that is not in the month can sort between them.
    Frappe compares these as strings too. */
const monthRange = (ym) => [ym + "-01", ym + "-31"];

/**
 * Read one employee's month into `regMonth`.
 *
 * Never throws. A screen that goes blank because one of four reads was refused
 * is a screen that reports a permission problem as missing attendance, so each
 * read carries its own failure and the page says which of them came back empty.
 */
export async function loadRegMonth(emp, ym, force) {
	if (!emp || !ym) return set({ regMonth: { key: "", state: "", err: "", punches: [], leave: [], ar: [] } });

	const key = `${emp}|${ym}`;
	const cur = getState().regMonth;
	/* The guard is set before the first await, so the re-render it causes
	   cannot start the same four reads again. */
	if (cur.key === key && cur.state && !force) return;
	set({ regMonth: { ...cur, key, state: "loading", err: "" } });

	const [from, to] = monthRange(ym);
	const doctype = getState().regDoctype || "Employee Attendance Regularization";

	/** The long list, then the short one, then give up and say so. */
	const read = (dt, long, short, filters) =>
		listAll(dt, long, filters)
			.catch(() => listAll(dt, short, filters))
			.catch(() => null);

	const [punches, leave, ar] = await Promise.all([
		/* Punch times are `YYYY-MM-DD HH:MM:SS`, and the range is compared
		   lexicographically against exactly that shape — see client/README.md on
		   why every date on this site is a string. */
		read("Employee Checkin", PUNCH_FIELDS, PUNCH_MIN,
			[["employee", "=", emp], ["time", ">=", from + " 00:00:00"], ["time", "<=", to + " 23:59:59"]]),

		/* Overlapping, not contained. A leave that started in July and runs into
		   August covers days in this month, and asking for `from_date >= the
		   first` would miss every one of them. */
		read("Leave Application", LEAVE_FIELDS, LEAVE_MIN,
			[["employee", "=", emp], ["from_date", "<=", to], ["to_date", ">=", from]]),

		read(doctype, AR_FIELDS, AR_MIN,
			[["employee", "=", emp], ["attendance_date", ">=", from], ["attendance_date", "<=", to]]),
	]);

	/* Which of the three could not be read, in the site's own terms rather than
	   as an empty table. "Nobody punched" and "the punches could not be read"
	   are opposite findings on a screen about whether somebody was paid. */
	const refused = [
		punches === null && "punches",
		leave === null && "leave",
		ar === null && "corrections",
	].filter(Boolean);

	set({
		regMonth: {
			key,
			state: "ok",
			err: refused.length ? `The site would not answer for ${refused.join(", ")}.` : "",
			punches: punches || [],
			leave: leave || [],
			ar: ar || [],
		},
	});
}

/**
 * Read everybody's month into `regGrid` — the register on Attendance before
 * anybody is picked.
 *
 * The same three reads as `loadRegMonth` without the employee filter, and the
 * one place this app asks for a month of everybody's punches. That is the
 * widest read it makes, so it is paged a thousand at a time, keyed on the
 * month, and made only when the register is actually on screen.
 *
 * Never throws, for the same reason: "nobody punched" and "the punches could
 * not be read" are opposite findings on a screen about pay.
 */
export async function loadRegGrid(ym, force) {
	if (!ym) return;
	const cur = getState().regGrid;
	if (cur.key === ym && cur.state && !force) return;
	set({ regGrid: { ...cur, key: ym, state: "loading", err: "" } });

	const [from, to] = monthRange(ym);
	const doctype = getState().regDoctype || "Employee Attendance Regularization";
	const read = (dt, long, short, filters) =>
		listAll(dt, long, filters, 1000)
			.catch(() => listAll(dt, short, filters, 1000))
			.catch(() => null);

	const [punches, leave, ar] = await Promise.all([
		read("Employee Checkin", PUNCH_MIN, PUNCH_MIN,
			[["time", ">=", from + " 00:00:00"], ["time", "<=", to + " 23:59:59"]]),
		read("Leave Application", LEAVE_FIELDS, LEAVE_MIN,
			[["from_date", "<=", to], ["to_date", ">=", from]]),
		read(doctype, AR_FIELDS, AR_MIN,
			[["attendance_date", ">=", from], ["attendance_date", "<=", to]]),
	]);

	/* A second answer for a month already left behind is dropped: paging back
	   and forth quickly must not paint August's punches under September. */
	if (getState().regGrid.key !== ym) return;

	const refused = [
		punches === null && "punches",
		leave === null && "leave",
		ar === null && "corrections",
	].filter(Boolean);

	set({
		regGrid: {
			key: ym,
			state: "ok",
			err: refused.length ? `The site would not answer for ${refused.join(", ")}.` : "",
			punches: punches || [],
			leave: leave || [],
			ar: ar || [],
		},
	});
}

/** The shift windows, once — `Shift Type` holds the start and end times that
    make `Office Shift (08:30-17:30)` mean anything, and the first load reads
    only the names.

    Guarded and never fatal: a site whose `Shift Type` has no such fields
    answers 417 for the whole read, and the roster then draws the shift by name
    alone rather than with a window invented for it. */
export async function loadShiftWindows() {
	if (getState().shiftWindowState) return;
	set({ shiftWindowState: "loading" });
	const rows = await listAll("Shift Type", ["name", "start_time", "end_time"]).catch(() => null);
	if (!rows) return set({ shiftWindowState: "none" });
	const byName = {};
	for (const r of rows) byName[r.name] = r;
	set({ shiftWindows: byName, shiftWindowState: "ok" });
}

/** `"08:30:00"` → `"08:30"`. Frappe stores a Time as `HH:MM:SS`; the seconds
    are always zero on a shift and are two characters of noise on a row that
    already carries four times. */
export const hhmm = (t) => (t ? String(t).slice(0, 5) : "");

/** How a shift reads on a roster row: the name, and the window where it is
    known. Their row prints both. */
export function shiftLabel(name, windows) {
	if (!name) return "";
	const w = windows && windows[name];
	return w && w.start_time && w.end_time
		? `${name} (${hhmm(w.start_time)}-${hhmm(w.end_time)})`
		: name;
}
