"""Delivering a punch to ERPNext.

Posts to Frappe HR's own endpoint rather than creating `Employee Checkin`
directly, because that endpoint resolves the device's user number to an
`Employee` via `attendance_device_id` and applies hrms' own duplicate window.
Writing the doctype directly would mean reimplementing both, in a program that
runs unattended on a shelf.
"""

import logging

import requests

log = logging.getLogger(__name__)

ENDPOINT = "/api/method/hrms.hr.doctype.employee_checkin.employee_checkin.add_log_based_on_employee_field"

# hrms answers with this when the device's user number matches nobody. It is by
# far the commonest failure in a rollout, and it is a master-data problem, not a
# network one — so it must not be retried forever in silence.
NO_EMPLOYEE = "no employee found"


class DeliveryError(Exception):
	"""Transient. Worth retrying."""


class UnmappedEmployee(Exception):
	"""Permanent until somebody sets `attendance_device_id`. Not retried."""


class ErpSink:
	def __init__(self, base_url, api_key, api_secret, timeout=30):
		self._url = base_url.rstrip("/") + ENDPOINT
		self._timeout = timeout
		self._session = requests.Session()
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
				params={"fields": '["name"]', "filters": '[["enable_auto_attendance","=",1]]',
				        "limit_page_length": 200},
				timeout=self._timeout)
			shifts = [s["name"] for s in r.json().get("data", [])]
		except Exception as exc:
			log.warning("could not list shifts to update last_sync_of_checkin: %s", exc)
			return 0

		done = 0
		for name in shifts:
			try:
				self._session.put(
					base_url.rstrip("/") + "/api/resource/Shift Type/" + name,
					json={"last_sync_of_checkin": up_to}, timeout=self._timeout)
				done += 1
			except Exception as exc:
				log.warning("could not set last_sync_of_checkin on %s: %s", name, exc)
		return done

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
