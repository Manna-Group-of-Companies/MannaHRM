/* ---------------------------------------------------------------------------
   The rows behind Factor HR's reports, as pure functions.

   Sixteen of their 160 menu items are reports this site can already answer from
   what the dashboard has loaded — no new doctype, no payroll run, no policy
   engine. Each one is a function from what the site returned to a list of rows,
   with no React and no network, so the rule each report embodies can be argued
   about in `tests/reports.test.js` against a handful of punches.

   Relative imports, not the `@` alias — `npm test` runs these in Node, where
   the alias does not exist. Same rule as `lib/summary.js` and `lib/profedit.js`.

   **Every one of these is a reader, and none of them is enforcement.** They
   count what happened; nothing here decides anything, and nothing here writes.
   The three rules they share are worth stating once rather than in sixteen
   comments:

   - **A day is compared as a string.** `"2026-09-08"` has no time and no zone,
     and parsing it as an instant makes it the previous day for anybody reading
     it after half past five in Chennai.
   - **A punch is evidence and its absence is not.** A person with no punch is
     "no punch on this day", never "absent" on its own — leave, a holiday and a
     machine that failed to deliver all look identical from here, and the two
     reports that do say Absent say what they excluded.
   - **People, not rows.** Anything counting people counts distinct employees,
     because one person with two applications or six punches is one person.
   --------------------------------------------------------------------------- */

const day = (v) => String(v || "").slice(0, 10);

/** Punches on one day, grouped by employee, in time order. The shape every
    attendance report below starts from. */
export function punchesByEmployee(checkins, on) {
	const by = new Map();
	for (const c of checkins || []) {
		if (on && day(c.time) !== on) continue;
		const list = by.get(c.employee) || [];
		list.push(c);
		by.set(c.employee, list);
	}
	for (const list of by.values()) list.sort((a, b) => String(a.time).localeCompare(String(b.time)));
	return by;
}

/** Who is on approved leave on a day, as a Set of employee ids.

    Inclusive at both ends: `from_date` and `to_date` are the first and last day
    off, not a half-open range. Getting that wrong makes somebody absent on the
    last day of their own holiday. */
export function onLeave(leaveRows, on) {
	const who = new Set();
	for (const r of leaveRows || []) {
		const from = day(r.from_date);
		const to = day(r.to_date) || from;
		if (from && from <= on && on <= to) who.add(r.employee);
	}
	return who;
}

/* ---- Employees ---------------------------------------------------------- */

/** New Joining — people whose joining date falls in a window, newest first. */
export function newJoiners(rows, from, to) {
	return (rows || [])
		.filter((e) => {
			const d = day(e.date_of_joining);
			return d && d >= from && d <= to;
		})
		.sort((a, b) => day(b.date_of_joining).localeCompare(day(a.date_of_joining)));
}

/**
 * Employee Birthday — birthdays falling in one month, by day.
 *
 * `month` is `01`–`12`, the month alone: a birthday recurs and the stored year
 * does not, which is the same reason `summary.celebrations` throws it away.
 * A record with no `date_of_birth` is skipped rather than dated — that column
 * is the commonest gap on a migrated record and inventing one would have this
 * report wishing the wrong person.
 */
export function birthdays(rows, month) {
	return (rows || [])
		.filter((e) => e.date_of_birth && day(e.date_of_birth).slice(5, 7) === month)
		.sort((a, b) => day(a.date_of_birth).slice(8).localeCompare(day(b.date_of_birth).slice(8)));
}

/** Employees Directory — everybody, by name, with the ways to reach them. */
export function directory(rows) {
	return [...(rows || [])].sort((a, b) =>
		String(a.employee_name || "").localeCompare(String(b.employee_name || "")));
}

/**
 * Weekoff Holiday Report — which calendar each person is measured against.
 *
 * `holidays` is the store's map of list name to its days. **A person with no
 * `holiday_list` is the finding, not a blank row**: they fall back to the
 * company default, and if the company has not set one either then nothing
 * decides which of their days are holidays — which is a wrong day's pay
 * waiting to happen, so the row says `— none set` rather than being dropped.
 */
