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
from frappe.utils import add_to_date, get_datetime, now_datetime
from werkzeug.wrappers import Response

from manna_hr import adms

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
			text = handle(self.path[len(ROOT):].strip("/"), frappe.request)
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
			deliver_pending(serial)
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
		["name", "device_id", "company", "last_seen"],
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
	deleted from it; a placeholder per entry would be an Active payroll row
	for each. An Employee is made when a pin *punches* — see `_deliver`.
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
		employee, reason = _employee_for(row)
		if not employee:
			return _wait(row, reason)

		checkin = frappe.db.get_value(
			"Employee Checkin", {"employee": employee, "time": row.punched_at}, "name"
		)
		if not checkin:
			doc = frappe.get_doc(
				{
					"doctype": "Employee Checkin",
					"employee": employee,
					"time": row.punched_at,
					"device_id": row.device_id,
					# No direction: see adms.py. The shift's pairing mode
					# alternates IN/OUT from nothing and cannot recover from a
					# confident wrong one.
				}
			).insert(ignore_permissions=True)
			checkin = doc.name
		row.db_set(
			{"state": "Delivered", "employee": employee, "employee_checkin": checkin, "reason": None},
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
	if employee or reason:
		return employee, reason
	return _placeholder(row, device), None


def _placeholder(row, device):
	"""An Employee for a pin that punched and is on no record.

	`Attendance Device.company` is required, so the company is never guessed.
	"""
	gender = adms.pick_gender(frappe.get_all("Gender", pluck="name"))
	if not gender:
		frappe.throw("the site has neither placeholder gender: {0}".format(
			" / ".join(adms.PLACEHOLDER_GENDERS)))
	name_on_device = frappe.db.get_value(
		"Attendance Device User",
		{"device_id": device.device_id, "device_user_id": row.device_user_id},
		"name_on_device",
	)
	doc = frappe.get_doc(adms.employee_doc(
		row.device_user_id, name_on_device, device.company, row.punched_at, gender
	)).insert(ignore_permissions=True)
	return doc.name
