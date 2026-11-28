"""ADMS on the site: the machines push here, with no bridge in between.

Two steps, kept apart on purpose:

1. **Store.** Every punch in a post becomes an `Attendance Device Punch`,
   committed, before the machine is answered. That write — and only that —
   decides the reply. It cannot fail for a reason about the person, so a pin
   nobody carries never costs the punches posted beside it.
2. **Deliver.** Each stored punch becomes an `Employee Checkin` if somebody
   can be paid for it. One that cannot waits, with the reason on it, and the
   hourly `retry_waiting` tries it again — so filling Attendance Device ID on
   an Employee, or registering a machine's serial, delivers what was waiting.

**Why a page renderer and not `website_route_rules`.** A route rule maps a
path onto a *page*; pointed at a function it is a 404. And `/api/method/…` is
not an option: the firmware's paths are fixed, and a whitelisted function
answers JSON where the machine reads plain `OK`. Frappe asks every
`page_renderer` hook whether it wants a path before its own pages, for GET and
POST alike, and a guest POST carries no CSRF token to check.

**What still lets anybody in.** ADMS has no authentication: a machine is
whoever names its serial. An unregistered serial is parked under a device id
that cannot pass as a machine (`adms.UNKNOWN_PREFIX`), but somebody who knows a
*registered* serial — it is on the label — can post punches that skip the
geofence, exactly as a machine's do. That is the protocol, not this code; it
is why every machine punch names its machine, and why the register is kept.
"""

import frappe
from frappe.utils import add_to_date, get_datetime, getdate, now_datetime, today
from werkzeug.wrappers import Response

from manna_hr import adms, appaccess, rota
from manna_hr.checkin import DuplicatePunchError

ROOT = "iclock"

#: How often a machine's `last_seen` is written. Machines poll `getrequest`
#: every few seconds, and a write per poll is a write nobody reads.
LAST_SEEN_EVERY_MINUTES = 5


class AdmsRenderer:
	"""`page_renderer` hook. Answers `/iclock/*` and nothing else."""

	def __init__(self, path=None, http_status_code=None):
		self.path = (path or "").strip("/ ")
		self.http_status_code = http_status_code or 200

	def can_render(self):
		return self.path == ROOT or self.path.startswith(ROOT + "/")

	def render(self):
		# The machine is a guest; what it writes is the system's. As Guest, the
		# Employee field lock (fieldaccess.py) would judge a placeholder by
		# whatever it denies an anonymous login, and every row would be owned
		# by nobody. Put back in `finally`, before the request's session is
		# saved — a guest request must never leave behind an Administrator one.
		frappe.set_user("Administrator")
		try:
			text = handle(adms.endpoint_of(self.path[len(ROOT):]), frappe.request)
		except Exception:
			# Not `OK`, so the machine keeps the post and sends it again.
			frappe.db.rollback()
			frappe.log_error(title="ADMS: post not stored, the machine will send it again")
			return _reply("ERROR: not stored\n", status=500)
		finally:
			frappe.set_user("Guest")
		return _reply(text)


def _reply(text, status=200):
	return Response(text, status=status, content_type="text/plain; charset=utf-8")


def handle(endpoint, request):
	"""The reply text for one request. Raising is a refusal."""
	args = request.args
	serial = (args.get("SN") or "").strip()
	method = request.method

	if endpoint == "cdata" and method == "GET":
		if not serial:
			return "SN missing\n"
		device = _device(serial)
		_seen(device)
		stamp = frappe.db.get_global(_stamp_key(serial)) or "0"
		return adms.option_block(serial, stamp)

	if endpoint == "cdata" and method == "POST":
		table = (args.get("table") or "").upper()
		body = adms.decode(request.get_data(cache=True))
		device = _device(serial)
		_seen(device)
		if table == "ATTLOG":
			count = store_punches(serial, device, adms.parse_attlog(body))
			stamp = (args.get("Stamp") or "").strip()
			if stamp:
				frappe.db.set_global(_stamp_key(serial), stamp)
			frappe.db.commit()
			# Answered first, delivered after. Delivering a backlog inside the
			# request made a slow post time out at the machine, which sent it
			# again while the first delivery was still running — two
			# deliveries of one punch (19 Nov 2026). The store above is what
			# the reply promises; delivery can wait a few seconds for a worker.
			frappe.enqueue(
				"manna_hr.adms_site.deliver_pending",
				serial=serial,
				queue="short",
				job_id="adms-deliver-{0}".format(serial),
				deduplicate=True,
				enqueue_after_commit=True,
			)
			return "OK: {0}".format(count)
		if table in ("OPERLOG", "USERINFO"):
			record_users(serial, device, adms.parse_users(body))
			frappe.db.commit()
			return "OK"
		# Attendance photos and whatever a firmware invents: answered so the
		# machine does not think the server broken, and not kept.
		return "OK"

	if endpoint == "getrequest":
		# **`OK`, always, and never a command.** `CLEAR LOG` is sent down this
		# path, and the machine's memory is the last copy of a punch that
		# failed to deliver. Machine Command is not wired here for that reason:
		# anything that sends commands has to be unable to express a clear.
		_seen(_device(serial))
		return "OK"

	# ping, devicecmd, fdata (fingerprint templates — answered, never stored).
	return "OK"