export function weekoffs(rows, holidays) {
	return (rows || []).map((e) => ({
		...e,
		list: e.holiday_list || "",
		days: e.holiday_list ? (holidays[e.holiday_list] || []).length : null,
	}));
}

/**
 * Organization Chart — `reports_to` as a tree, deepest branch first.
 *
 * Returns a flat list carrying `depth`, because a screen draws indentation and
 * a CSV cannot draw a tree at all.
 *
 * **A cycle is kept, not dropped.** Two people reporting to each other is a
 * real mistake on a real site, and a chart that silently omitted them would
 * hide it; they are emitted once, at the root, marked `cycle`.
 */
export function orgChart(rows) {
	const byId = new Map((rows || []).map((e) => [e.name, e]));
	const kids = new Map();
	for (const e of rows || []) {
		const boss = byId.has(e.reports_to) ? e.reports_to : "";
		kids.set(boss, (kids.get(boss) || []).concat([e]));
	}
	const out = [];
	const seen = new Set();
	const walk = (id, depth) => {
		for (const e of (kids.get(id) || []).sort((a, b) =>
			String(a.employee_name || "").localeCompare(String(b.employee_name || "")))) {
			if (seen.has(e.name)) continue;
			seen.add(e.name);
			out.push({ ...e, depth, reports: (kids.get(e.name) || []).length });
			walk(e.name, depth + 1);
		}
	};
	walk("", 0);
	for (const e of rows || []) {
		if (!seen.has(e.name)) out.push({ ...e, depth: 0, reports: 0, cycle: true });
	}
	return out;
}

/* ---- Attendance --------------------------------------------------------- */

/**
 * Present Report — everybody with at least one punch on the day.
 *
 * An OUT with no IN counts. A missed morning punch and a night shift that began
 * yesterday both look like that, and neither is somebody who did not turn up.
 */
export function present(rows, checkins, on) {
	const by = punchesByEmployee(checkins, on);
	return (rows || [])
		.filter((e) => by.has(e.name))
		.map((e) => {
			const list = by.get(e.name);
			return {
				...e,
				first: list[0].time,
				last: list[list.length - 1].time,
				punches: list.length,
				/* The punch itself, not only its time, so the report can say where
				   it was made. Null for somebody whose only punch was an OUT. */
				punchIn: list.find((p) => p.log_type === "IN") || null,
			};
		});
}

/**
 * Absent Report — active, not on leave, and no punch on the day.
 *
 * **This report names people who may not be paid for a day, so what it excludes
 * is the whole of it.** Leave is taken out because an approved day off is not
 * an absence; anybody with any punch is taken out for the reason above. What is
 * left is still not proof: a machine that has not delivered its log looks
 * exactly like this, which is why the screen says so and why nothing downstream
 * reads this. Errors round towards recording rather than refusing — CLAUDE.md §4.
 */
export function absent(rows, checkins, leaveRows, on) {
	const by = punchesByEmployee(checkins, on);
	const off = onLeave(leaveRows, on);
	return (rows || []).filter((e) => !by.has(e.name) && !off.has(e.name));
}

/**
 * MSP Report — missed punches.
 *
 * An odd count is a missing punch: somebody came in and never went out, or the
 * reverse. **This is the attendance report worth having first** — a missed
 * punch is somebody's pay, and it is the input to every correction, so it is
 * the one list HR can act on the same morning.
 *
 * `over` is a list of days, so a week can be checked in one read.
 */
export function missedPunches(rows, checkins, days) {
	const byName = new Map((rows || []).map((e) => [e.name, e]));
	const out = [];
	for (const on of days || []) {
		for (const [id, list] of punchesByEmployee(checkins, on)) {
			if (list.length % 2 === 0) continue;
			const e = byName.get(id);
			if (!e) continue;
			out.push({
				...e,
				on,
				punches: list.length,
				missing: list[list.length - 1].log_type === "IN" ? "OUT" : "IN",
				first: list[0].time,
				last: list[list.length - 1].time,
			});
		}
	}
	return out.sort((a, b) => b.on.localeCompare(a.on)
		|| String(a.employee_name || "").localeCompare(String(b.employee_name || "")));
}

/** In / Out Count Report — how many punches each person made on the day, and
    how they split. A count that is not two is the row worth looking at. */
