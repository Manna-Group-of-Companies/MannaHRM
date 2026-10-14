"""An Employee for somebody who punches at a machine and is on no record.

Asked for 3 October 2026: punches from a device user no `Employee` carries as
`attendance_device_id` used to wait in this bridge's queue until somebody linked
them by hand, and nobody on the site could see them meanwhile. Now, on a machine
that names a company in `config.toml`, the bridge makes the record and sends the
punch on the same pass.

**What it writes is partly made up, and says so.** The site will not create an
Employee without a gender and a date of birth, and a fingerprint machine knows
neither. HR chose placeholders over waiting: gender `Prefer not to say` (or
`Other`), born 1 January 2000, and `custom_needs_details` ticked so the record
can be found and corrected. Until it is, anything that reads the date of birth —
age, PF and ESI eligibility, retirement — reads a placeholder.

**Here, not on the site,** because `manna_hr` is not installed there and Server
Scripts are off on this plan (CLAUDE.md §7). It moves to `manna_hr/` with the
install. The pure halves below move unchanged.

What it will not do:

- **Create for somebody who has a record.** An Employee with this number who is
  not Active is a person HR marked gone; their punches keep waiting, as before.
- **Create on a machine with no company.** Guessing one puts a person on the
  wrong payroll. Their punches keep waiting, as before.
- **Cost the pass.** A refusal is logged once per pass and the punch waits; the
  rest of the queue still goes.
"""

import json
import logging

import requests

log = logging.getLogger(__name__)

#: The date of birth an auto-created Employee is given. Never a real one, and
#: what the dashboard looks for to say "needs details" if the flag was lost.
PLACEHOLDER_BIRTH = "2000-01-01"

#: First choice first. Both ship with ERPNext; the site is asked which it has.
PLACEHOLDER_GENDERS = ("Prefer not to say", "Other")

#: The Check field on Employee that marks a record for HR to complete —
#: `CUSTOM_FIELDS` in manna_hr/install.py. A site without it drops the value
#: on insert, and the placeholder birth date is then the only mark left.
NEEDS_DETAILS = "custom_needs_details"

#: What first_name is when the machine has no name for somebody either.
NO_NAME = "Device user"


# ---------------------------------------------------------------- pure ---


def split_name(name_on_device, device_user):
	"""`(first_name, last_name)` from what is typed into the machine.

	A machine name is one box, often in capitals and often a single word, so
	the first word is the first name and the rest the last — which is what the
	site joins back into `employee_name`. Nothing typed is `Device user 563`,
	so the record still says whose punches it holds.
	"""
	words = str(name_on_device or "").split()
	if not words:
		return NO_NAME, str(device_user)
	return words[0], " ".join(words[1:])


def pick_gender(available):
	"""The placeholder gender this site has, or None when it has neither."""
	have = set(available or ())
	for g in PLACEHOLDER_GENDERS:
		if g in have:
			return g
	return None


def employee_doc(device_user, name_on_device, company, first_punch, gender):
	"""The Employee to create for one device user.

	Joined on the day of their first punch this bridge holds — the earliest
	date anybody can say they were at work — and Active, because hrms refuses a
	checkin for anybody who is not.
	"""
	first, last = split_name(name_on_device, device_user)
	doc = {
		"first_name": first,
		"gender": gender,
		"date_of_birth": PLACEHOLDER_BIRTH,
		"date_of_joining": str(first_punch)[:10],
		"company": company,
		"status": "Active",
		"attendance_device_id": str(device_user),
		NEEDS_DETAILS: 1,
	}
	if last:
		doc["last_name"] = last
	return doc


# ---------------------------------------------------------------- site ---


class SiteError(Exception):
	"""The site refused or could not be asked. The punch waits."""


