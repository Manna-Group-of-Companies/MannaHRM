"""A punch that arrives after its day was built: the day is built again with it.

hrms makes a day's `Attendance` once, from the punches on the site when its
shift job runs. A punch that reaches the site after that — a machine that was
offline overnight, a bridge PC that was switched off, an Employee made or
switched on after their days were marked Absent, a bridge that closed every
shift in the group at once — finds the day already made. hrms tries to make it
a second time, is refused (`DuplicateAttendanceError`, or
`OverlappingShiftAttendanceError`), and **sets the punch aside**:
`skip_auto_attendance`, and a comment that begins "Reason for skipping auto
attendance". The day stays as it was built without the punch, and the
dashboard leaves set-aside punches out, so the punch is never seen again.

On 26 November 2026 the live site held 64 such punches: the punch-outs of
25 November at MRP Gate 1, which the machine sent at 08:33 the next morning,
after hrms had closed the day at 20:02 on a Hi-Tech bridge's say-so; a month of
one man's punches, delivered the day his machine number was put right, onto
days already marked Absent; and others. A punch-in or punch-out must never be
lost (HR, 26 November 2026), so two things here:

- **On arrival** (`rebuild_on_arrival`): a punch whose day is already built
  rebuilds that day. hrms never gets to set it aside.
- **After the fact** (`releasable`): a punch hrms set aside for exactly that
  reason is released and its day rebuilt — for the race where the shift job
  reached it first, and for the ones already on the site.

Rebuilding a day is `reprocess_site`'s: cancel the Attendance the shift job
made, never a leave's or an Attendance Request's, never in a submitted month,
and let the shift job make it again from every punch. Nothing here writes
`Attendance` (CLAUDE.md §5).

**What is never released.** A second copy of a punch that already counts — the
bridge's copy of a machine punch arriving after the machine's own; a copy
`dedupe` set aside. A punch set aside on a day made from leave or a request,
which is HR's to decide. A punch in a submitted month (`freeze` holds those,
and gives them back when the month reopens). And a punch this has released
once already and hrms has set aside again: twice is not a race, it is a day
the shift job cannot make, and going round again every ten minutes would only
bury the punch in comments. Those are listed for HR (`latepunch_site.preview`).

Pure: no `frappe`. Comments are `{"content", "creation"}`; HTML is allowed in
`content`, as hrms writes it.
"""

import re
from datetime import date, datetime

from manna_hr.dedupe import keeper
from manna_hr.reprocess import is_generated as made_from_punches

#: hrms's own words at the head of the comment it writes on a punch it sets
#: aside (`employee_checkin.add_comment_in_checkins`).
HRMS_SET_ASIDE = "Reason for skipping auto attendance"

#: hrms's refusals that mean "this day was already made". Both are the day
#: being made a second time; nothing else hrms says on a set-aside punch is.
ALREADY_MARKED = (
	"is already marked for the date",
	"is already marked for an overlapping shift",
)

#: The comment this module writes when it releases a punch. Found again by
#: this text, which is how a punch is released once and never twice — so it
#: is a constant, not a sentence to reword.
RELEASED = "Released: this punch arrived after its day was made, so the day is made again with it."

#: Why a set-aside punch is left alone. Shown to HR on the preview.
KEPT_DUPLICATE = "a second copy of a punch that already counts"
KEPT_FROZEN = "the month is submitted"
KEPT_NOT_LATE = "set aside for another reason, or by a person"
KEPT_TWICE = "released once already and set aside again: a person has to look at this day"
KEPT_NOT_PUNCHES = "the day was made from leave or a request, not from punches: HR decides"

_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")


def text_of(content):
	"""A comment's words, without the HTML hrms wraps them in."""
	return _SPACE.sub(" ", _TAG.sub(" ", str(content or ""))).strip()


def is_late_set_aside(content):
	"""True for hrms's comment on a punch it set aside because its day was made."""
	words = text_of(content)
	return HRMS_SET_ASIDE in words and any(p in words for p in ALREADY_MARKED)


def is_release(content):
	return RELEASED in text_of(content)


