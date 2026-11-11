"""The two notifications' wording (manna_hr/notifications.py)."""

import re

from manna_hr.notifications import NOTIFICATIONS, STALE_AFTER_DAYS


def test_every_subject_and_message_keeps_its_placeholders_as_jinja():
	# A subject built with str.format turned `{{ doc.x }}` into `{ doc.x }` and
	# went out to a real inbox as that, the placeholder in place of the person.
	for n in NOTIFICATIONS:
		for field in ("subject", "message"):
			text = n[field]
			assert not re.search(r"(?<!\{)\{\s*doc\.", text), (n["name"], field, text)
			assert "{{ doc." in text or field == "message", (n["name"], field, text)


def test_the_waiting_subject_names_the_person_and_the_days():
	subject = NOTIFICATIONS[0]["subject"]
	assert subject == "Attendance correction waiting %d days: {{ doc.employee_name }}" % STALE_AFTER_DAYS


def test_the_correction_waiting_email_is_off_and_the_other_stays_on():
	# HR asked for the waiting-too-long mail to stop (11 November 2026).
	on = {n["name"]: n.get("enabled", 1) for n in NOTIFICATIONS}
	assert on["Manna: correction waiting too long"] == 0
	assert on["Manna: correction approved but the day was never rebuilt"] == 1
