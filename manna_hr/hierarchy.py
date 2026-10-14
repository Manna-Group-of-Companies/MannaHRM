"""The employee hierarchy: seven levels, top down, and which level a job is.

Asked for 10 October 2026: a chart of Executive Director, Vice President,
Head, Manager, Assistant Manager, In-charge and Trainee, in that order.

The levels are hrms **Employee Grade** rows — the stock master `Employee.grade`
links to, already on the profile, the exports and the import sheet — so a
person's level is one field on their record and nothing invented beside it.
What Employee Grade does not carry is an order, and a chart is nothing without
one: that order is `LEVELS` here, and only here.

**A level is read off the grade, and suggested off the designation.** On
10 October 2026 nobody on the site held a grade, so a chart drawn from the
field alone was seven empty bands. `level_of` reads the words of a designation
— `ASST.MANAGER-ACCOUNTS`, `Operations Incharge`, `Head, Maintenance` — and
says which level that job is, so the chart can show where somebody would sit
and HR can save it with one click. A suggestion is never the fact: the chart
draws it as a suggestion until it is on the record. Ninety plant helpers match
nothing, which is right — the ladder is the management line, and the floor is
listed under it rather than forced onto a rung.

Pure: no `frappe`, read by the client's copy (`client/src/lib/hierarchy.js`,
pinned by a test) and by `tools/setup_hierarchy.py`.
"""

import re

#: Top down. The index is the rank — 0 is the top of the chart.
LEVELS = (
	"Executive Director",
	"Vice President",
	"Head",
	"Manager",
	"Assistant Manager",
	"In-charge",
	"Trainee",
)

#: Words in a designation that make it a level, tried **in this order** —
#: `ASSISTANT MANAGER` has to be found before `MANAGER` finds it, and
#: `EXECUTIVE DIRECTOR` before a bare `DIRECTOR` would. Compared without
#: regard to case, and with `.`, `-`, `,` and `/` read as spaces, so
#: `ASST.MANAGER-ACCOUNTS` and `Audit In-charge` match the way they are spelled
#: on the site (10 October 2026).
LEVEL_WORDS = (
	("EXECUTIVE DIRECTOR", "Executive Director"),
	("VICE PRESIDENT", "Vice President"),
	("ASSISTANT MANAGER", "Assistant Manager"),
	("ASST MANAGER", "Assistant Manager"),
	# A general manager heads the company, above its managers (HR, 10 Oct 2026).
	("GENERAL MANAGER", "Head"),
	("HEAD", "Head"),
	("MANAGER", "Manager"),
	("IN CHARGE", "In-charge"),
	("INCHARGE", "In-charge"),
	("TRAINEE", "Trainee"),
)


def words_of(designation):
	"""A designation as the words it holds, upper-cased, one space apart."""
	return " ".join(re.sub(r"[.,/\-]+", " ", str(designation or "")).upper().split())


def level_of(designation):
	"""The level a designation names, or None — a job with no rung on this ladder."""
	text = " " + words_of(designation) + " "
	for words, level in LEVEL_WORDS:
		if " " + words + " " in text:
			return level
	return None


def rank(level):
	"""Where a level sits, top first; a name that is not a level sorts below all."""
	return LEVELS.index(level) if level in LEVELS else len(LEVELS)
