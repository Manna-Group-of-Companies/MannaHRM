"""Punches recorded twice: which copy stays, and which are set aside.

On 19 November 2026, 1,383 of November's 4,345 `Employee Checkin` rows were a
second (or third) copy of a punch already there — the same person at the same
second. `checkin._refuse_duplicate` stops new ones; this settles the ones
already on the site.

**Nothing is deleted.** A punch is evidence (CLAUDE.md §5) and the dashboard
never deletes one. The extra copies are set aside with `skip_auto_attendance`,
which is how hrms itself sets a punch aside, and each gets a comment naming
the copy kept. Under "Alternating entries as IN and OUT" a doubled punch turns
every punch after it the wrong way round, so the days they were part of are
rebuilt — `dedupe_site` hands those to `reprocess_site`.

Pure. Each row is a dict with `name`, `employee`, `time`, `creation`,
`attendance`, `log_type` and `skip_auto_attendance`.
"""


def groups(rows):
	"""Rows sharing an employee and a second, two or more to a group."""
	by_key = {}
	for r in rows:
		by_key.setdefault((r["employee"], str(r["time"])[:19]), []).append(r)
	return [g for g in by_key.values() if len(g) > 1]


def keeper(group):
	"""The copy that stays.

	The one a day was built from first — its Attendance already names it — then
	one that carries a direction, since a direction is information and its
	absence is not, then the first one made.
	"""
	return sorted(
		group,
		key=lambda r: (
			0 if r.get("attendance") else 1,
			0 if r.get("log_type") else 1,
			str(r.get("creation") or ""),
			r["name"],
		),
	)[0]


def plan(rows):
	"""{"keep": [...], "set_aside": [(name, kept_name)], "rebuild": {attendance}}.

	`rebuild` are the Attendance rows a set-aside copy had already been counted
	into — named, not dated, because a night's day is not its punch's date."""
	keep, aside, rebuild = [], [], set()
	for g in groups(rows):
		k = keeper(g)
		keep.append(k["name"])
		for r in g:
			if r["name"] == k["name"] or r.get("skip_auto_attendance"):
				continue
			aside.append((r["name"], k["name"]))
			if r.get("attendance"):
				rebuild.add(r["attendance"])
	return {"keep": keep, "set_aside": aside, "rebuild": rebuild}
