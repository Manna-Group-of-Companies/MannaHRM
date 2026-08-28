"""Access to `Manna HR Settings`, with defaults that survive a missing row.

Every tunable number lives in the Single doctype so HR can change it without a
deploy. This module exists so that nothing else has to think about what happens
before the row is first saved, or when a field is left blank.
"""

import frappe

# The shipped defaults. These are also the doctype's own field defaults; they
# are repeated here because a Single that has never been saved returns a
# document with every field `None`, and a `None` radius would refuse every
# punch in the group.
DEFAULTS = {
	"enforce_geofence": 1,
	"default_radius_metres": 300,
	"punch_in_from": "05:00:00",
	"punch_out_until": "21:30:00",
	"enforce_punch_window": 1,
	"require_location_for_mobile": 1,
	"trusted_device_prefix": "BIO-",
}


def hr_settings():
	"""The settings document, with blanks filled from `DEFAULTS`.

	Cached per request. Attendance validation reads this on every punch, and a
	shift job importing a day of machine punches would otherwise fetch the same
	Single a few thousand times.
	"""
	cached = frappe.local.__dict__.setdefault("_manna_hr_settings", None)
	if cached is not None:
		return cached

	doc = frappe.get_cached_doc("Manna HR Settings")
	for field, fallback in DEFAULTS.items():
		if doc.get(field) in (None, ""):
			doc.set(field, fallback)

	frappe.local._manna_hr_settings = doc
	return doc
