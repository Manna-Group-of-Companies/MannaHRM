"""Google Form → `Employee Onboarding`, for the Onboarding page's Share and Sync.

## Why this exists

An employee fills in a Google Form instead of somebody at HR typing their
details onto the desk. The Form's answers land in a Google Sheet outside this
app's control, so a row of it is untrusted input in exactly the sense a phone
punch is (CLAUDE.md §1) — `manna_hr.rules.map_onboarding_row` is the pure rule
that decides what an answer may become, and everything here that touches a
site is the thin, testable-only-with-a-bench layer around it.

## What it does not do

It does not create an `Employee`. `Employee Onboarding` is the candidate queue
this site already had before the Form existed — see the custom candidate
fields listed in `manna_hr/install.py` — and Employees → Import From Onboarding
is still the one place a candidate becomes an `Employee`. This module only
fills that same queue from a second entry point.

## Why a sync overwrites so little

A row from the Sheet can *create* a candidate outright, but once one exists it
only ever adds fields, never blanks one a person already corrected on the desk
because a later Form answer happened to arrive empty — the same asymmetry
`DOC_WRITABLE` draws in `onboard.py`, and for the same reason: the external,
less-trusted source is the one whose write is narrowed.

## Why OAuth and not a service-account key

The obvious way to read a Sheet from a server is a service-account key — until
the GCP org this runs under turned out to carry `iam.disableServiceAccountKeyCreation`
and refuse to mint one. So this reads the Sheet as a signed-in Google account
instead, the same OAuth flow a desktop app uses: a refresh token, gotten once
with `tools/google_form_oauth.py` on somebody's own machine (never on the
bench, which has no browser to consent in), stored on Manna HR Settings and
exchanged here for a short-lived access token on every sync. Nothing here
requires the disabled policy, and nothing here requires it to be reversed.
"""

import frappe
from frappe import _
from frappe.utils import now_datetime, today

from manna_hr.rules import ONBOARDING_MATCH_FIELD, ONBOARDING_MATCH_HEADER, map_onboarding_row

SETTINGS = "Manna HR Settings"

#: What a refresh token is exchanged for an access token at. Google's own,
#: fixed — never read from settings, so a stray edit to this box cannot send
#: anybody's credential somewhere else.
TOKEN_URI = "https://oauth2.googleapis.com/token"


def _sheet_rows(sheet_id, client_id, client_secret, refresh_token):
	"""The Sheet's data rows, header-keyed. The one part of this module that
	actually calls Google, kept to a single function so a test could stand in
	front of it without touching a real credential."""
	try:
		from google.oauth2.credentials import Credentials
		from googleapiclient.discovery import build
	except ImportError:
		frappe.throw(_(
			"Reading the Google Sheet needs google-api-python-client and google-auth "
			"installed on this bench: pip install google-api-python-client google-auth"
		))

	creds = Credentials(
		token=None,
		refresh_token=refresh_token,
		token_uri=TOKEN_URI,
		client_id=client_id,
		client_secret=client_secret,
		scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
	)
	service = build("sheets", "v4", credentials=creds)
	result = (
		service.spreadsheets()
		.values()
		# Unformatted, dates as serial numbers: see ONBOARDING_DATE_FIELDS.
		.get(
			spreadsheetId=sheet_id,
			range="A:Z",
			valueRenderOption="UNFORMATTED_VALUE",
			dateTimeRenderOption="SERIAL_NUMBER",
		)
		.execute()
	)
	values = result.get("values", [])
	if not values:
		return []
	header, *rows = values
	return [dict(zip(header, r)) for r in rows]


def _applicant_and_offer(fields):
	"""The `Job Applicant` and `Job Offer` hrms requires behind every
	`Employee Onboarding` — found 24 September 2026, when the first import was
	refused for want of both. A Form candidate never went through recruitment,
	so both are made from the Form's answers, and reused when they exist:
	the applicant by email, as hrms keys it, and the offer by applicant.

	The offer is a draft marked Accepted: filling in the joining form is the
	candidate accepting, while submitting an offer stays an HR decision on the
	desk. `client/src/api/onboarding.js` makes the same three.
	"""
	email = fields.get(ONBOARDING_MATCH_FIELD)
	name = fields.get("employee_name") or email
	applicant = frappe.db.get_value("Job Applicant", {"email_id": email}, "name")
	if not applicant:
		doc = frappe.get_doc({
			"doctype": "Job Applicant",
			"applicant_name": name,
			"email_id": email,
			"phone_number": fields.get("custom_cell_number"),
			"designation": fields.get("designation"),
			"status": "Accepted",
		})
		doc.insert(ignore_permissions=True)
		applicant = doc.name

	offer = frappe.db.get_value("Job Offer", {"job_applicant": applicant, "docstatus": ("<", 2)}, "name")
	if not offer:
		doc = frappe.get_doc({
			"doctype": "Job Offer",
			"job_applicant": applicant,
			"applicant_name": name,
			"designation": fields.get("designation"),
			"company": fields.get("company"),
			"offer_date": today(),
			"status": "Accepted",
		})
		doc.insert(ignore_permissions=True)
		offer = doc.name
	return applicant, offer


