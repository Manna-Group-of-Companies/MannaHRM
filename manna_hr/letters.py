"""Merging a letter template against a person.

## Why this exists on the server as well as in the browser

`client/src/lib/letter.js` does the same job, and it has to: the letter form
shows you the merged text before you issue it, and a preview that needed a round
trip would be a preview nobody waits for.

What the browser must not be is the *only* place it happens. Bulk letter
generation creates an `Employee Letter` per row of a spreadsheet and — before
this — stored no text at all. The letter was re-rendered from the template every
time somebody opened it, which means a letter issued in March said something
different in June if the person's designation had changed in between. An issued
letter is a statement somebody was given on a date. It is not a view of their
current record.

So the body is merged and **stored** when the letter is created, by
`employee_letter.py`, using this module. The browser's copy stays for the
preview.

## Keeping the two in step

The token grammar here is a port of `lib/letter.js` and the two have to agree,
or a letter previewed with a value is issued with `[[Token]]` in its place.
Three things carry the agreement, and all three are tested in
`tests/test_letters.py`:

  the pattern    `{Token}` — 2 to 40 characters of letters, digits and
                 ` _ . - /`
  the key        lowercased with spaces, dots, dashes, underscores and slashes
                 removed, because the same field appears in Factor HR's
                 templates as `EmployeeName`, `employeename` and `EMPLOYEE_NAME`
  the miss       a token with nothing behind it is rendered `[[Token]]`, never
                 blanked — a letter with a visible gap is obviously unfinished
                 and one with a blank space looks finished
"""

import re

#: `{Token}`. Deliberately the same shape as the client's, including the 2..40
#: bound — a shorter one matches `{}` in stray CSS and a longer one starts
#: swallowing paragraphs when somebody leaves a brace open.
TOKEN = re.compile(r"\{([A-Za-z0-9 _.\-/]{2,40})\}")

_STRIP = re.compile(r"[\s._\-/]")


def normalise(token):
	"""`Employee Name`, `employee_name` and `EMPLOYEENAME` are one key."""
	return _STRIP.sub("", str(token).lower())


#: Token → the field on `Employee` it reads. Ported from `TOKENS` in
#: client/src/data/onboard.js, which was itself read off 118 distinct tokens
#: across seventeen of Factor HR's templates.
TOKEN_FIELDS = {
	"employeename": "employee_name",
	"employeefullname": "employee_name",
	"empcode": "employee_number",
	"employeecode": "employee_number",
	"designation": "designation",
	"branch": "branch",
	"doj": "date_of_joining",
	"dateofjoining": "date_of_joining",
	"pastdateofjoining": "date_of_joining",
	"dol": "relieving_date",
	"dateofleaving": "relieving_date",
	"dateofbirth": "date_of_birth",
	"gender": "gender",
	"nationality": "custom_nationality",
	"maritalstatus": "marital_status",
	"fathername": "custom_father_name",
	"employeesfathername": "custom_father_name",
	"employeefathername": "custom_father_name",
	"employeespousename": "custom_spouse_name",
	"employeesreligion": "custom_religion",
	"employeepermanentaddress": "permanent_address",
	"mobileno": "cell_number",
	"mobile": "cell_number",
	"employeemobileno": "cell_number",
	"employeepanno": "custom_pan_no",
	"employeeidentitypanno": "custom_pan_no",
	"employeebankname": "bank_name",
	"employeebankaccountno": "bank_ac_no",
	"passportno": "passport_number",
	"companyname": "company",
	"company": "company",
	"grosssalary": "ctc",
}

#: Tokens that are not a field. Each takes the employee record and returns a
#: value or "".
TOKEN_DERIVED = {
	# Their department names carry the company abbreviation — "Production - MR"
	# — which is Frappe's naming and not something to print on a letter.
	"department": lambda e: _tidy_department(e.get("department")),
	"employeeaddress": lambda e: e.get("current_address") or e.get("permanent_address") or "",
	"email": lambda e: e.get("company_email") or e.get("personal_email") or "",
	"employeeemail": lambda e: e.get("company_email") or e.get("personal_email") or "",
	"currencysymbol": lambda e: "₹",
	"currencytitle": lambda e: "Rupees",
	"employeetitle": lambda e: _title(e),
	"title": lambda e: _title(e),
	"hisher": lambda e: "Her" if e.get("gender") == "Female" else "His",
}


def _tidy_department(value):
	"""`Production - MR` → `Production`. The suffix is Frappe's, not theirs."""
	return str(value or "").rsplit(" - ", 1)[0]


def _title(employee):
	# Two options because the record has two, not because anybody thinks that
	# is the whole of it. A person whose gender is unset gets no title rather
	# than a guessed one — `[[Title]]` on a draft is a question somebody
	# answers, and "Mr." on a letter is a mistake nobody catches.
	gender = employee.get("gender")
	if gender == "Female":
		return "Ms."
	if gender == "Male":
		return "Mr."
	return ""


def tokens_in(template):
	"""Every distinct token in a template, in the order they first appear.

	What `Letter Type.fields_used` is written from — a fact about the text
	rather than a second place to state one.
	"""
	seen = []
	for match in TOKEN.finditer(template or ""):
		raw = match.group(1).strip()
		if raw not in seen:
			seen.append(raw)
	return seen


def value_for(token, employee, extra=None):
	"""What one token resolves to, or "" if nothing does.

	`extra` is the caller's own values — the letter's number, its reference,
	today's date — and wins over the employee record, because a letter carries
	facts the person's record has no field for.
	"""
	key = normalise(token)
	if extra:
		got = extra.get(key)
		if got not in (None, ""):
			return str(got)

	employee = employee or {}
	if key in TOKEN_DERIVED:
		return str(TOKEN_DERIVED[key](employee) or "")
	field = TOKEN_FIELDS.get(key)
	if field:
		return str(employee.get(field) or "")
	return ""


def merge(template, employee, extra=None):
	"""Render one template against one person.

	Returns `(html, missing)`. Every value is HTML-escaped on the way in; the
	template around it is the site's own stored markup and is not.

	A token nothing answers is rendered `[[Token]]` and named in `missing`, so
	the caller can refuse to issue a letter full of holes — which is a decision
	for the screen, not for this function.
	"""
	missing = []

	def one(match):
		raw = match.group(1).strip()
		text = value_for(raw, employee, extra)
		if not text:
			if raw not in missing:
				missing.append(raw)
			return '<span class="tok">[[' + _escape(raw) + "]]</span>"
		# A token screamed in capitals is a heading; the value follows it.
		if raw == raw.upper() and re.search(r"[A-Z]{3,}", raw):
			text = text.upper()
		return _escape(text)

	return TOKEN.sub(one, template or ""), missing


def _escape(value):
	"""The four characters that would otherwise end a tag or an attribute.

	`html.escape` with `quote=True` also rewrites `'` to `&#x27;`, which is
	correct and is not what the client does — and a letter that differs between
	preview and issue by an apostrophe is a letter somebody will report. Matched
	to `esc` in lib/letter.js deliberately.
	"""
	return (
		str("" if value is None else value)
		.replace("&", "&amp;")
		.replace("<", "&lt;")
		.replace(">", "&gt;")
		.replace('"', "&quot;")
	)


#: Kept so the import is obviously deliberate rather than left over.
__all__ = [
	"TOKEN", "TOKEN_DERIVED", "TOKEN_FIELDS",
	"merge", "normalise", "tokens_in", "value_for",
]