export function inOutCount(rows, checkins, on) {
	const by = punchesByEmployee(checkins, on);
	return (rows || [])
		.filter((e) => by.has(e.name))
		.map((e) => {
			const list = by.get(e.name);
			return {
				...e,
				ins: list.filter((c) => c.log_type !== "OUT").length,
				outs: list.filter((c) => c.log_type === "OUT").length,
				punches: list.length,
			};
		})
		.sort((a, b) => b.punches - a.punches);
}

/** Employee Shift Report — which shift each person is on by default.

    Nothing here reads the shift's *timings*, only its name; the same limit is
    why the Start Up page's Late-In tile shows a dash. A person with no default
    shift has no window to be measured against, which is what the blank means. */
export function shiftReport(rows) {
	return (rows || []).map((e) => ({ ...e, shift: e.default_shift || "" }))
		.sort((a, b) => String(a.shift).localeCompare(String(b.shift))
			|| String(a.employee_name || "").localeCompare(String(b.employee_name || "")));
}

/**
 * Head Count And Attendance Report — headcount against punches, per group.
 *
 * `key` is the field to group on — company or department. Their report groups
 * the same way, and it is the one attendance number a manager reads without
 * opening anybody's record.
 */
export function headCount(rows, checkins, leaveRows, on, key) {
	const by = punchesByEmployee(checkins, on);
	const off = onLeave(leaveRows, on);
	const groups = new Map();
	for (const e of rows || []) {
		const k = e[key] || "—";
		const g = groups.get(k) || { group: k, team: 0, in: 0, leave: 0, notIn: 0 };
		g.team += 1;
		if (by.has(e.name)) g.in += 1;
		else if (off.has(e.name)) g.leave += 1;
		else g.notIn += 1;
		groups.set(k, g);
	}
	return [...groups.values()].sort((a, b) => b.team - a.team);
}

/* ---- Leave -------------------------------------------------------------- */

/** How many days an application covers, both ends inclusive.

    Their own reports count it this way, and a half-open range would take a day
    off everybody's balance. `total_leave_days` is used when the site set it,
    because a half day is a real thing and this arithmetic cannot see one. */
export function leaveDays(r) {
	if (r.total_leave_days != null && r.total_leave_days !== "") return Number(r.total_leave_days);
	const from = day(r.from_date);
	const to = day(r.to_date) || from;
	if (!from) return null;
	const ms = Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z");
	return Math.round(ms / 86400000) + 1;
}

/** Leave Application History — every application this dashboard holds, newest
    first, whatever its status. */
export function leaveHistory(leaveRows) {
	return [...(leaveRows || [])]
		.map((r) => ({ ...r, days: leaveDays(r) }))
		.sort((a, b) => day(b.from_date).localeCompare(day(a.from_date)));
}

/** Pending Leave Application Report — the ones still waiting on somebody.

    A status the site has not set counts as pending: an application nobody has
    decided is exactly what this report is for, and treating a blank as decided
    would hide the worst case. */
export function pendingLeave(leaveRows) {
	return leaveHistory(leaveRows).filter((r) => !r.status || r.status === "Open");
}

/** Leave Availed Detail Report — approved leave only, which is what has
    actually been taken. */
export function availedLeave(leaveRows) {
	return leaveHistory(leaveRows).filter((r) => r.status === "Approved");
}

/** Leave Monthly Availed Report — approved days by month and type.

    Grouped on the month the leave *started*. A trip crossing a month boundary
    lands wholly in the first, which is what their report does and is worth
    knowing before anybody reconciles the two. */
export function monthlyLeave(leaveRows) {
	const by = new Map();
	for (const r of availedLeave(leaveRows)) {
		const k = day(r.from_date).slice(0, 7) + " " + (r.leave_type || "—");
		const g = by.get(k) || { month: day(r.from_date).slice(0, 7), type: r.leave_type || "—", days: 0, people: new Set() };
		g.days += leaveDays(r) || 0;
		g.people.add(r.employee);
		by.set(k, g);
	}
	return [...by.values()]
		.map((g) => ({ ...g, people: g.people.size }))
		.sort((a, b) => b.month.localeCompare(a.month) || a.type.localeCompare(b.type));
}
