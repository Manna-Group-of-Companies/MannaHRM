"""Sunday is the week off, never a holiday (asked for by HR, 26 November 2026).

Holiday List `validate`: every Sunday row is marked `weekly_off`, whatever it
was typed as. A festival that falls on a Sunday keeps its name, and is read
everywhere — the website, the phone app, hrms's shift job, payroll — as the
Sunday's week off, not as a holiday. The rule itself is
`rules.sundays_are_week_off`, which `api.my_holidays` uses too.
"""

from datetime import date


def sundays_off(doc, method=None):
	for row in doc.get("holidays") or ():
		d = row.get("holiday_date")
		if not d:
			continue
		day = d if isinstance(d, date) else date.fromisoformat(str(d)[:10])
		if day.weekday() == 6 and not int(row.get("weekly_off") or 0):
			row.weekly_off = 1