# ----------------------------------------------------------------- machines ---


def _device(serial):
	if not serial:
		return None
	return frappe.db.get_value(
		"Attendance Device",
		{"serial_number": serial, "is_active": 1},
		["name", "device_id", "company", "last_seen", "report_direction"],
		as_dict=True,
	)


def _seen(device):
	if not device:
		return
	now = now_datetime()
	last = get_datetime(device.last_seen) if device.last_seen else None
	if last and last > add_to_date(now, minutes=-LAST_SEEN_EVERY_MINUTES):
		return
	frappe.db.set_value("Attendance Device", device.name, "last_seen", now, update_modified=False)
	frappe.db.commit()


def _stamp_key(serial):
	return "manna_adms_stamp:" + serial


# -------------------------------------------------------------------- store ---


def store_punches(serial, device, punches):
	"""Every punch in the post, stored. Returns how many the post held.

	A repeat collides on its name and is skipped — repeats are free. Anything
	else raises, and the whole post is refused.
	"""
	cutoff = str(add_to_date(now_datetime(), days=-adms.STORE_DAYS))[:19]
	device_id = device.device_id if device else adms.unknown_device_id(serial)
	for punch in punches:
		if not adms.worth_storing(punch["punched_at"], cutoff):
			continue
		name = adms.punch_key(serial, punch["device_user"], punch["punched_at"])
		if frappe.db.exists("Attendance Device Punch", name):
			continue
		# `ignore_if_duplicate`: the same post arriving twice at once. The
		# other request stored it, and that is the whole of what was wanted.
		frappe.get_doc(
			{
				"doctype": "Attendance Device Punch",
				"serial_number": serial,
				"device_id": device_id,
				"attendance_device": device.name if device else None,
				"device_user_id": punch["device_user"],
				"punched_at": punch["punched_at"],
				"status_code": punch["status"],
				"state": "Pending",
			}
		).insert(ignore_permissions=True, set_name=name, ignore_if_duplicate=True)
	return len(punches)


def record_users(serial, device, users):
	"""USER lines onto `Attendance Device User`, so a pin has a name.

	**Nobody is made an Employee here.** A machine sends its whole user list on
	first contact, and that list holds everybody who ever left without being
	deleted from it. HR hears about a pin when it *punches* — see `_ask_hr`.
	"""
	device_id = device.device_id if device else adms.unknown_device_id(serial)
	for user in users:
		name = "{0}-{1}".format(device_id, user["device_user"])
		values = {
			"name_on_device": user["name"],
			"privilege": "Admin" if user["admin"] else "User",
			"on_device": 1,
		}
		if frappe.db.exists("Attendance Device User", name):
			frappe.db.set_value("Attendance Device User", name, values)
			continue
		frappe.get_doc(
			{
				"doctype": "Attendance Device User",
				"device_id": device_id,
				"attendance_device": device.name if device else None,
				"device_user_id": user["device_user"],
				"first_seen": now_datetime(),
				**values,
			}
		).insert(ignore_permissions=True)


# ------------------------------------------------------------------ deliver ---


def deliver_pending(serial, states=("Pending",)):
	"""Deliver a machine's stored punches in `states`, oldest first.

	A post delivers only what is new. Waiting punches are the hourly job's:
	retried on every post, a backlog of them would make each post slower than
	the last until the machine timed out and sent it all again.
	"""
	filters = {"state": ["in", list(states)], "serial_number": serial}
	for name in frappe.get_all(
		"Attendance Device Punch", filters=filters, order_by="punched_at asc", pluck="name"
	):
		_deliver(frappe.get_doc("Attendance Device Punch", name))
		frappe.db.commit()


def retry_waiting():
	"""Hourly. A punch waiting on a record HR has since fixed is delivered."""
	cutoff = add_to_date(now_datetime(), days=-adms.STORE_DAYS)
	for serial in frappe.get_all(
		"Attendance Device Punch",
		filters={"state": ["in", ["Pending", "Waiting"]], "punched_at": [">=", cutoff]},
		distinct=True,
		pluck="serial_number",
	):
		deliver_pending(serial, states=("Pending", "Waiting"))


