"""One punch exactly as a machine pushed it over ADMS.

Written by `manna_hr/adms_site.py` and by nothing else: storing this row is
what lets the site answer the machine `OK`, so it is the last copy of the punch
once the machine has heard that. The `Employee Checkin` is made from it — now,
or when the reason it is Waiting has been fixed.

Its name is set by `adms.punch_key` before insert, so a machine re-sending a
punch collides with the first copy instead of making a second.
"""

from frappe.model.document import Document


class AttendanceDevicePunch(Document):
	pass
