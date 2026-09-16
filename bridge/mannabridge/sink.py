"""Delivering a punch to ERPNext.

Posts to Frappe HR's own endpoint rather than creating `Employee Checkin`
directly, because that endpoint resolves the device's user number to an
`Employee` via `attendance_device_id` and applies hrms' own duplicate window.
Writing the doctype directly would mean reimplementing both, in a program that
runs unattended on a shelf.
"""

import json
import logging

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

log = logging.getLogger(__name__)

ENDPOINT = "/api/method/hrms.hr.doctype.employee_checkin.employee_checkin.add_log_based_on_employee_field"

# hrms answers with this when the device's user number matches nobody. It is by
# far the commonest failure in a rollout, and it is a master-data problem, not a
# network one — so it must not be retried forever in silence.
NO_EMPLOYEE = "no employee found"

# hrms refuses a second log for the same employee at the same second. For a
# bridge that is not an error, it is proof the punch is already delivered: two
# bridges overlapping, a machine re-read after its cursor was lost, a laptop
# that filled in while the always-on box was switched off. Raising here stopped
# the pass at the first one, every pass, so the bridge that was behind never
# caught up and said nothing but "delivery failed" about punches that were
# safely on the site.
ALREADY_THERE = "already has a log with the same timestamp"


class DeliveryError(Exception):
	"""Transient. Worth retrying."""


class UnmappedEmployee(Exception):
	"""Permanent until somebody sets `attendance_device_id`. Not retried."""


class ErpSink:
	def __init__(self, base_url, api_key, api_secret, timeout=30):
		self._url = base_url.rstrip("/") + ENDPOINT
		self._timeout = timeout
		self._session = requests.Session()
		# Retry a connection the site dropped, POST included. Reading 80,000
		# records off the machine takes over a minute, the site closes the idle
		# keep-alive meanwhile, and the first send after every read died with
		# "Remote end closed connection without response" - which stops the
		# pass, so on 14 Sep 2026 nothing new was delivered pass after pass.
		# Retrying a POST is safe only because a punch the site already holds
		# comes back as ALREADY_THERE and counts as delivered.
		retry = Retry(total=3, connect=3, read=3, status=0, backoff_factor=1,
		              allowed_methods=frozenset(["GET", "PUT", "POST"]), raise_on_status=False)
		self._session.mount("https://", HTTPAdapter(max_retries=retry))
		self._session.mount("http://", HTTPAdapter(max_retries=retry))
		self._session.headers.update(
			{
				"Authorization": "token {0}:{1}".format(api_key, api_secret),
				"Accept": "application/json",
			}
		)

	def send(self, device_user, punched_at, device_id, log_type=None):
		"""Deliver one punch. Raises on failure; the caller decides what next."""
		payload = {
			"employee_field_value": device_user,
			"timestamp": punched_at,
			"device_id": device_id,
		}
		# Only sent when the device actually reports direction. Most ZK machines
		# in the field are configured not to, and sending an empty log_type is
		# not the same as omitting it — hrms treats the blank as a real value
		# and the shift's pairing mode then has nothing to alternate on.
		if log_type:
			payload["log_type"] = log_type

		try:
			response = self._session.post(self._url, json=payload, timeout=self._timeout)
		except requests.RequestException as exc:
			raise DeliveryError(exc) from exc

		if response.status_code in (200, 201):
			return response.json().get("message", {})

		body = response.text or ""

		if ALREADY_THERE in body.lower():
			log.info("device user %s at %s is already on the site", device_user, punched_at)
			return {}

		if NO_EMPLOYEE in body.lower():
			raise UnmappedEmployee(
				"device user {0} on {1} matches no Employee.attendance_device_id".format(
					device_user, device_id
				)
			)

		if response.status_code in (401, 403):
			# Retrying a dead token forever produces a silent bridge, which is
			# the failure this whole design exists to avoid.
			raise DeliveryError(
				"authentication refused ({0}) — the API key has been rotated or revoked".format(
					response.status_code
				)
			)

		raise DeliveryError("HTTP {0}: {1}".format(response.status_code, body[:300]))

	def mark_synced(self, base_url, up_to):
		"""Tell every auto-attendance shift how far the checkins now reach.

		**Frappe HR does nothing at all without this.** `process_auto_attendance`
		returns immediately unless `last_sync_of_checkin` is set, so punches can
		arrive perfectly and no Attendance is ever generated — with no error
		anywhere to say why. The official biometric sync tool writes this field;
		a bridge that does not is silently useless.

		Set to the newest punch actually delivered, never to `now`. hrms only
		processes shifts whose end is before this timestamp, so pushing it into
		the future would have it close today's shift while people are still on
		the floor and mark them on whatever hours they had at that moment.
		"""
		try:
			r = self._session.get(
				base_url.rstrip("/") + "/api/resource/Shift Type",
				params={"fields": '["name","last_sync_of_checkin"]', "filters": '[["enable_auto_attendance","=",1]]',
				        "limit_page_length": 200},
				timeout=self._timeout)
			shifts = [(s["name"], (s.get("last_sync_of_checkin") or "")[:19]) for s in r.json().get("data", [])]
		except Exception as exc:
			log.warning("could not list shifts to update last_sync_of_checkin: %s", exc)
			return 0

		done = 0
		for name, current in shifts:
			# Forward only. A bridge knows only what *it* delivered, so the
			# second of two bridges - a laptop filling in while the box was off -
			# once dragged this from Saturday afternoon back to Friday night,
			# and hrms stopped closing every shift in between until something
			# moved it forward again. Moving it back never helps: whatever is
			# past it was delivered by somebody.
			if current and current >= str(up_to)[:19]:
				continue
			try:
				self._session.put(
					base_url.rstrip("/") + "/api/resource/Shift Type/" + name,
					json={"last_sync_of_checkin": up_to}, timeout=self._timeout)
				done += 1
			except Exception as exc:
				log.warning("could not set last_sync_of_checkin on %s: %s", name, exc)
		return done

	def checkins_since(self, base_url, since, device_id=None):
		"""How many `Employee Checkin` rows the site holds since `since`.

		The other half of the answer. The queue says what reached this box; this
		says what reached the site — and the gap between them is the whole of
		"the punches are here and nothing is showing in ERPNext".

		Returns None rather than 0 when the count cannot be read. A site that
		refuses the question and a site with nothing on it are different
		findings, and printing the second for the first sends somebody looking
		at the device.
		"""
		filters = [["time", ">=", since]]
		if device_id:
			filters.append(["device_id", "=", device_id])
		try:
			r = self._session.get(
				base_url.rstrip("/") + "/api/method/frappe.client.get_count",
				params={"doctype": "Employee Checkin", "filters": json.dumps(filters)},
				timeout=self._timeout,
			)
			if r.status_code != 200:
				return None
			return r.json().get("message")
		except (requests.RequestException, ValueError):
			return None

	def heartbeat(self, base_url):
		"""Cheap liveness check, so a dead line is logged as a dead line."""
		try:
			r = self._session.get(
				base_url.rstrip("/") + "/api/method/frappe.handler.ping",
				timeout=self._timeout,
			)
			return r.status_code == 200
		except requests.RequestException:
			return False
