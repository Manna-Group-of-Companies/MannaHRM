"""Validation on `Employee Checkin` — the one place a punch is decided.

This runs on the server, on the server's clock. Every client may check the same
rules to give a fast and kind error message; none of them is the thing that
decides. That is the whole reason this app exists: attendance is payroll, and a
rule enforced only in a phone app is a suggestion to anyone holding `curl`.

Errors round in the safe direction, and each one says which way. The bias
throughout is that **refusing somebody who did turn up is the expensive
mistake** — it costs a person their day's pay and an argument with HR, while
letting a doubtful punch through costs a flag on a report that a human reads.
So a punch that cannot be judged is recorded and marked, never refused.
"""

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime

from manna_hr.geo import format_distance, is_real_coordinate, metres_between
from manna_hr.settings import hr_settings

# `custom_source` values. A punch always has exactly one origin, and which rules
# apply to it follows from which one.
SOURCE_BIOMETRIC = "biometric"
SOURCE_MOBILE = "mobile"
SOURCE_REGULARIZATION = "regularization"
SOURCE_MANUAL = "manual"

# `custom_geofence_result` values.
GEO_INSIDE = "inside"
GEO_OUTSIDE = "outside"
GEO_NOT_CHECKED = "not_checked"
GEO_NO_LOCATION = "no_location"

REGULARIZATION_PREFIX = "REG-"


def validate(doc, method=None):
	"""`Employee Checkin` before_validate. Wired in hooks.py."""
	settings = hr_settings()

	doc.custom_source = _classify_source(doc, settings)
	_apply_server_clock(doc, settings)
	_check_punch_window(doc, settings)
	_check_geofence(doc, settings)


# ------------------------------------------------------------------ source ---


def _classify_source(doc, settings):
	"""Where this punch came from.

	Derived from `device_id` rather than trusted from the client, because
	`custom_source` decides which rules are skipped and a client must not be
	able to name itself a fingerprint machine.
	"""
	device = (doc.device_id or "").strip()

	if device.startswith(REGULARIZATION_PREFIX):
		return SOURCE_REGULARIZATION

	prefix = (settings.trusted_device_prefix or "").strip()
	if prefix and device.startswith(prefix):
		return SOURCE_BIOMETRIC

	# No device id at all is somebody typing into Desk.
	return SOURCE_MOBILE if device else SOURCE_MANUAL


def _is_self_service(doc):
	"""True when the person punching is the person being punched.

	The rules bind self-service only. An approver writing somebody else's punch
	is an approved regularization, whose whole purpose is to record a time other
	than "now" and which carries its own audit trail. A bridge writing a
	machine's punches is replaying history it did not choose.
	"""
	if not doc.employee:
		return False
	user = frappe.db.get_value("Employee", doc.employee, "user_id")
	return bool(user) and user == frappe.session.user


# ------------------------------------------------------------------- clock ---


def _apply_server_clock(doc, settings):
	"""A self-service punch happens now, whatever the phone says.

	The phone's clock belongs to the person being measured. Android will hand an
	app any time the owner sets, so a rep who wants an 8am punch at 10am need
	only change one setting. Overwriting rather than validating is deliberate:
	comparing the two and complaining about a skew leaks the tolerance, and
	somebody will find its edge.

	**Machine punches are exempt, and must be.** The bridge replays punches that
	happened while it could not reach the site — after a power cut that can be
	days of real attendance. Stamping those with `now` would collapse a week
	onto one afternoon.
	"""
	if doc.custom_source != SOURCE_MOBILE:
		return
	if not _is_self_service(doc):
		return

	doc.time = now_datetime()


# ------------------------------------------------------------------ window ---


def _check_punch_window(doc, settings):
	"""Refuse a self-service punch outside the working window.

	Not a fraud check — an honesty check on the shape of the day. Somebody
	punching in at 2am either mistyped or is doing something that needs a human
	to look at it, and the regularization queue is where a human looks.

	Carried over from the sales system, which sets the window at 05:00-21:30 and
	has run on those two numbers since launch.
	"""
	if not settings.enforce_punch_window:
		return
	if doc.custom_source not in (SOURCE_MOBILE,):
		return
	if not _is_self_service(doc):
		return

	when = get_datetime(doc.time or now_datetime())
	minute = when.hour * 60 + when.minute

	opens = _minute_of(settings.punch_in_from, default=5 * 60)
	closes = _minute_of(settings.punch_out_until, default=21 * 60 + 30)

	if minute < opens:
		frappe.throw(
			_("Punch-in opens at {0}. If you started earlier, punch in now and "
			  "request a regularization for the earlier time.").format(
				_format_minute(opens)
			),
			title=_("Too early"),
		)

	if minute > closes:
		frappe.throw(
			_("Punching closed at {0}. Request an Attendance Regularization for "
			  "this day instead.").format(_format_minute(closes)),
			title=_("Too late"),
		)