def _deliver(row):
	frappe.db.savepoint("adms_deliver")
	try:
		# Whoever holds this row delivers it; anybody else waits, then finds
		# it Delivered. Two deliveries of one post (a retried post, the hourly
		# retry, a saved Employee) used to both find no checkin and both
		# insert one.
		state = frappe.db.get_value("Attendance Device Punch", row.name, "state", for_update=True)
		if state == "Delivered":
			return
		employee, reason = _employee_for(row)
		if not employee:
			return _wait(row, reason)

		checkin = frappe.db.get_value(
			"Employee Checkin", {"employee": employee, "time": row.punched_at}, "name"
		)
		if not checkin:
			# A direction only from a machine somebody has checked reports one
			# (Attendance Device.report_direction). Otherwise none: the shift's
			# pairing alternates IN/OUT from nothing and cannot recover from a
			# confident wrong one (CLAUDE.md §5).
			report = frappe.db.get_value("Attendance Device", {"serial_number": row.serial_number}, "report_direction")
			# Day or night is decided as the checkin is saved
			# (checkin._day_or_night), for the bridge's punches as well.
			log_type = rota.log_type_for(row.status_code, report)
			doc = frappe.get_doc(
				{
					"doctype": "Employee Checkin",
					"employee": employee,
					"time": row.punched_at,
					"device_id": row.device_id,
					**({"log_type": log_type} if log_type else {}),
				}
			).insert(ignore_permissions=True)
			checkin = doc.name
		row.db_set(
			{"state": "Delivered", "employee": employee, "employee_checkin": checkin, "reason": None},
			update_modified=False,
		)
	except DuplicatePunchError:
		# The same punch, already on the site by another road (the bridge, a
		# correction at that second): it is delivered.
		frappe.db.rollback(save_point="adms_deliver")
		twin = frappe.db.get_value("Employee Checkin", {"employee": employee, "time": row.punched_at}, "name")
		row.db_set(
			{"state": "Delivered", "employee": employee, "employee_checkin": twin, "reason": None},
			update_modified=False,
		)
	except Exception as exc:
		frappe.db.rollback(save_point="adms_deliver")
		# Stored either way: the punch waits with what went wrong on it.
		_wait(row, "Not delivered: {0}".format(exc)[:500])


def _wait(row, reason):
	row.db_set({"state": "Waiting", "reason": reason}, update_modified=False)


def _employee_for(row):
	"""`(employee, reason)` — whom to pay this punch to, or why it waits."""
	device = _device(row.serial_number)
	if not device:
		return None, "Serial {0} is not on an active Attendance Device".format(row.serial_number)

	if row.device_id != device.device_id:
		# Parked under `SN:` and registered since; it now names its machine.
		row.db_set({"device_id": device.device_id, "attendance_device": device.name},
		           update_modified=False)

	rows = frappe.get_all(
		"Employee",
		filters={"attendance_device_id": row.device_user_id},
		fields=["name", "status", "company"],
	)
	employee, reason = adms.choose_employee(rows, device.company)
	if employee:
		return employee, None
	if reason:
		gone = adms.gone_carrier(rows)
		if gone:
			_tell_hr_gone(row, device, gone["name"])
		return None, reason
	_ask_hr(row, device)
	return None, adms.NEW_ON_MACHINE


#: Who is told that somebody new punched. Both may make an Employee.
HR_ROLES = ("HR Manager", "HR User")


def hr_users():
	"""Every login holding an HR role, which is who these notifications are for."""
	users = frappe.get_all(
		"Has Role", filters={"role": ["in", HR_ROLES], "parenttype": "User"}, pluck="parent"
	)
	return sorted(set(users) - {"Administrator", "Guest"})


def _tell_hr_gone(row, device, employee):
	"""Tell HR, once a day per person, that somebody marked gone is punching.

	Before 27 November 2026 only a pin with no Employee at all asked HR anything.
	A pin whose Employee was Inactive waited in silence: SURENDRA ORAON's 47
	November punches did. Every hourly retry passes through here, so a person
	nobody has looked at is named again each day until HR acts.
	"""
	if frappe.db.exists("Notification Log", {
		"document_type": "Employee", "document_name": employee,
		"subject": ["like", "%{0}%".format(adms.GONE_PUNCHING)],
		"creation": [">=", getdate(today())],
	}):
		return
	emp = frappe.db.get_value("Employee", employee, ["employee_name", "employee_number"], as_dict=True) or {}
	subject = adms.gone_subject(
		emp.get("employee_name"), emp.get("employee_number") or employee,
		frappe.db.get_value("Attendance Device", device.name, "device_name") or device.device_id,
		row.device_user_id, row.punched_at,
	)
	for user in hr_users():
		frappe.get_doc({
			"doctype": "Notification Log",
			"for_user": user,
			"type": "Alert",
			"subject": subject,
			"document_type": "Employee",
			"document_name": employee,
		}).insert(ignore_permissions=True)