class EmployeeSite:
	"""The three questions this module asks ERPNext, over its REST API."""

	def __init__(self, base_url, api_key, api_secret, timeout=30):
		self._base = base_url.rstrip("/")
		self._timeout = timeout
		self._session = requests.Session()
		self._session.headers.update({
			"Authorization": "token {0}:{1}".format(api_key, api_secret),
			"Accept": "application/json",
		})

	def _get(self, doctype, fields, filters):
		try:
			r = self._session.get(
				"{0}/api/resource/{1}".format(self._base, doctype),
				params={"fields": _json(fields), "filters": _json(filters), "limit_page_length": 0},
				timeout=self._timeout,
			)
		except requests.RequestException as exc:
			raise SiteError(exc) from exc
		if r.status_code != 200:
			raise SiteError("HTTP {0} reading {1}: {2}".format(r.status_code, doctype, r.text[:300]))
		return r.json().get("data", [])

	def employees_with_number(self, device_user):
		"""Every Employee carrying this number, whatever their status."""
		return self._get("Employee", ["name", "employee_name", "status"],
		                 [["attendance_device_id", "=", str(device_user)]])

	def genders(self):
		return [g["name"] for g in self._get("Gender", ["name"], [])]

	def create_employee(self, doc):
		try:
			r = self._session.post("{0}/api/resource/Employee".format(self._base), json=doc, timeout=self._timeout)
		except requests.RequestException as exc:
			raise SiteError(exc) from exc
		if r.status_code not in (200, 201):
			raise SiteError(_reason(r))
		return r.json().get("data", {})


def _json(value):
	return json.dumps(value)


def _reason(response):
	"""The site's own sentence, which names the field or the permission."""
	try:
		body = response.json()
		msgs = json.loads(body.get("_server_messages") or "[]")
		said = " ".join(json.loads(m).get("message", "") for m in msgs)
		return said or body.get("exception") or response.text[:300]
	except Exception:
		return "HTTP {0}: {1}".format(response.status_code, response.text[:300])


# ---------------------------------------------------------------- the job ---


class AutoEnrol:
	"""Makes the Employee a waiting punch needs, when it safely can.

	`companies` is `{device_id: company}` off `config.toml`; `name_of(device_id,
	device_user)` is the name typed into the machine, off the enrolment store.
	"""

	def __init__(self, site, companies, name_of=None):
		self._site = site
		self._companies = {k: v for k, v in (companies or {}).items() if v}
		self._name_of = name_of or (lambda device_id, device_user: "")
		self._gender = None
		self._given_up = set()

	def start_pass(self):
		"""Forget this pass's refusals: a record fixed meanwhile is tried again."""
		self._given_up.clear()

	def ensure(self, device_user, device_id, punched_at):
		"""True when an Active Employee now carries this number — made here or
		already there — so the punch is worth sending again."""
		user = str(device_user)
		company = self._companies.get(device_id)
		if not company or user in self._given_up:
			return False

		try:
			held = self._site.employees_with_number(user)
			if held:
				# Somebody linked them since the punch was refused, or they are a
				# record HR marked gone. The first sends; the second waits.
				return any(e.get("status") == "Active" for e in held)

			if self._gender is None:
				self._gender = pick_gender(self._site.genders())
			if not self._gender:
				raise SiteError("the site has neither of the placeholder genders {0}".format(
					" / ".join(PLACEHOLDER_GENDERS)))

			name_on_device = ""
			try:
				name_on_device = self._name_of(device_id, user) or ""
			except Exception:
				# A missing name costs a nicer record, not the record.
				log.debug("no machine name for device user %s on %s", user, device_id)

			doc = employee_doc(user, name_on_device, company, punched_at, self._gender)
			made = self._site.create_employee(doc)
		except SiteError as exc:
			self._given_up.add(user)
			log.error("could not create an Employee for device user %s on %s: %s — their punches keep waiting",
			          user, device_id, exc)
			return False

		log.warning(
			"created Employee %s (%s) for device user %s on %s, company %s — gender and date of birth "
			"are placeholders; the record is marked Needs details",
			made.get("name", "?"), made.get("employee_name") or doc["first_name"], user, device_id, company,
		)
		return True
