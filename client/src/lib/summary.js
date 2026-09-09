/* ---------------------------------------------------------------------------
   What the dashboard's numbers actually are.

   Pure, and importing nothing but itself — same bargain as `lib/rules.js` and
   `routes/paths.js`, and for the same reason: **these are the figures somebody
   quotes in a meeting**, so the argument about whether "present" includes a
   person who only punched out should be settleable by reading a test, not by
   opening a browser and squinting at a ring.

   Relative imports only, no `@` alias and no React. `npm test` runs these in
   Node. CLAUDE.md §3.
   --------------------------------------------------------------------------- */

/**
 * Today's punches, resolved into the four states a working day can be in.
 *
 * `checkins` is the raw `Employee Checkin` rows for today; `leaveRows` is the
 * open `Leave Application` rows; `headcount` is how many people are active.
 *
 * **Everybody is counted exactly once.** The four numbers are meant to add up
 * to `headcount`, and the way that goes wrong is double-counting: somebody who
 * punched in and out is Completed, not Completed *and* still in.
 */
export function attendanceToday(checkins, leaveRows, headcount) {
	const ins = new Set();
	const outs = new Set();
	for (const c of checkins || []) {
		if (c.log_type === "OUT") outs.add(c.employee);
		else ins.add(c.employee);
	}

	let done = 0;
	for (const e of ins) if (outs.has(e)) done++;

	/* **An OUT with no IN is a person who was here.** It happens for two real
	   reasons — a morning punch that failed to deliver, and a night shift that
	   started yesterday — and the alternative is telling somebody standing at
	   their machine that they are absent. Errors round in the safe direction;
	   see CLAUDE.md §4. */
	const present = new Set([...ins, ...outs]).size;

	/* People, not applications. One person with two overlapping applications is
	   one person on leave, and counting rows would push the ring past the
	   headcount. */
	const leave = new Set((leaveRows || []).map((r) => r.employee)).size;

	return {
		done,
		still: Math.max(0, present - done),
		leave,
		/* Never negative. On a site where somebody punched who is not on the
		   active list — a leaver whose card still works, which is a real finding
		   rather than a bug in this function — `present` can exceed `headcount`,
		   and a ring with a negative slice draws inside out. */
		absent: Math.max(0, headcount - present - leave),
		present,
	};
}

/**
 * New joiners a month, `months` back and including the month `now` is in.
 *
 * `now` is a parameter rather than a call to `new Date()` so this can be tested
 * without freezing the clock — and so a test that runs at 23:59 on the 31st
 * does not fail once a month.
 *
 * **Dates are compared as strings.** `date_of_joining` is `YYYY-MM-DD` with no
 * time and no timezone; parsed as an instant it becomes the previous day for
 * anyone reading it after half past five in Chennai. See client/README.md.
 */
export function joinersByMonth(rows, now, months = 6) {
	const out = [];
	for (let i = months - 1; i >= 0; i--) {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
		const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
		out.push({
			key: ym,
			month: d.getMonth(),
			n: (rows || []).filter((e) => String(e.date_of_joining || "").slice(0, 7) === ym).length,
		});
	}
	return out;
}

/**
 * Everything that has happened lately, merged and newest first.
 *
 * Each source hands in `{ id, kind, at }` and whatever else the caller wants to
 * carry; this only decides the order and the cut. It is here rather than in the
 * page because "newest first" over four sources with three different timestamp
 * fields is the part that can be wrong without looking wrong.
 *
 * **A row with no timestamp is dropped, not sorted to the end.** An undated
 * event in a feed ordered by date is a row that claims to have happened at a
 * time it did not.
 */
export function mergeActivity(sources, limit = 9) {
	return sources
		.flat()
		.filter((r) => r && r.at)
		/* Lexicographic, because every one of these is `YYYY-MM-DD` or
		   `YYYY-MM-DD HH:MM:SS` — the same shape, so string order is time order,
		   and no Date is constructed for a value that has no timezone. */
		.sort((a, b) => String(b.at).localeCompare(String(a.at)))
		.slice(0, limit);
}

/**
 * Factor HR's own six attendance buckets, for the Start Up page.
 *
 * Their Start Up screen — captured 8 September 2026 — counts the day as: Team
 * Size, Total In, Not Yet In, Late-In, On Leave, Fut. Leave. Those are the
 * words HR reads every morning, so they are the words this app uses, rather
 * than a tidier set nobody at Manna has ever seen.
 *
 * **`late` is null and not zero, and that is the finding.** Late means "punched
 * in after the shift began", and this dashboard does not hold shift start
 * times — `Shift Type` is read for its names only. A zero there would read as
 * "nobody was late", which on a factory of 160 is a claim, and a wrong one. So
 * it is absent and the panel says what it would need.
 *
 * @param {object} today  what `attendanceToday` returned
 * @param {number} headcount active employees in scope
 * @param {number} future  people with leave that starts after today
 */
