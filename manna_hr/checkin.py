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

from manna_hr import applogin_site, rules
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
	_check_photo(doc)
	_refuse_duplicate(doc)
	_day_or_night(doc)


# ------------------------------------------------------------- night shift ---


def _day_or_night(doc):
	"""A machine punch that starts a night gives the night shift first.

	Here rather than in `adms_site`, so the bridge's punches get it too, and
	before hrms's validation, which is what gives the checkin its shift.
	**Never holds up the punch**: the punch is the pay, and its shift can be
	put right after (reprocess_site). A failure is rolled back alone and logged.
	"""
	if not doc.is_new() or doc.custom_source != SOURCE_BIOMETRIC or not doc.employee:
		return
	from manna_hr import rota, rota_site

	# HR assigns every shift from 1 December 2026 (rota.NIGHT_FROM_PUNCH).
	if not rota.NIGHT_FROM_PUNCH:
		return

	frappe.db.savepoint("manna_rota")
	try:
		rota_site.before_deliver(doc.employee, get_datetime(doc.time), doc.log_type or None)
	except Exception:
		frappe.db.rollback(save_point="manna_rota")
		frappe.log_error(title="Day or night not decided for {0} at {1}".format(doc.employee, doc.time))


# --------------------------------------------------------------- duplicates ---

#: hrms's own words for this refusal. The bridge reads them as "delivered"
#: (bridge/mannabridge/sink.py ALREADY_THERE), and so must every sender.
DUPLICATE_MESSAGE = "This employee already has a log with the same timestamp."


class DuplicatePunchError(frappe.ValidationError):
	"""The same person at the same second, already on the site."""


def _refuse_duplicate(doc):
	"""One punch per person per second, whatever its direction says.

	hrms checks this too, but with `log_type` in the match and with nothing
	between its check and its insert — so a machine posting IN and a bridge
	posting no direction, or two deliveries of one machine post running at
	once, both got through: 1,383 of November's 4,345 punches on 19 Nov 2026.

	**This refuses nothing that was not already there.** A second copy of one
	punch is not a punch, and the first copy is the evidence. The lock on the
	Employee row makes the check and the insert one step for that person, so
	two senders at the same moment take turns rather than both finding nothing.
	"""
	if not doc.is_new() or not doc.employee or not doc.time:
		return
	frappe.db.sql("SELECT name FROM `tabEmployee` WHERE name = %s FOR UPDATE", doc.employee)
	twin = frappe.db.get_value(
		"Employee Checkin",
		{"employee": doc.employee, "time": get_datetime(doc.time), "name": ("!=", doc.name or "")},
		"name",
	)
	if twin:
		frappe.throw(
			"{0} ({1})".format(_(DUPLICATE_MESSAGE), twin),
			exc=DuplicatePunchError,
			title=_("Already recorded"),
		)


# ------------------------------------------------------------------- photo ---


def _check_photo(doc):
	"""Keep a punch photo only if the person saving it is the one who uploaded it.

	The photo is what tells HR who pressed the button, and a URL is only a
	string: without this, a punch could carry a colleague's face from last
	week. Cleared rather than refused, in the safe direction — a punch with no
	photo is drawn as having none on the dashboard, which is the flag a human
	reads, and the person still has their day.
	"""
	url = (doc.get("custom_photo") or "").strip()
	if not url:
		return
	if not doc.is_new() and not doc.has_value_changed("custom_photo"):
		return
	if not frappe.db.exists("File", {"file_url": url, "owner": frappe.session.user}):
		doc.custom_photo = None


# ------------------------------------------------------------------ source ---