def _minute_of(value, default):
	"""A Frappe Time field as minutes past midnight. Blank falls back."""
	if not value:
		return default
	try:
		# Frappe hands back either a `timedelta` or a "HH:MM:SS" string.
		if hasattr(value, "total_seconds"):
			return int(value.total_seconds() // 60)
		hours, minutes = str(value).split(":")[:2]
		return int(hours) * 60 + int(minutes)
	except (ValueError, TypeError):
		# A malformed setting must not lock the whole workforce out, so it
		# falls back to the shipped default rather than throwing.
		return default


def _format_minute(minute):
	return "{0:d}:{1:02d}".format(minute // 60, minute % 60)


# ---------------------------------------------------------------- geofence ---


def _check_geofence(doc, settings):
	"""Measure the punch against where this employee is meant to punch.

	Four outcomes, and only one of them refuses:

	  - `inside`       — measured, and within the radius.
	  - `outside`      — measured, and beyond it. Refused, unless the employee
	                     is allowed to punch remotely.
	  - `no_location`  — nothing to measure against. Recorded, never refused.
	  - `not_checked`  — enforcement off, a machine punch, or a regularization.

	The distance is written on every punch, not only the failures. A month of
	distances is what tells you whether the radius is right; refusals alone only
	ever tell you where it was too small.
	"""
	# A fingerprint machine is bolted to the wall it is meant to be at. Asking
	# it to prove where it is would refuse every factory punch, since no ZK
	# device sends a coordinate.
	if doc.custom_source in (SOURCE_BIOMETRIC, SOURCE_REGULARIZATION, SOURCE_MANUAL):
		doc.custom_geofence_result = GEO_NOT_CHECKED
		return

	if not settings.enforce_geofence:
		doc.custom_geofence_result = GEO_NOT_CHECKED
		return

	has_fix = is_real_coordinate(doc.latitude, doc.longitude)

	if not has_fix:
		# A phone that will not give a coordinate is either indoors against
		# concrete or has the permission switched off. Which one it is decides
		# whether refusing is fair, and the server cannot tell, so the setting
		# does.
		if settings.require_location_for_mobile:
			frappe.throw(
				_("Your location could not be read. Turn location on and try "
				  "again, or ask HR to record this punch for you."),
				title=_("No location"),
			)
		doc.custom_geofence_result = GEO_NO_LOCATION
		return

	location = _work_location_for(doc.employee)

	if not location or not is_real_coordinate(location.latitude, location.longitude):
		# Nobody has captured this gate yet. Refusing here would punish the
		# employee for a gap in master data that is not theirs to fill.
		doc.custom_geofence_result = GEO_NO_LOCATION
		return

	distance = metres_between(
		float(doc.latitude),
		float(doc.longitude),
		float(location.latitude),
		float(location.longitude),
	)
	doc.custom_distance_metres = round(distance, 1)

	radius = location.radius_metres or settings.default_radius_metres or 300

	if distance <= radius:
		doc.custom_geofence_result = GEO_INSIDE
		return

	doc.custom_geofence_result = GEO_OUTSIDE

	# Field staff, drivers and reps work by definition away from a gate. Their
	# punch is still measured and still recorded — the coordinate is the
	# evidence — it simply does not refuse.
	if frappe.db.get_value("Employee", doc.employee, "custom_allow_remote_punch"):
		return

	frappe.throw(
		_("You are {0} from {1}. Punch when you reach it, or request a "
		  "regularization if you are working elsewhere today.").format(
			format_distance(distance), location.location_name
		),
		title=_("Too far from your work location"),
	)


def _work_location_for(employee):
	"""The Work Location this employee is expected to punch at, or None."""
	name = frappe.db.get_value("Employee", employee, "custom_work_location")
	if not name:
		return None

	location = frappe.db.get_value(
		"Work Location",
		name,
		["location_name", "latitude", "longitude", "radius_metres", "is_active"],
		as_dict=True,
	)
	# A location switched off is a gate that closed. Treated as absent rather
	# than as a zero-radius fence nobody can pass.
	if not location or not location.is_active:
		return None
	return location