export function startupBuckets(today, headcount, future) {
	return {
		team: headcount,
		in: today.present,
		notIn: today.absent,
		late: null,
		leave: today.leave,
		future: future,
	};
}

/**
 * People whose leave has not started yet — Factor HR's "Fut. Leave".
 *
 * Distinct people, not applications, for the same reason `attendanceToday`
 * counts people: one person with two approved trips is one person, and a count
 * of rows drifts past the headcount.
 *
 * Compared as strings. `from_date` is `YYYY-MM-DD` with no time and no zone;
 * parsed as an instant it becomes the previous day for anyone reading it after
 * half past five in Chennai.
 */
export function futureLeave(leaveRows, today) {
	const who = new Set();
	for (const r of leaveRows || []) {
		if (r.from_date && String(r.from_date) > today) who.add(r.employee);
	}
	return who.size;
}

/**
 * Birthdays and work anniversaries in a window — Factor HR's Wish Celebration.
 *
 * **The year is thrown away and the day is kept.** A birthday recurs; the
 * stored date does not. So the comparison is on `MM-DD`, which is also why the
 * window has to be given as a list of days rather than a range — a window that
 * crosses the new year is two ranges, and every off-by-one in this kind of code
 * lives exactly there.
 *
 * `kind` is what is being celebrated, because their panel counts the three
 * separately and shows them on separate tabs. Marriage is theirs and not ours:
 * ERPNext's Employee has no wedding date under any name, so nothing here can
 * produce one.
 *
 * @param {Array}  rows      employees
 * @param {string} today     `YYYY-MM-DD`
 * @param {number} days      how far ahead to look, today included
 */
export function celebrations(rows, today, days = 30) {
	const wanted = new Map();
	const start = new Date(today + "T00:00:00Z");
	for (let i = 0; i < days; i++) {
		const d = new Date(start.getTime() + i * 86400000);
		wanted.set(d.toISOString().slice(5, 10), i);
	}

	const out = [];
	for (const e of rows || []) {
		for (const [field, kind] of [["date_of_birth", "birthday"], ["date_of_joining", "work"]]) {
			const on = e[field];
			if (!on) continue;
			const md = String(on).slice(5, 10);
			if (!wanted.has(md)) continue;
			/* A work anniversary on the day somebody joined is not an
			   anniversary, it is their first day — and wishing a new starter a
			   happy first year is the kind of mistake people remember. */
			if (kind === "work" && String(on).slice(0, 4) === today.slice(0, 4)) continue;
			out.push({
				name: e.name,
				employee_name: e.employee_name,
				department: e.department,
				designation: e.designation,
				kind,
				on: md,
				inDays: wanted.get(md),
				years: kind === "work" ? Number(today.slice(0, 4)) - Number(String(on).slice(0, 4)) : null,
			});
		}
	}
	return out.sort((a, b) => a.inDays - b.inDays || (a.employee_name || "").localeCompare(b.employee_name || ""));
}

/* ---------------------------------------------------------------------------
   Factor HR's Welcome page carries its own controls, not just its own panels.
   Read off the page on 8 September 2026: Active / InActive / All above the
   headline counts, a Search inside the attendance summary, Expand All and
   Collapse All over the panels, and a composer behind Announcements and CEO
   Speak. What follows is the arithmetic behind the first two.
   --------------------------------------------------------------------------- */

/** Their Active / InActive / All switch, as a filter over the employee list.

    `InActive` is everybody not Active — Inactive, Suspended and Left together —
    because that is what their own tab counts, and splitting it into three here
    would make the two screens disagree by exactly the suspended. */
export function byStanding(rows, standing) {
	if (standing === "active") return (rows || []).filter((e) => e.status === "Active");
	if (standing === "inactive") return (rows || []).filter((e) => e.status !== "Active");
	return [...(rows || [])];
}

/**
 * Their Search, inside the day's attendance list.
 *
 * Matches the columns a reader can see — name, code, department, designation —
 * because the column somebody is searching by is the one in front of them. Not
 * the record id: nobody types `HR-EMP-00042`, and matching it would make a
 * search for "42" return a person called nothing like it.
 */
export function findPeople(rows, q) {
	const needle = String(q || "").trim().toLowerCase();
	if (!needle) return [...(rows || [])];
	return (rows || []).filter((e) => [
		e.employee_name, e.employee_number, e.department, e.designation,
	].join(" ").toLowerCase().includes(needle));
}
