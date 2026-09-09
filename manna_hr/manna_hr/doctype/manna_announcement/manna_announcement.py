import frappe
from frappe.model.document import Document

from manna_hr.rules import announcement_is_live, announcement_problems

"""The notice on everybody's front page.

Factor HR draws two panels from this shape — Announcements and CEO Speak — and
they differ in a word, so this is one doctype with a `kind`.

**The thing worth being careful about here is who reads it.** Everything else in
this app is opened by somebody who went looking for it; a published announcement
appears in front of every employee who signs in, whether or not they wanted it.
So `published` defaults off, a window that has already closed is refused rather
than silently ignored, and the company scope is a permission on the server
rather than a filter on the screen.

The arithmetic — whether a notice is live on a given day, and what is wrong with
one — is in `manna_hr/rules.py`, with no `frappe` import, so it can be argued
about without a bench.
"""


class MannaAnnouncement(Document):
	def validate(self):
		"""Refuse a notice that cannot do what it says it will.

		Errors round towards refusing the *save* rather than towards publishing
		something wrong — the opposite direction from the attendance rules, and
		deliberately. A refused punch costs somebody a day's pay and an argument
		with HR; a refused save costs whoever is typing another minute. The
		expensive mistake here is the notice that goes out.
		"""
		for problem in announcement_problems(self.as_dict()):
			frappe.throw(problem)

		if self.published and not self.posted_on:
			# Not a default on the field: a date filled in when the record was
			# created would say a draft written in March was posted in March,
			# even if it was published in September.
			self.posted_on = frappe.utils.today()

		if self.published and not self.posted_by:
			self.posted_by = frappe.utils.get_fullname(frappe.session.user)

	def is_live(self, on=None):
		"""Whether the front page should be showing this today."""
		return announcement_is_live(self.as_dict(), on or frappe.utils.today())