def _ask_hr(row, device):
	"""Tell HR, once per pin per machine, that somebody new is punching.

	The notification names the pin's `Attendance Device User`, so "once" is a
	question the Notification Log already answers, and the dashboard opens
	Onboarding from it. The punches wait; making the Employee delivers them.
	"""
	user_name = "{0}-{1}".format(device.device_id, row.device_user_id)
	if not frappe.db.exists("Attendance Device User", user_name):
		# A machine that has not sent its user list yet still gets its pin a
		# record, so the notification has something to name.
		frappe.get_doc({
			"doctype": "Attendance Device User",
			"device_id": device.device_id,
			"attendance_device": device.name,
			"device_user_id": row.device_user_id,
			"first_seen": now_datetime(),
			"on_device": 1,
		}).insert(ignore_permissions=True)
	if frappe.db.exists("Notification Log", {
		"document_type": "Attendance Device User", "document_name": user_name,
	}):
		return

	name = frappe.db.get_value("Attendance Device User", user_name, "name_on_device")
	subject = "New on {0}: {1} (machine no. {2}) punched. Create the employee.".format(
		frappe.db.get_value("Attendance Device", device.name, "device_name") or device.device_id,
		name or "no name on the machine",
		row.device_user_id,
	)
	for user in hr_users():
		frappe.get_doc({
			"doctype": "Notification Log",
			"for_user": user,
			"type": "Alert",
			"subject": subject,
			"document_type": "Attendance Device User",
			"document_name": user_name,
		}).insert(ignore_permissions=True)


def on_employee_update(doc, method=None):
	"""`Employee.on_update`: an Employee carrying a pin takes its waiting punches.

	So Create Employee is the whole of HR's job — the person's punches are
	theirs by the time the form says Created, not at the next hourly retry.
	"""
	pin = (doc.get("attendance_device_id") or "").strip()
	if not pin or doc.get("status") != "Active":
		return
	for name in frappe.get_all(
		"Attendance Device Punch",
		filters={"state": "Waiting", "device_user_id": pin},
		order_by="punched_at asc",
		pluck="name",
	):
		_deliver(frappe.get_doc("Attendance Device Punch", name))


@frappe.whitelist()
def resend_from_start(serial):
	"""Ask a machine to send every punch it still holds, on its next hello.

	For a machine whose punches stopped arriving — Manna Treads, 14 to 30
	October 2026, whose firmware asked for paths this server did not answer —
	and which now connects with its stamp already past them. Safe to repeat:
	a punch already stored collides on its name and is skipped, and one older
	than `adms.STORE_DAYS` is acknowledged and not kept. Nothing is cleared on
	the machine; this only moves the server's bookmark back.
	"""
	frappe.only_for(HR_ROLES + ("System Manager",))
	serial = (serial or "").strip()
	if not _device(serial):
		frappe.throw("{0} is not on an active Attendance Device.".format(serial))
	before = frappe.db.get_global(_stamp_key(serial))
	frappe.db.set_global(_stamp_key(serial), "0")
	frappe.db.commit()
	return {"serial": serial, "before": before, "after": "0"}


@frappe.whitelist()
def new_on_machine():
	"""Everybody punching on a machine whom no Employee carries yet.

	One row per machine and pin, for Onboarding's "New on the machine" list and
	the Create Employee it opens.
	"""
	frappe.only_for(HR_ROLES + ("System Manager",))
	punches = frappe.get_all(
		"Attendance Device Punch",
		filters={"state": "Waiting", "reason": adms.NEW_ON_MACHINE},
		fields=["attendance_device", "device_user_id", "punched_at"],
		limit_page_length=0,
	)
	rows = adms.new_people(punches)
	for r in rows:
		device = frappe.db.get_value(
			"Attendance Device", r["attendance_device"],
			["device_id", "device_name", "company"], as_dict=True,
		) or {}
		r["device_name"] = device.get("device_name") or device.get("device_id") or r["attendance_device"]
		r["company"] = device.get("company")
		r["name_on_device"] = frappe.db.get_value(
			"Attendance Device User",
			{"device_id": device.get("device_id"), "device_user_id": r["pin"]},
			"name_on_device",
		) or ""
		r["first_name"], r["last_name"] = adms.split_name(r["name_on_device"])
	return rows


