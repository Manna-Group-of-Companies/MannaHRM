/* ---------------------------------------------------------------------------
   **Generated. Do not edit.**  `node scripts/schema.mjs`

   The shape of every doctype this app installs, read off
   the app's own doctype JSON — the same files the server installs, so
   the form somebody types into and the table it lands in cannot disagree.

   That disagreement is the reason this file exists rather than a convenience.
   **Frappe accepts a key its doctype has not got and drops it silently**: a form
   offering a field the site does not have takes a value, saves, reports success,
   and shows nothing on reload. To whoever typed it, the record refused their
   work for no stated reason.

   Permissions, workflow and naming stay on the server and are not here. A client
   that knew the permission rules would be a client that decides them, and
   CLAUDE.md §1 says a rule enforced here is a suggestion to anyone holding
   `curl`. What this carries is the shape of the form: which fields exist, what
   kind each is, what it is called, and whether a blank will be refused.

   `tests/schema.test.js` regenerates and compares, so a doctype edited without
   re-running this fails the suite rather than shipping a form that lies.
   --------------------------------------------------------------------------- */

/** Every doctype this app installs, by name. */
export const SCHEMA = {
	"Asset Assignment": {
		name: "Asset Assignment",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "naming_series:",
		title: "employee_name",
		fields: [
			{
				name: "naming_series",
				label: "Series",
				kind: "select",
				choices: [
					"HR-ASN-.#####"
				],
				def: "HR-ASN-.#####"
			},
			{
				name: "employee",
				label: "Employee",
				kind: "link",
				link: "Employee",
				reqd: 1,
				list: 1
			},
			{
				name: "employee_name",
				label: "Employee Name",
				kind: "readonly",
				from: "employee.employee_name",
				list: 1
			},
			{
				name: "company",
				label: "Company",
				kind: "readonly",
				link: "Company",
				from: "employee.company",
				hint: "From the person, not the gate. One machine and one store serve several companies at Manna, and the company follows the employee."
			},
			{
				name: "asset",
				label: "Asset",
				kind: "link",
				link: "Asset",
				reqd: 1,
				list: 1
			},
			{
				name: "asset_type",
				label: "Asset Type",
				kind: "readonly",
				link: "Asset Category",
				hint: "Filled from the asset on save. Held here as well as there so the register still reads correctly after the asset is recategorised — a handover is a record of what happened, not a live view of what the thing is called now."
			},
			{
				name: "assets_code",
				label: "Assets Code",
				kind: "readonly",
				hint: "`item_code`, falling back to the asset's own name. Filled from the asset on save."
			},
			{
				name: "serial_number",
				label: "Serial Number",
				kind: "text",
				hint: "Copied from the asset when it is not typed. Blank on about half of them, and that is a fact about the asset rather than a gap — a chair has no serial number."
			},
			{
				name: "asset_status",
				label: "Asset Status",
				kind: "select",
				choices: [
					"",
					"Assigned",
					"Partly Returned",
					"Returned",
					"Partly Lost",
					"Lost",
					"Scrapped",
					"Damaged Or Not Working"
				],
				hint: "Worked out from the three counts on every save. The two exceptions are Scrapped and Damaged Or Not Working, which no count can produce and which a person may therefore impose; any other word picked here that disagrees with the counts is refused rather than overwritten. See manna_hr.rules.assignment_status.",
				list: 1
			},
			{
				name: "assign_units",
				label: "Assign Units",
				kind: "int",
				reqd: 1,
				def: "1",
				hint: "How many of them went out with this person. Not `asset_quantity` — that is how many were capitalised together, and issuing 3 of a batch of 12 had nowhere to be recorded before this doctype."
			},
			{
				name: "assign_date",
				label: "Assign Date",
				kind: "date",
				reqd: 1,
				list: 1
			},
			{
				name: "valid_till",
				label: "Valid Till",
				kind: "date",
				hint: "The date it was lent until. Nothing enforces it and nothing should — it is the date somebody agreed to, so the register can be chased against it. An ERPNext handover has no such date because a log ends when a second row brings the asset back."
			},
			{
				name: "return_unit",
				label: "Return Unit",
				kind: "int",
				def: "0",
				hint: "How many came back. What makes Partly Returned a state rather than a guess."
			},
			{
				name: "returned_on",
				label: "Returned On",
				kind: "date"
			},
			{
				name: "lost_units",
				label: "Lost Units",
				kind: "int",
				def: "0",
				hint: "How many did not come back. Scrapping is an accounting entry against the whole asset; this is a count against a person, and the two are not the same act."
			},
			{
				name: "lost_on",
				label: "Lost On",
				kind: "date",
				hint: "The day somebody said it was missing. Not `disposal_date` on Asset — that one is set by scrapping, which may happen months later or not at all."
			},
			{
				name: "recovery_amount",
				label: "Recovery Amount",
				kind: "currency",
				hint: "The figure agreed with the person. It is recorded here and taken nowhere: a deduction is a salary component on their next slip, which is a separate and deliberate act. Refused when nothing has been lost."
			},
			{
				name: "remarks",
				label: "Remarks",
				kind: "long",
				hint: "Why this handover happened, or what was unusual about it. Frappe hangs Comments off a document instead, which is a different thing — a comment is signed and dated and cannot be edited into agreement later."
			},
			{
				name: "assets_detail",
				label: "Assets Detail",
				kind: "long",
				hint: "A note about the thing itself — the dent it already had. Belongs with the handover rather than with the asset, and ERPNext's Asset has no field for it under any name."
			}
		]
	},
	"Attendance Device": {
		name: "Attendance Device",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "field:device_name",
		title: "device_name",
		fields: [
			{
				name: "device_name",
				label: "Device Name",
				kind: "text",
				reqd: 1,
				hint: "What people at the plant call it. Naming is by this, so it is what every report and every alert says.",
				list: 1
			},
			{
				name: "device_id",
				label: "Device ID",
				kind: "text",
				reqd: 1,
				hint: "Exactly the string this machine puts in `Employee Checkin.device_id`. It must start with `Manna HR Settings.trusted_device_prefix` (`BIO-`) or every punch off it is judged as a phone punch, geofenced, and refused — no fingerprint machine sends a coordinate. Renaming it here without renaming it on the machine breaks that machine's punches silently.",
				list: 1
			},
			{
				name: "company",
				label: "Company",
				kind: "link",
				link: "Company",
				reqd: 1
			},
			{
				name: "work_location",
				label: "Work Location",
				kind: "link",
				link: "Work Location",
				hint: "The gate this machine stands at. Only for reports and for the silence alert — a machine punch is never geofenced."
			},
			{
				name: "is_active",
				label: "Active",
				kind: "check",
				def: "1",
				hint: "Retire rather than delete. A punch from a device nobody can name is a punch nobody can explain.",
				list: 1
			},
			{
				name: "ip_address",
				label: "IP Address",
				kind: "text",
				hint: "On the plant LAN, e.g. 192.168.1.40. The bridge reaches it; the site never does."
			},
			{
				name: "port",
				label: "Port",
				kind: "int",
				def: "4370",
				hint: "ZK protocol default. Named here rather than in bridge/config.toml so a machine moved to another port is one edit by somebody who is not at a console."
			},
			{
				name: "serial_number",
				label: "Serial Number",
				kind: "text"
			},
			{
				name: "model",
				label: "Model",
				kind: "text",
				def: "Identix K90+ID"
			},
			{
				name: "last_seen",
				label: "Last Seen",
				kind: "readonly",
				hint: "When the bridge last spoke to it. Written by the bridge, never by hand.",
				list: 1
			},
			{
				name: "last_punch_at",
				label: "Last Punch At",
				kind: "readonly",
				hint: "The newest punch delivered from this machine. Silence here is what `manna_hr.tasks.alert_on_silent_devices` reads: a dead bridge and a workforce that stopped coming in look identical until payroll runs."
			},
			{
				name: "silent_after_hours",
				label: "Alert After (hours of silence)",
				kind: "int",
				def: "12",
				hint: "Blank or zero means never alert on this one — right for a machine at a site that works one shift a week, wrong for a factory gate."
			},
			{
				name: "notes",
				label: "Notes",
				kind: "long"
			}
		]
	},
	"Employee Attendance Regularization": {
		name: "Employee Attendance Regularization",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "naming_series:",
		title: "employee_name",
		fields: [
			{
				name: "naming_series",
				label: "Series",
				kind: "select",
				choices: [
					"HR-REG-.YYYY.-"
				],
				def: "HR-REG-.YYYY.-"
			},
			{
				name: "employee",
				label: "Employee",
				kind: "link",
				link: "Employee",
				reqd: 1,
				list: 1
			},
			{
				name: "employee_name",
				label: "Name",
				kind: "readonly",
				from: "employee.employee_name",
				list: 1
			},
			{
				name: "company",
				label: "Company",
				kind: "readonly",
				link: "Company",
				from: "employee.company"
			},
			{
				name: "attendance_date",
				label: "Date",
				kind: "date",
				reqd: 1,
				list: 1
			},
			{
				name: "status",
				label: "Status",
				kind: "select",
				choices: [
					"Draft",
					"Pending Approval",
					"Approved",
					"Rejected",
					"Completed"
				],
				def: "Draft",
				hint: "Driven by the Attendance Regularization Approval workflow — see manna_hr/workflow.py. Approved means the punches were written; Completed means the day was rebuilt from them.",
				list: 1
			},
			{
				name: "approver_type",
				label: "Decided By",
				kind: "readonly",
				choices: [
					"Reporting Manager",
					"HR"
				],
				hint: "A person's correction is their manager's to decide. A manager's own goes to HR, because an approver signing off their own attendance is not an approval."
			},
			{
				name: "requested_in",
				label: "Punch In",
				kind: "datetime"
			},
			{
				name: "requested_out",
				label: "Punch Out",
				kind: "datetime"
			},
			{
				name: "reason",
				label: "Reason",
				kind: "long",
				reqd: 1,
				hint: "What happened. The person deciding this was not there."
			},
			{
				name: "decided_by",
				label: "Decided By",
				kind: "readonly",
				link: "User"
			},
			{
				name: "decided_on",
				label: "Decided On",
				kind: "readonly"
			},
			{
				name: "decision_note",
				label: "Note",
				kind: "long",
				hint: "Shown back to the employee. A rejection with no sentence is the thing people escalate."
			}
		]
	},
	"Employee Category Type": {
		name: "Employee Category Type",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "field:category_type_name",
		title: "category_type_name",
		fields: [
			{
				name: "category_type_name",
				label: "Category Type",
				kind: "text",
				reqd: 1,
				hint: "Factor HR's Description — the label a person reads beside the box.",
				list: 1
			},
			{
				name: "category_code",
				label: "Code",
				kind: "text",
				reqd: 1,
				hint: "Becomes the `Custom Field` fieldname on Employee, prefixed `custom_cat_` and lower-cased with underscores. Frappe reserves the unprefixed namespace for its own fields and a collision is the kind of mistake nobody finds until an upgrade.",
				list: 1
			},
			{
				name: "custom_field",
				label: "Custom Field",
				kind: "readonly",
				hint: "The `Custom Field` this type created on Employee, once it has. Read-only because the field is the thing that exists — this row records which one."
			},
			{
				name: "is_active",
				label: "Active",
				kind: "check",
				def: "1",
				list: 1
			},
			{
				name: "parent_category_type",
				label: "Parent Category Type",
				kind: "link",
				link: "Employee Category Type",
				hint: "Factor HR nests category types. Frappe has no hierarchy for custom fields — a field belongs to a doctype and sits after another field, and that is the whole of its structure. The nesting is held here so it is not lost, and it decides nothing on the site."
			},
			{
				name: "is_mandatory",
				label: "Mandatory On Employee",
				kind: "check",
				def: "0",
				hint: "Writes `Custom Field.reqd`. The site then refuses to save an Employee without it, which is what mandatory has to mean if it means anything."
			},
			{
				name: "show_in_filter",
				label: "Show In Filters",
				kind: "check",
				def: "1"
			},
			{
				name: "prompt_message",
				label: "Prompt Message",
				kind: "long",
				hint: "`Custom Field.description` — the grey line under the box."
			},
			{
				name: "screen_priority",
				label: "Screen Display Priority",
				kind: "int",
				hint: "Factor HR orders the form by a number; Frappe answers with `insert_after`, a field name. The two do not convert, so this is carried as intent for whoever places the field."
			},
			{
				name: "report_priority",
				label: "Report Display Priority",
				kind: "int"
			},
			{
				name: "report_display",
				label: "Report Category Display",
				kind: "long",
				hint: "Which of Factor HR's reports this printed on. Nothing on this side reads it: an ERPNext report prints the columns the report asks for. Kept so whoever builds those reports can read what was wanted."
			},
			{
				name: "values",
				label: "Values",
				kind: "table",
				link: "Employee Category Value",
				hint: "What this category may be set to. On the site these become the `options` lines of the Select field — which is why a value retired here must be deactivated rather than deleted: an Employee already carrying it would otherwise hold a value the field no longer offers."
			}
		]
	},
	"Employee Category Value": {
		name: "Employee Category Value",
		module: "Manna HR",
		istable: 1,
		issingle: 0,
		submittable: 0,
		autoname: "",
		title: "",
		fields: [
			{
				name: "value_name",
				label: "Value",
				kind: "text",
				reqd: 1,
				list: 1
			},
			{
				name: "value_code",
				label: "Code",
				kind: "text",
				list: 1
			},
			{
				name: "is_active",
				label: "Active",
				kind: "check",
				def: "1",
				list: 1
			},
			{
				name: "description",
				label: "Description",
				kind: "long",
				list: 1
			}
		]
	},
	"Employee Document": {
		name: "Employee Document",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "naming_series:",
		title: "employee_name",
		fields: [
			{
				name: "naming_series",
				label: "Series",
				kind: "select",
				choices: [
					"HR-EDOC-.#####"
				],
				def: "HR-EDOC-.#####"
			},
			{
				name: "employee",
				label: "Employee",
				kind: "link",
				link: "Employee",
				reqd: 1,
				list: 1
			},
			{
				name: "employee_name",
				label: "Employee Name",
				kind: "readonly",
				from: "employee.employee_name",
				list: 1
			},
			{
				name: "company",
				label: "Company",
				kind: "readonly",
				link: "Company",
				from: "employee.company",
				hint: "Copied from the person, not chosen here. One machine serves several companies at Manna and the company follows the employee — see docs/DEVICES.md."
			},
			{
				name: "document_type",
				label: "Document Type",
				kind: "link",
				link: "Employee Document Type",
				reqd: 1,
				list: 1
			},
			{
				name: "is_statutory",
				label: "Legally Required To Work",
				kind: "readonly",
				from: "document_type.is_statutory",
				hint: "Copied from the type so the register can be filtered on it without a join. Read-only here: whether a document is legally required is a fact about the type, not about one person's copy of it."
			},
			{
				name: "status",
				label: "Status",
				kind: "readonly",
				choices: [
					"",
					"Valid",
					"Expiring",
					"Expired",
					"No Expiry"
				],
				hint: "Worked out from the expiry date when this is saved, and again every night by manna_hr.onboard.refresh_document_status. Stored rather than computed on read so the expiry watch is a list filter and a report, not arithmetic that only happens when somebody opens a screen.",
				list: 1
			},
			{
				name: "document_number",
				label: "Document Number",
				kind: "text",
				list: 1
			},
			{
				name: "date_of_issue",
				label: "Date Of Issue",
				kind: "date"
			},
			{
				name: "place_of_issue",
				label: "Place Of Issue",
				kind: "text"
			},
			{
				name: "valid_upto",
				label: "Valid Upto",
				kind: "date",
				hint: "Blank on a type that has no expiry. Blank on a type that does have one is not an error either — it is a document nobody has finished filing, and it is reported as such rather than being counted as valid.",
				list: 1
			},
			{
				name: "days_to_expiry",
				label: "Days To Expiry",
				kind: "readonly",
				hint: "Negative means it has already expired. Kept alongside the status so a report can sort by urgency rather than by category."
			},
			{
				name: "attachment",
				label: "Attachment",
				kind: "attach",
				hint: "The scan. Private by default — this is somebody's passport."
			},
			{
				name: "remarks",
				label: "Remarks",
				kind: "long",
				hint: "The box Factor HR has and ERPNext's Employee has nowhere for. A note about this one document, not about the person."
			}
		]
	},
	"Employee Document Type": {
		name: "Employee Document Type",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "field:document_type_name",
		title: "document_type_name",
		fields: [
			{
				name: "document_type_name",
				label: "Document Type",
				kind: "text",
				reqd: 1,
				hint: "The name people pick it by, and the name an Employee Document links to. Renames are refused for the same reason Letter Type refuses them — every document already filed names this string.",
				list: 1
			},
			{
				name: "category",
				label: "Category",
				kind: "text",
				hint: "Factor HR groups theirs loosely — Identity, Statutory, Employment. Free text rather than a Select: the list is theirs and is still being read off their screens.",
				list: 1
			},
			{
				name: "is_active",
				label: "Is Active",
				kind: "check",
				def: "1",
				hint: "A retired type. Kept rather than deleted — documents already filed under it still name it."
			},
			{
				name: "has_number",
				label: "Has A Number",
				kind: "check",
				def: "1",
				hint: "Nearly everything has one. A type without a number is a document identified only by the person and the date — a medical certificate, say."
			},
			{
				name: "has_expiry",
				label: "Has An Expiry",
				kind: "check",
				def: "1",
				hint: "Unticked means the document never expires — a PAN card, a degree certificate. Such a document is never chased, and its status stays No Expiry rather than being reported as valid forever."
			},
			{
				name: "has_place",
				label: "Has A Place Of Issue",
				kind: "check",
				def: "0"
			},
			{
				name: "is_statutory",
				label: "Legally Required To Work",
				kind: "check",
				def: "0",
				hint: "Ticked means a person whose document has expired may not lawfully be at work — a visa, a residence card, a labour card. This is the difference the register exists to draw: an expired passport is an inconvenience, an expired visa is somebody who cannot be on site tomorrow."
			},
			{
				name: "warn_days",
				label: "Warn Days Before Expiry",
				kind: "int",
				def: "30",
				hint: "How many days before expiry this type starts being reported as Expiring. A visa wants months, not weeks — renewing one takes longer than noticing it."
			},
			{
				name: "description",
				label: "Description",
				kind: "long"
			}
		]
	},
	"Employee Letter": {
		name: "Employee Letter",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "naming_series:",
		title: "employee_name",
		fields: [
			{
				name: "naming_series",
				label: "Series",
				kind: "select",
				choices: [
					"HR-LTR-.YYYY.-"
				],
				def: "HR-LTR-.YYYY.-"
			},
			{
				name: "employee",
				label: "Employee",
				kind: "link",
				link: "Employee",
				reqd: 1,
				list: 1
			},
			{
				name: "employee_name",
				label: "Name",
				kind: "readonly",
				from: "employee.employee_name",
				list: 1
			},
			{
				name: "company",
				label: "Company",
				kind: "readonly",
				link: "Company",
				from: "employee.company"
			},
			{
				name: "letter_type",
				label: "Letter Type",
				kind: "link",
				link: "Letter Type",
				reqd: 1,
				list: 1
			},
			{
				name: "letter_date",
				label: "Letter Date",
				kind: "date",
				reqd: 1,
				def: "Today",
				list: 1
			},
			{
				name: "letter_number",
				label: "Letter Number",
				kind: "int",
				hint: "Their own running number, per type per year. Kept because it is what appears on the paper and what somebody quotes back over the phone — the document name is ours and means nothing to the person holding the letter."
			},
			{
				name: "reference_number",
				label: "Reference Number",
				kind: "text"
			},
			{
				name: "body",
				label: "Body",
				kind: "long",
				hint: "The merged text, kept as it was issued — not re-merged from the template when this is opened. A letter is a statement somebody was given on a date; re-rendering it against today's record would quietly rewrite what they were told when their designation or salary changes."
			},
			{
				name: "remarks",
				label: "Remarks",
				kind: "long",
				hint: "Ours, not theirs. Why it was issued, or what was unusual about it."
			}
		]
	},
	"Employee Loan Application": {
		name: "Employee Loan Application",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "naming_series:",
		title: "employee_name",
		fields: [
			{
				name: "naming_series",
				label: "Series",
				kind: "select",
				choices: [
					"HR-LOAN-.YYYY.-"
				],
				def: "HR-LOAN-.YYYY.-"
			},
			{
				name: "employee",
				label: "Employee",
				kind: "link",
				link: "Employee",
				reqd: 1,
				list: 1
			},
			{
				name: "employee_name",
				label: "Name",
				kind: "readonly",
				from: "employee.employee_name",
				list: 1
			},
			{
				name: "company",
				label: "Company",
				kind: "readonly",
				link: "Company",
				from: "employee.company"
			},
			{
				name: "loan_type",
				label: "Loan Type",
				kind: "link",
				link: "Employee Loan Type",
				reqd: 1,
				list: 1
			},
			{
				name: "interest_type",
				label: "Interest Type",
				kind: "select",
				choices: [
					"Interest free",
					"Reducing balance",
					"Flat"
				],
				from: "loan_type.interest_type",
				hint: "Off the Loan Type master. The rate and the term are there too."
			},
			{
				name: "loan_status",
				label: "Loan Status",
				kind: "select",
				choices: [
					"Applied",
					"Sanctioned",
					"Disbursed",
					"Running",
					"Closed"
				],
				def: "Applied",
				hint: "Applied and Closed are the two a person imposes. The three in between follow the figures — sanctioned but not paid, paid but nothing recovered, recovering — and a chosen state that disagrees with them is refused rather than overwritten. See manna_hr.rules.loan_status.",
				list: 1
			},
			{
				name: "amount_requested",
				label: "Amount Requested",
				kind: "currency",
				hint: "Separate from Sanctioned on purpose: the difference between the two is the sanction."
			},
			{
				name: "sanctioned_amount",
				label: "Sanctioned Amount",
				kind: "currency",
				hint: "What the schedule is computed on. Not the same as disbursed — a sanctioned loan never paid out must not show as owing.",
				list: 1
			},
			{
				name: "disbursed_amount",
				label: "Disbursed Amount",
				kind: "currency",
				hint: "What actually left the account. Kept apart from the sanction because the gap between them is a loan that was agreed and not yet paid, and that gap is the one thing a register must not round away."
			},
			{
				name: "opening_balance",
				label: "Opening Balance",
				kind: "currency",
				hint: "What was still owed the day this system took over. Loaded, never derived — the recoveries that produced it happened on Factor HR and are not here."
			},
			{
				name: "loan_required_for",
				label: "Loan Required For",
				kind: "select",
				choices: [
					"",
					"General",
					"Medical Treatment - Specified Disease",
					"Education",
					"Housing",
					"Vehicle",
					"Marriage",
					"Tour Advance",
					"Other"
				],
				hint: "A tax field before it is a filing one: Rule 3(7)(i) exempts a loan for the medical treatment of a specified disease from the perquisite altogether."
			},
			{
				name: "purpose_details",
				label: "Details Of Purpose",
				kind: "long"
			},
			{
				name: "recovered_amount",
				label: "Recovered To Date",
				kind: "readonly",
				hint: "The sum of the `Employee Loan Repayment` rows against this loan. Derived on save and never typed — two places to state one figure is two figures.",
				list: 1
			},
			{
				name: "outstanding_amount",
				label: "Outstanding",
				kind: "readonly",
				hint: "Opening balance plus disbursed, less recovered, floored at zero. Over-recovery is reported on its own rather than as a negative that prints as a credit.",
				list: 1
			},
			{
				name: "loan_date",
				label: "Loan Date",
				kind: "date",
				reqd: 1,
				def: "Today",
				hint: "When it was applied for. Not when it was paid.",
				list: 1
			},
			{
				name: "deduction_start_from",
				label: "Deduction Start From",
				kind: "date",
				hint: "The first payslip that carries an instalment. An advance paid mid-month is normally recovered from the month after."
			},
			{
				name: "payment_date",
				label: "Payment Date",
				kind: "date",
				hint: "Disbursement — the one date money actually moved on."
			},
			{
				name: "loan_account_no",
				label: "Loan Account No",
				kind: "text",
				hint: "The lender's own reference. Not the employee's bank account."
			},
			{
				name: "monthly_instalment",
				label: "Monthly Instalment",
				kind: "currency",
				hint: "Blank lets the schedule split the sanction evenly over the term. Set it to hold an instalment somebody agreed to that the arithmetic would not have produced."
			},
			{
				name: "salary_component",
				label: "Deduction Component",
				kind: "link",
				link: "Salary Component",
				from: "loan_type.salary_component"
			},
			{
				name: "repayment_schedule",
				label: "Repayment Schedule",
				kind: "table",
				link: "Employee Loan Repayment Schedule",
				hint: "Built from the sanction, the term and the start month, and rebuilt only while nothing has been recovered — a schedule that rewrites itself under a loan somebody has been paying is a loan nobody can reconcile."
			},
			{
				name: "loan_completed",
				label: "Loan Completed",
				kind: "readonly",
				def: "0",
				hint: "Set by the schedule finishing, not by a person."
			},
			{
				name: "do_not_auto_complete",
				label: "Do Not Auto Complete",
				kind: "check",
				def: "0",
				hint: "The override, because a loan can finish its schedule and still be owed: a bounced deduction, a stopped month, an adjustment."
			},
			{
				name: "loan_completed_on",
				label: "Loan Completed On",
				kind: "readonly"
			},
			{
				name: "remarks",
				label: "Remarks",
				kind: "long"
			}
		]
	},
	"Employee Loan Repayment": {
		name: "Employee Loan Repayment",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "naming_series:",
		title: "employee_name",
		fields: [
			{
				name: "naming_series",
				label: "Series",
				kind: "select",
				choices: [
					"HR-LREP-.YYYY.-"
				],
				def: "HR-LREP-.YYYY.-"
			},
			{
				name: "loan_application",
				label: "Loan",
				kind: "link",
				link: "Employee Loan Application",
				reqd: 1,
				list: 1
			},
			{
				name: "employee",
				label: "Employee",
				kind: "readonly",
				link: "Employee",
				from: "loan_application.employee",
				list: 1
			},
			{
				name: "employee_name",
				label: "Name",
				kind: "readonly",
				from: "loan_application.employee_name"
			},
			{
				name: "company",
				label: "Company",
				kind: "readonly",
				link: "Company",
				from: "loan_application.company",
				hint: "From the loan, never typed. Four companies share this site and a recovery filed against the wrong one is a recovery the per-company permission does not hide."
			},
			{
				name: "repayment_date",
				label: "Repayment Date",
				kind: "date",
				reqd: 1,
				def: "Today",
				list: 1
			},
			{
				name: "period",
				label: "Period",
				kind: "text",
				hint: "`YYYY-MM` — which line of the schedule this settles. Blank is allowed: an adjustment belongs to no instalment, and forcing one onto a month would make that month look paid."
			},
			{
				name: "source",
				label: "Source",
				kind: "select",
				choices: [
					"Payroll",
					"Pre Recovery",
					"Manual"
				],
				def: "Payroll",
				hint: "Pre Recovery is money that did not come out of a payslip — cash, a transfer, or an amount taken before the salary deduction starts. The schedule and the payroll run are two different clocks.",
				list: 1
			},
			{
				name: "salary_slip",
				label: "Salary Slip",
				kind: "link",
				link: "Salary Slip",
				hint: "The payslip this instalment came out of. Blank for anything recovered outside payroll."
			},
			{
				name: "amount",
				label: "Amount",
				kind: "currency",
				reqd: 1,
				list: 1
			},
			{
				name: "principal_amount",
				label: "Principal",
				kind: "currency"
			},
			{
				name: "interest_amount",
				label: "Interest",
				kind: "currency"
			},
			{
				name: "is_manual",
				label: "Manual EMI",
				kind: "check",
				def: "0",
				hint: "An instalment typed rather than computed — one month at a different amount, without rewriting the schedule under it."
			},
			{
				name: "remarks",
				label: "Remarks",
				kind: "long"
			}
		]
	},
	"Employee Loan Repayment Schedule": {
		name: "Employee Loan Repayment Schedule",
		module: "Manna HR",
		istable: 1,
		issingle: 0,
		submittable: 0,
		autoname: "",
		title: "",
		fields: [
			{
				name: "period",
				label: "Period",
				kind: "text",
				reqd: 1,
				hint: "The payroll month this instalment belongs to, as `YYYY-MM`.",
				list: 1
			},
			{
				name: "due_date",
				label: "Due Date",
				kind: "date",
				list: 1
			},
			{
				name: "principal_amount",
				label: "Principal",
				kind: "currency",
				list: 1
			},
			{
				name: "interest_amount",
				label: "Interest",
				kind: "currency"
			},
			{
				name: "total_amount",
				label: "Instalment",
				kind: "currency",
				list: 1
			},
			{
				name: "paid_amount",
				label: "Paid",
				kind: "currency",
				list: 1
			},
			{
				name: "status",
				label: "Status",
				kind: "select",
				choices: [
					"Pending",
					"Partly Paid",
					"Paid",
					"Skipped"
				],
				def: "Pending",
				list: 1
			}
		]
	},
	"Employee Loan Type": {
		name: "Employee Loan Type",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "field:loan_type_name",
		title: "loan_type_name",
		fields: [
			{
				name: "loan_type_name",
				label: "Loan Type",
				kind: "text",
				reqd: 1,
				hint: "Salary Advance and Tour Advance are the two Factor HR is using.",
				list: 1
			},
			{
				name: "is_active",
				label: "Is Active",
				kind: "check",
				def: "1",
				list: 1
			},
			{
				name: "company",
				label: "Company",
				kind: "link",
				link: "Company",
				hint: "Blank means every company. A staff advance offered group-wide and a scheme that belongs to one plant are both real, so this is not required."
			},
			{
				name: "interest_type",
				label: "Interest Type",
				kind: "select",
				choices: [
					"Interest free",
					"Reducing balance",
					"Flat"
				],
				def: "Interest free",
				hint: "Interest free is the case the perquisite columns on the application are for.",
				list: 1
			},
			{
				name: "rate_of_interest",
				label: "Rate Of Interest (% p.a.)",
				kind: "float"
			},
			{
				name: "term_months",
				label: "Term (months)",
				kind: "int",
				list: 1
			},
			{
				name: "maximum_amount",
				label: "Maximum Amount",
				kind: "currency",
				hint: "What may be sanctioned under this scheme. Checked when an application is saved, and only checked — a sanction above it is refused with the figure named rather than silently trimmed."
			},
			{
				name: "salary_component",
				label: "Deduction Component",
				kind: "link",
				link: "Salary Component",
				hint: "The `Salary Component` a recovery is deducted under. Without it a repayment can still be recorded by hand and nothing reaches a payslip on its own."
			},
			{
				name: "description",
				label: "Description",
				kind: "long"
			}
		]
	},
	"Employee Profile Change Item": {
		name: "Employee Profile Change Item",
		module: "Manna HR",
		istable: 1,
		issingle: 0,
		submittable: 0,
		autoname: "",
		title: "",
		fields: [
			{
				name: "fieldname",
				label: "Field",
				kind: "text",
				reqd: 1,
				list: 1
			},
			{
				name: "label",
				label: "Label",
				kind: "text",
				list: 1
			},
			{
				name: "old_value",
				label: "From",
				kind: "readonly",
				list: 1
			},
			{
				name: "new_value",
				label: "To",
				kind: "long",
				reqd: 1,
				list: 1
			}
		]
	},
	"Employee Profile Change Request": {
		name: "Employee Profile Change Request",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "naming_series:",
		title: "employee_name",
		fields: [
			{
				name: "naming_series",
				label: "Series",
				kind: "select",
				choices: [
					"HR-PCR-.YYYY.-.#####"
				],
				def: "HR-PCR-.YYYY.-.#####"
			},
			{
				name: "employee",
				label: "Employee",
				kind: "link",
				link: "Employee",
				reqd: 1,
				list: 1
			},
			{
				name: "employee_name",
				label: "Employee Name",
				kind: "readonly",
				from: "employee.employee_name",
				list: 1
			},
			{
				name: "company",
				label: "Company",
				kind: "readonly",
				link: "Company",
				from: "employee.company",
				hint: "From the person, never typed. Four companies share this site and a row that names the wrong one is a row the per-company permission does not hide."
			},
			{
				name: "requested_on",
				label: "Requested On",
				kind: "readonly",
				list: 1
			},
			{
				name: "reason",
				label: "Reason",
				kind: "long"
			},
			{
				name: "changes",
				label: "Changes",
				kind: "table",
				link: "Employee Profile Change Item",
				reqd: 1,
				hint: "`old_value` is captured when the request is raised, not when it is decided. An approver is agreeing to a change from something, and a From column that re-reads the record shows whatever it says now."
			},
			{
				name: "status",
				label: "Status",
				kind: "select",
				choices: [
					"Draft",
					"Pending Approval",
					"Approved",
					"Rejected"
				],
				reqd: 1,
				def: "Draft",
				list: 1
			},
			{
				name: "decided_by",
				label: "Decided By",
				kind: "readonly",
				link: "User"
			},
			{
				name: "decided_on",
				label: "Decided On",
				kind: "readonly"
			},
			{
				name: "decision_note",
				label: "Decision Note",
				kind: "long",
				hint: "Shown back to the person on a refusal. A rejection with no reason is one that gets raised again unchanged."
			},
			{
				name: "applied_on",
				label: "Applied On",
				kind: "readonly",
				hint: "Approving does not write to `Employee` on its own. This is set when somebody does, so an approved request that never landed is visible as exactly that."
			}
		]
	},
	"Employee Survey": {
		name: "Employee Survey",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "field:survey_name",
		title: "survey_name",
		fields: [
			{
				name: "survey_name",
				label: "Survey",
				kind: "text",
				reqd: 1,
				list: 1
			},
			{
				name: "company",
				label: "Company",
				kind: "link",
				link: "Company"
			},
			{
				name: "status",
				label: "Status",
				kind: "select",
				choices: [
					"Draft",
					"Open",
					"Closed"
				],
				reqd: 1,
				def: "Draft",
				hint: "Only `Open` accepts a response. Closing one does not delete anything — it stops the form and leaves the answers.",
				list: 1
			},
			{
				name: "start_date",
				label: "Opens",
				kind: "date",
				list: 1
			},
			{
				name: "end_date",
				label: "Closes",
				kind: "date",
				list: 1
			},
			{
				name: "is_anonymous",
				label: "Anonymous",
				kind: "check",
				def: "0",
				hint: "**Decided once, before the first response, and never changed.** A survey that was anonymous and then is not exposes people who answered on the promise that it was. When set, a response is stored with no employee on it at all — not hidden, absent — so there is nothing to change your mind about later."
			},
			{
				name: "audience",
				label: "Audience",
				kind: "select",
				choices: [
					"All Employees",
					"Company",
					"Department",
					"Designation",
					"Branch"
				],
				reqd: 1,
				def: "All Employees"
			},
			{
				name: "audience_value",
				label: "Audience Value",
				kind: "text",
				hint: "The department, designation or branch named above. Ignored for All Employees."
			},
			{
				name: "introduction",
				label: "Introduction",
				kind: "long",
				hint: "What people read before the first question. The place to say who sees the answers, which is the question every survey gets asked and few answer."
			},
			{
				name: "questions",
				label: "Questions",
				kind: "table",
				link: "Employee Survey Question",
				reqd: 1
			}
		]
	},
	"Employee Survey Answer": {
		name: "Employee Survey Answer",
		module: "Manna HR",
		istable: 1,
		issingle: 0,
		submittable: 0,
		autoname: "",
		title: "",
		fields: [
			{
				name: "question_no",
				label: "No",
				kind: "int",
				list: 1
			},
			{
				name: "question",
				label: "Question",
				kind: "readonly",
				list: 1
			},
			{
				name: "answer",
				label: "Answer",
				kind: "long",
				list: 1
			},
			{
				name: "rating",
				label: "Rating",
				kind: "int",
				list: 1
			}
		]
	},
	"Employee Survey Question": {
		name: "Employee Survey Question",
		module: "Manna HR",
		istable: 1,
		issingle: 0,
		submittable: 0,
		autoname: "",
		title: "",
		fields: [
			{
				name: "question_no",
				label: "No",
				kind: "int",
				list: 1
			},
			{
				name: "question",
				label: "Question",
				kind: "long",
				reqd: 1,
				list: 1
			},
			{
				name: "answer_type",
				label: "Answer Type",
				kind: "select",
				choices: [
					"Rating",
					"Yes or No",
					"Single Choice",
					"Multiple Choice",
					"Short Text",
					"Long Text"
				],
				reqd: 1,
				def: "Rating",
				list: 1
			},
			{
				name: "options",
				label: "Options",
				kind: "long",
				hint: "One per line. Read only for the two Choice types; ignored otherwise.",
				list: 1
			},
			{
				name: "is_required",
				label: "Required",
				kind: "check",
				def: "0",
				list: 1
			}
		]
	},
	"Employee Survey Response": {
		name: "Employee Survey Response",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "naming_series:",
		title: "",
		fields: [
			{
				name: "naming_series",
				label: "Series",
				kind: "select",
				choices: [
					"HR-SRV-.YYYY.-.#####"
				],
				def: "HR-SRV-.YYYY.-.#####"
			},
			{
				name: "survey",
				label: "Survey",
				kind: "link",
				link: "Employee Survey",
				reqd: 1,
				list: 1
			},
			{
				name: "employee",
				label: "Employee",
				kind: "link",
				link: "Employee",
				hint: "**Left empty on an anonymous survey, deliberately.** Not hidden by a permission — a permission is a promise somebody can change; an empty column is one nobody can.",
				list: 1
			},
			{
				name: "employee_name",
				label: "Employee Name",
				kind: "readonly",
				from: "employee.employee_name"
			},
			{
				name: "company",
				label: "Company",
				kind: "readonly",
				link: "Company",
				from: "employee.company"
			},
			{
				name: "status",
				label: "Status",
				kind: "select",
				choices: [
					"Draft",
					"Submitted"
				],
				reqd: 1,
				def: "Draft",
				list: 1
			},
			{
				name: "submitted_on",
				label: "Submitted On",
				kind: "readonly"
			},
			{
				name: "answers",
				label: "Answers",
				kind: "table",
				link: "Employee Survey Answer"
			}
		]
	},
	"Letter Type": {
		name: "Letter Type",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "field:letter_type_name",
		title: "letter_type_name",
		fields: [
			{
				name: "letter_type_name",
				label: "Letter Type",
				kind: "text",
				reqd: 1,
				hint: "The name people pick it by, and the name an Employee Letter links to. Renaming one would leave every letter already issued pointing at nothing, which is why this doctype does not allow renames.",
				list: 1
			},
			{
				name: "category",
				label: "Category",
				kind: "text",
				hint: "Factor HR groups its seventeen templates this way — Onboarding, Exit, Statutory. Free text rather than a Select: the list is theirs, it is still being read off their screens, and a Select invented here would be a list nobody can add to without a schema change.",
				list: 1
			},
			{
				name: "is_active",
				label: "Is Active",
				kind: "check",
				def: "1",
				hint: "A retired template. Kept rather than deleted — letters already issued from it still name it, and a letter whose type has vanished is a letter nobody can explain.",
				list: 1
			},
			{
				name: "body",
				label: "Body",
				kind: "long",
				hint: "The letter, with {Tokens} where a value goes — {EmployeeName}, {DateOfJoining}, {Designation}. A token with nothing behind it is printed as [[Token]] rather than blanked, because a letter with a visible gap is obviously unfinished and one with a blank space looks finished."
			},
			{
				name: "fields_used",
				label: "Fields Used",
				kind: "readonly",
				hint: "Every token this template uses, worked out from the body when it is saved. Read-only — it is a fact about the text, not a second place to state one."
			}
		]
	},
	"Manna Announcement": {
		name: "Manna Announcement",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "naming_series:",
		title: "title",
		fields: [
			{
				name: "naming_series",
				label: "Series",
				kind: "select",
				choices: [
					"MANNA-ANN-.YYYY.-"
				],
				def: "MANNA-ANN-.YYYY.-"
			},
			{
				name: "kind",
				label: "Kind",
				kind: "select",
				choices: [
					"Announcement",
					"CEO Speak"
				],
				reqd: 1,
				def: "Announcement",
				hint: "Factor HR draws these as two panels on its Welcome page — Announcements and CEO Speak — and they are the same shape: a title, a body, and a window during which the front page shows it. One doctype with a kind, rather than two doctypes differing in nothing.",
				list: 1
			},
			{
				name: "title",
				label: "Title",
				kind: "text",
				reqd: 1,
				hint: "What the front page shows in the list. It is the whole of what most people will read, so it has to say the thing rather than introduce it.",
				list: 1
			},
			{
				name: "company",
				label: "Company",
				kind: "link",
				link: "Company",
				hint: "Leave empty for the whole group. Set it and only that company's people see it — which is a permission, not a filter, so it is enforced on the server by manna_hr/permissions.py and not by the screen that draws the list.",
				list: 1
			},
			{
				name: "published",
				label: "Published",
				kind: "check",
				def: "0",
				hint: "Off until somebody means it. A notice on everybody's front page is the one thing in this app that is read by people who did not go looking for it, so the default is that a draft stays a draft — Factor HR's own composer has Save as Draft beside Submit for the same reason.",
				list: 1
			},
			{
				name: "from_date",
				label: "From Date",
				kind: "date",
				hint: "The first day it appears on the front page. Empty means from now.",
				list: 1
			},
			{
				name: "to_date",
				label: "To Date",
				kind: "date",
				hint: "The last day, inclusive. Empty means it stays until somebody unpublishes it — which is how a front page fills up with a notice about a fire drill in March."
			},
			{
				name: "body",
				label: "Body",
				kind: "long",
				hint: "The notice itself."
			},
			{
				name: "posted_by",
				label: "Posted By",
				kind: "text",
				hint: "Whose name appears under it. For CEO Speak this is the point of the panel; for an ordinary announcement it is usually HR, and Frappe already records who created the record either way.",
				list: 1
			},
			{
				name: "posted_on",
				label: "Posted On",
				kind: "date"
			}
		]
	},
	"Manna HR Settings": {
		name: "Manna HR Settings",
		module: "Manna HR",
		istable: 0,
		issingle: 1,
		submittable: 0,
		autoname: "",
		title: "",
		fields: [
			{
				name: "enforce_geofence",
				label: "Enforce Geofence",
				kind: "check",
				def: "1",
				hint: "Off records the coordinates but never refuses a punch. Use it for the first weeks of a rollout, while the radii are still being learned from real distances."
			},
			{
				name: "default_radius_metres",
				label: "Default Radius (metres)",
				kind: "int",
				def: "300",
				hint: "Used when a Work Location leaves its own radius blank."
			},
			{
				name: "require_location_for_mobile",
				label: "Require Location For Mobile Punches",
				kind: "check",
				def: "1",
				hint: "A phone punch with no coordinate is refused. Off records it as no_location and lets it through."
			},
			{
				name: "trusted_device_prefix",
				label: "Trusted Device Prefix",
				kind: "text",
				def: "BIO-",
				hint: "A device_id starting with this is a fingerprint machine: bolted to a wall, so never geofenced and never re-stamped with the server clock."
			},
			{
				name: "enforce_punch_window",
				label: "Enforce Punch Window",
				kind: "check",
				def: "1"
			},
			{
				name: "punch_in_from",
				label: "Punching Opens",
				kind: "time",
				def: "05:00:00"
			},
			{
				name: "punch_out_until",
				label: "Punching Closes",
				kind: "time",
				def: "21:30:00"
			}
		]
	},
	"Work Location": {
		name: "Work Location",
		module: "Manna HR",
		istable: 0,
		issingle: 0,
		submittable: 0,
		autoname: "field:location_name",
		title: "",
		fields: [
			{
				name: "location_name",
				label: "Location Name",
				kind: "text",
				reqd: 1,
				list: 1
			},
			{
				name: "company",
				label: "Company",
				kind: "link",
				link: "Company",
				reqd: 1,
				list: 1
			},
			{
				name: "is_active",
				label: "Active",
				kind: "check",
				def: "1"
			},
			{
				name: "address",
				label: "Address",
				kind: "long",
				hint: "For people to read. Never matched against anything."
			},
			{
				name: "latitude",
				label: "Latitude",
				kind: "float",
				reqd: 1,
				hint: "Captured by standing at the gate, not from a map pin. A pin lands on the roof; people punch at the door."
			},
			{
				name: "longitude",
				label: "Longitude",
				kind: "float",
				reqd: 1
			},
			{
				name: "radius_metres",
				label: "Radius (metres)",
				kind: "int",
				hint: "Blank falls back to Manna HR Settings. Generous on purpose: a phone against a metal shed reads badly, and refusing somebody who did turn up is the expensive mistake.",
				list: 1
			}
		]
	}
};

/** The doctypes a person edits directly — not child tables, not Singles. */
export const RECORD_DOCTYPES = Object.values(SCHEMA)
	.filter((d) => !d.istable && !d.issingle)
	.map((d) => d.name);

/** One doctype's fields, or an empty list. Never throws: a screen asking for a
    doctype this app does not install draws nothing rather than breaking, which
    is what a stale link should do. */
export const fieldsOf = (doctype) => (SCHEMA[doctype] || {}).fields || [];

/** The columns worth showing in a list, as the doctype itself marks them. */
export const listFields = (doctype) => fieldsOf(doctype).filter((f) => f.list);