def blocking_attendance(content):
	"""The Attendance hrms names as already made, or None.

	hrms ends both sentences with `: <name>` and the name is a link; the text
	after the last `: ` is the name, whatever naming series the site uses.
	"""
	words = text_of(content)
	if not is_late_set_aside(words) or ": " not in words:
		return None
	name = words.rsplit(": ", 1)[1].strip().split(" ")[0]
	return name or None


def _when(c):
	return str(c.get("creation") or "")


def latest_late_comment(comments):
	"""hrms's most recent "already made" comment on the punch, or None."""
	late = [c for c in comments or () if is_late_set_aside(c.get("content"))]
	return max(late, key=_when) if late else None


def releasable(punch, comments, has_live_twin=False, frozen=False, blocker=None):
	"""`(True, None)` to release this punch, else `(False, why)`.

	`punch` is `{"skip_auto_attendance", "attendance"}`. `comments` are the
	punch's comments. `has_live_twin`: another punch for the same person at the
	same second that is not set aside. `frozen`: its day is in a submitted
	month. `blocker`: the Attendance hrms named, as `{"status",
	"leave_application", "attendance_request", "docstatus"}`, or None when it
	is gone or could not be read.
	"""
	if not int(punch.get("skip_auto_attendance") or 0) or punch.get("attendance"):
		return False, None
	late = latest_late_comment(comments)
	if not late:
		return False, KEPT_NOT_LATE
	if has_live_twin:
		return False, KEPT_DUPLICATE
	if frozen:
		return False, KEPT_FROZEN
	# A comment written after hrms's — `dedupe` setting a copy aside, a person
	# superseding the punch — is somebody deciding on purpose.
	later = [c for c in comments if _when(c) > _when(late) and not is_late_set_aside(c.get("content"))]
	if any(not is_release(c.get("content")) for c in later):
		return False, KEPT_NOT_LATE
	if any(is_release(c.get("content")) for c in comments):
		return False, KEPT_TWICE
	if blocker and int(blocker.get("docstatus") or 0) == 1 and not made_from_punches(blocker):
		return False, KEPT_NOT_PUNCHES
	return True, None


def one_per_second(rows):
	"""`(release, duplicates)` from the punches cleared for release.

	**One copy of each punch, never two.** Where the gate's own post and a
	bridge's copy of it were both set aside (JAGESHAR ORAON, 1 Nov 2026 06:10),
	both pass `releasable` — neither has a twin that counts — and releasing both
	would put one punch into the day twice, which turns every punch after it
	the wrong way round under "Alternating entries as IN and OUT". The copy
	kept is `dedupe.keeper`'s, so the two rules never disagree about which
	copy is the punch. Rows are `{"name", "employee", "time", "creation",
	"attendance", "log_type"}`.
	"""
	groups = {}
	for r in rows:
		groups.setdefault((r["employee"], str(r["time"])[:19]), []).append(r)
	release, duplicates = [], []
	for group in groups.values():
		kept = keeper(group)
		release.append(kept)
		duplicates.extend(r for r in group if r is not kept)
	return release, duplicates


def rebuild_on_arrival(punch, attendance):
	"""The day to rebuild because this punch arrived after it was made, or None.

	`punch` is the checkin as hrms saved it: `shift`, `shift_start`, `offshift`,
	`skip_auto_attendance`. `attendance` are the person's submitted rows on
	that day. hrms keys a day by its shift's start date, so a night's leaving
	the next morning rebuilds the night it began.

	Only a day the shift job made is rebuilt. One made from leave stays, and
	hrms sets the punch aside against it with its comment — HR's to decide,
	and listed for them.
	"""
	if int(punch.get("skip_auto_attendance") or 0) or punch.get("offshift") or not punch.get("shift"):
		return None
	day = _day(punch.get("shift_start"))
	if day is None:
		return None
	rows = [r for r in attendance or () if _day(r.get("attendance_date")) == day and int(r.get("docstatus") or 0) == 1]
	if any(made_from_punches(r) for r in rows):
		return day
	return None


def _day(v):
	if v is None or v == "":
		return None
	if isinstance(v, datetime):
		return v.date()
	if isinstance(v, date):
		return v
	return date.fromisoformat(str(v)[:10])