@frappe.whitelist()
def onboarding_share_info():
	"""What the Onboarding page's Share Google Form button needs.

	Read-only, and open to anybody who may see the onboarding queue at all —
	sharing the *form* is not sharing anybody's answers, which is why this asks
	for read on the doctype rather than for an HR role by name.
	"""
	frappe.has_permission("Employee Onboarding", "read", throw=True)
	settings = frappe.get_single(SETTINGS)
	return {
		"form_url": settings.get("onboarding_form_url") or "",
		"last_sync": settings.get("onboarding_last_sync") or "",
	}


@frappe.whitelist()
def sync_onboarding_from_sheet():
	"""Pull every row of the linked Sheet into `Employee Onboarding`.

	Create-or-update, matched on `ONBOARDING_MATCH_FIELD`. A row with no email
	is skipped rather than guessed at — nothing else on the Form answers
	uniquely identifies a person across two submissions.
	"""
	frappe.has_permission("Employee Onboarding", "create", throw=True)

	settings = frappe.get_single(SETTINGS)
	sheet_id = settings.get("onboarding_sheet_id")
	client_id = settings.get("onboarding_oauth_client_id")
	client_secret = settings.get_password("onboarding_oauth_client_secret", raise_exception=False)
	refresh_token = settings.get_password("onboarding_oauth_refresh_token", raise_exception=False)
	if not sheet_id or not client_id or not client_secret or not refresh_token:
		frappe.throw(_(
			"Set the Google Sheet id and the OAuth client id, secret and refresh token on Manna HR "
			"Settings first — see tools/google_form_oauth.py for the refresh token."
		))

	rows = _sheet_rows(sheet_id, client_id, client_secret, refresh_token)
	created = updated = skipped = 0
	errors = []

	for raw in rows:
		email = str(raw.get(ONBOARDING_MATCH_HEADER, "") or "").strip()
		if not email:
			skipped += 1
			continue
		try:
			fields = map_onboarding_row(raw)
			existing = frappe.db.get_value("Employee Onboarding", {ONBOARDING_MATCH_FIELD: email}, "name")
			if existing:
				doc = frappe.get_doc("Employee Onboarding", existing)
				if doc.docstatus != 0:
					# Submitted or cancelled — a later Form edit must not reopen a
					# candidate that has already moved on, the same rule
					# `canEdit` in write.js applies to every other doctype.
					skipped += 1
					continue
				doc.update(fields)
				doc.save(ignore_permissions=True)
				updated += 1
			else:
				applicant, offer = _applicant_and_offer(fields)
				doc = frappe.get_doc({
					"doctype": "Employee Onboarding",
					"boarding_status": "Pending",
					"boarding_begins_on": fields.get("date_of_joining") or today(),
					**fields,
					"job_applicant": applicant,
					"job_offer": offer,
				})
				doc.insert(ignore_permissions=True)
				created += 1
		except Exception as e:
			errors.append("{0}: {1}".format(email, e))

	settings.db_set("onboarding_last_sync", now_datetime())
	frappe.db.commit()
	return {"created": created, "updated": updated, "skipped": skipped, "errors": errors}


def sync_if_configured():
	"""The hourly scheduler's own call.

	Most sites have not set up a Sheet at all, and the scheduler runs as
	Administrator for every one of them every hour — this must not throw
	`Sync Now`'s "set it up first" message into every site's error log. Any
	other failure — a bad credential, a Sheet the service account cannot read —
	still surfaces, because that one is worth somebody seeing.
	"""
	settings = frappe.get_single(SETTINGS)
	if not settings.get("onboarding_sheet_id") or not settings.get("onboarding_oauth_refresh_token"):
		return
	sync_onboarding_from_sheet()