def _classify_source(doc, settings):
	"""Where this punch came from.

	Derived from `device_id` rather than trusted from the client, because
	`custom_source` decides which rules are skipped and a client must not be
	able to name itself a fingerprint machine.

	**The device id is believed only from a writer who could have made it.**
	It used to be believed from anybody: an employee's own login posting
	`device_id` = `BIO-…`, `REG-…` or nothing was a machine, a correction or
	HR, and skipped the server clock, the window and the fence — a back-dated
	punch for the asking (audit B1, 19 Nov 2026). Now a login that is neither
	HR nor the site itself is a phone, whatever it says, and may punch only
	for its own Employee. The machines arrive as the site (ADMS, a guest
	request that only `adms_site` can turn into a checkin) or as the bridge's
	key (System Manager). A correction is marked by `regularization.apply`
	with a flag no request can set.
	"""
	device = (doc.device_id or "").strip()

	if doc.flags.get("manna_regularization"):
		return SOURCE_REGULARIZATION

	if not _writer_is_trusted():
		if doc.employee and frappe.session.user not in applogin_site.logins_of(doc.employee):
			frappe.throw(_("You can punch only for yourself."), title=_("Not your punch"))
		return SOURCE_MOBILE

	if device.startswith(REGULARIZATION_PREFIX):
		return SOURCE_REGULARIZATION

	prefix = (settings.trusted_device_prefix or "").strip()
	if prefix and device.startswith(prefix):
		return SOURCE_BIOMETRIC

	# No device id at all is somebody typing into Desk.
	return SOURCE_MOBILE if device else SOURCE_MANUAL


#: Logins whose `device_id` is believed. HR keys punches in by hand and the
#: bridge's key is a System Manager; everybody else is a phone.
TRUSTED_ROLES = frozenset(("HR Manager", "HR User", "System Manager"))


def _writer_is_trusted():
	user = frappe.session.user
	# Administrator: scheduled jobs and bench. Guest: an ADMS post from a
	# machine — Guest holds no permission on Employee Checkin, so the only way
	# a guest request makes one is through adms_site's own code.
	if user in ("Administrator", "Guest"):
		return True
	return bool(TRUSTED_ROLES & set(frappe.get_roles(user)))


def _is_self_service(doc):
	"""True when the person punching is the person being punched.

	The rules bind self-service only. An approver writing somebody else's punch
	is an approved regularization, whose whole purpose is to record a time other
	than "now" and which carries its own audit trail. A bridge writing a
	machine's punches is replaying history it did not choose.
	"""
	if not doc.employee:
		return False
	return frappe.session.user in applogin_site.logins_of(doc.employee)


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

	# A punch the phone kept while it had no signal and sent later keeps the time
	# it was made, within limits (rules.queued_punch_time) — stamping it with the
	# moment it arrived would put an 8am punch-in at 2pm. Marked, so HR can see
	# on the punch itself that it did not arrive when it happened.
	if rules.is_queued_device(doc.device_id):
		now = now_datetime()
		kept = rules.queued_punch_time(get_datetime(doc.time) if doc.time else None, now)
		if kept is not None:
			doc.time = kept
			note = _("saved offline, sent {0}").format(now.strftime("%d-%b %H:%M"))
			doc.custom_device_info = " · ".join(x for x in ((doc.get("custom_device_info") or "").strip(), note) if x)
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
		# Still measured. The fence has been off since 29 September 2026, and
		# a month of distances is how somebody decides whether to turn it back
		# on, and at what radius — so the distance is written whenever there
		# is a coordinate and a place to measure it from.
		location = _work_location_for(doc.employee) if is_real_coordinate(doc.latitude, doc.longitude) else None
		if location and is_real_coordinate(location.latitude, location.longitude):
			doc.custom_distance_metres = round(metres_between(
				float(doc.latitude), float(doc.longitude), float(location.latitude), float(location.longitude),
			), 1)
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

	# 1000m rather than the gate-sized 300m this used to fall back to: with five
	# Work Locations now in play, a location nobody has set a radius on yet is
	# more likely to be a yard or a compound than a single gate. Set
	# radius_metres on the Work Location itself for anywhere that is smaller.
	radius = location.radius_metres or settings.default_radius_metres or 1000

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
