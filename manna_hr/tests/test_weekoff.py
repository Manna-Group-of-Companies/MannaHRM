"""Sunday is the week off, never a holiday — on every Holiday List saved (26 Nov 2026)."""

from datetime import date

from manna_hr import weekoff


class _Row(dict):
	def __getattr__(self, k):
		return self.get(k)

	def __setattr__(self, k, v):
		self[k] = v


class _Doc:
	def __init__(self, rows):
		self.holidays = [_Row(r) for r in rows]

	def get(self, k):
		return getattr(self, k)


def test_a_sunday_row_typed_as_a_holiday_is_saved_as_the_week_off():
	doc = _Doc([
		{"holiday_date": "2026-11-08", "description": "Some festival", "weekly_off": 0},
		{"holiday_date": date(2026, 11, 15), "description": "Sunday", "weekly_off": 1},
		{"holiday_date": "2026-12-25", "description": "Christmas", "weekly_off": 0},
	])
	weekoff.sundays_off(doc)
	assert [r.weekly_off for r in doc.holidays] == [1, 1, 0]
	assert doc.holidays[0].description == "Some festival"


def test_the_hook_is_on_holiday_list_validate():
	import ast
	import pathlib

	src = (pathlib.Path(weekoff.__file__).parent / "hooks.py").read_text(encoding="utf-8")
	events = next(n.value for n in ast.parse(src).body
		if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "doc_events")
	events = ast.literal_eval(events)
	assert events["Holiday List"]["validate"] == "manna_hr.weekoff.sundays_off"
