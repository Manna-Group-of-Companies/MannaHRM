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