# ------------------------------------------------------------ closing shifts ---


def advance_shifts():
	"""Every ten minutes: move each auto-attendance shift's `last_sync_of_checkin`.

	What the bridge did after each pass, now that machines push here instead.
	Without it hrms's hourly job generates no Attendance at all, and says
	nothing. The rule — how far, and which machine holds it — is
	`adms.sync_point`.
	"""
	since = add_to_date(now_datetime(), days=-adms.SERVES_DAYS)
	seen = {
		d.device_id: d.last_seen
		for d in frappe.get_all(
			"Attendance Device", filters={"is_active": 1}, fields=["device_id", "last_seen"]
		)
	}
	for shift in frappe.get_all(
		"Shift Type",
		filters={"enable_auto_attendance": 1},
		fields=["name", "last_sync_of_checkin"],
	):
		rows = frappe.db.sql(
			"""select device_id, max(time) from `tabEmployee Checkin`
			where shift = %s and time >= %s group by device_id""",
			(shift.name, since),
		)
		if not rows:
			continue
		newest = max(str(t) for _d, t in rows)
		# Only registered machines hold a shift: a phone punch is posted as it
		# happens, and a device nobody registered cannot be asked when it last
		# called.
		serving = [seen[d] for d, _t in rows if d in seen]
		up_to = adms.sync_point(shift.last_sync_of_checkin, newest, serving)
		if up_to:
			frappe.db.set_value("Shift Type", shift.name, "last_sync_of_checkin", up_to,
			                    update_modified=False)
	frappe.db.commit()


def guard_last_sync(doc, method=None):
	"""Shift Type · validate. A save may not move `last_sync_of_checkin` past the
	shift's own newest punch — the rule and the reason are `adms.sync_limit`.

	`advance_shifts` writes with `db.set_value` and is not judged here; it holds
	itself at the quietest machine, which is stricter still.
	"""
	if doc.is_new() or not doc.get("last_sync_of_checkin"):
		return
	before = doc.get_doc_before_save()
	current = before.get("last_sync_of_checkin") if before else None
	if str(current or "")[:19] == str(doc.last_sync_of_checkin)[:19]:
		return
	newest = frappe.db.sql(
		"select max(time) from `tabEmployee Checkin` where shift = %s and time <= %s",
		(doc.name, now_datetime()),
	)[0][0]
	allowed = adms.sync_limit(current, doc.last_sync_of_checkin, newest)
	if str(allowed or "")[:19] == str(doc.last_sync_of_checkin)[:19]:
		return
	asked = str(doc.last_sync_of_checkin)[:19]
	doc.last_sync_of_checkin = allowed
	frappe.msgprint(
		"Last Sync of Checkin on {0} kept at {1}, not {2}: no punch on this shift is that late yet, "
		"and moving it further would close days whose punches may still be on a machine.".format(
			doc.name, str(allowed or "")[:19] or "(not set)", asked),
		alert=True,
	)


def keep_auto_attendance(doc, method=None):
	"""Shift Type · before_validate. Auto attendance is never off — `adms.keep_auto_attendance`.

	before_validate, so hrms's own validation already sees the box ticked and
	the date it then requires.
	"""
	fix = adms.keep_auto_attendance(
		doc.get("enable_auto_attendance"), doc.get("process_attendance_after"), getdate(today()),
	)
	if not fix:
		return
	doc.update(fix)
	if "enable_auto_attendance" in fix and not doc.is_new():
		frappe.msgprint(
			"Auto attendance stays on for {0}: without it this shift's punches never become attendance.".format(doc.name),
			alert=True,
		)


def warn_cannot_punch():
	"""Daily. HR is told who has no way to punch at all — `appaccess.cannot_punch`."""
	from manna_hr import applogin_site

	fields = ["name", "employee_name", "employee_number", "status", "attendance_device_id", "user_id"]
	if applogin_site.has_field():
		fields.append(applogin_site.FIELD)
	rows = frappe.get_all("Employee", filters={"status": "Active"}, fields=fields, limit_page_length=0)
	who = sorted(appaccess.cannot_punch(rows), key=lambda p: str(p.get("employee_number") or p["name"]))
	if not who:
		return
	subject = appaccess.cannot_punch_subject(who)
	for user in hr_users():
		frappe.get_doc({
			"doctype": "Notification Log",
			"for_user": user,
			"type": "Alert",
			"subject": subject,
			"document_type": "Employee",
			"document_name": who[0]["name"],
		}).insert(ignore_permissions=True)
	frappe.db.commit()
