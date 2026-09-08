/* =========================================================================
   Put every doctype in this app onto the site — from the site's own console.

     1. Sign in to https://mannarubber.m.frappe.cloud and open /app
     2. F12 → Console
     3. Paste this whole file, press Enter
     4. Read what it prints

   No API key. It runs as you, in your own session, and everything it does is
   logged on the site under your name — which is the same arrangement the
   dashboard itself works under (client/src/api/client.js).

   ## What it does

   Creates each doctype that is **missing**, in the order they link in: every
   doctype a Link or Table field points at goes first, because Frappe refuses a
   link to a doctype that is not there and the error names the field rather than
   the missing table.

   ## What it will not do

   **It never touches a doctype that is already there.** Overwriting a
   definition somebody edited on the site loses whatever they changed —
   including, on a doctype with rows behind it, columns that still hold data.
   Set UPDATE_EXISTING to true only when you mean exactly that.

   **It deletes nothing, ever.** Not a doctype, not a field, not a column.

   **It carries no code.** These arrive as *custom* doctypes, which is what lets
   them be created at all without developer mode. The controllers beside the
   JSON in the repo do not run — so nothing on the server yet derives a loan's
   outstanding balance, refuses an over-recovery, or strips the name off an
   anonymous survey response. This is the way in until there is a bench, not the
   destination. See docs/DOCTYPES.md §14.

   Generated from the doctype JSON under manna_hr — edit those files, not this one.
   ========================================================================= */

const UPDATE_EXISTING = false;


const DOCTYPES = [
 {
  "actions": [],
  "allow_rename": 0,
  "autoname": "naming_series:",
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "naming_series",
    "fieldtype": "Select",
    "hidden": 1,
    "label": "Series",
    "options": "HR-ASN-.#####",
    "default": "HR-ASN-.#####"
   },
   {
    "fieldname": "employee",
    "fieldtype": "Link",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "label": "Employee",
    "options": "Employee",
    "reqd": 1,
    "search_index": 1
   },
   {
    "fetch_from": "employee.employee_name",
    "fieldname": "employee_name",
    "fieldtype": "Data",
    "in_list_view": 1,
    "label": "Employee Name",
    "read_only": 1
   },
   {
    "description": "From the person, not the gate. One machine and one store serve several companies at Manna, and the company follows the employee.",
    "fetch_from": "employee.company",
    "fieldname": "company",
    "fieldtype": "Link",
    "in_standard_filter": 1,
    "label": "Company",
    "options": "Company",
    "read_only": 1
   },
   {
    "fieldname": "column_break_who",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "asset",
    "fieldtype": "Link",
    "in_list_view": 1,
    "label": "Asset",
    "options": "Asset",
    "reqd": 1,
    "search_index": 1
   },
   {
    "description": "Filled from the asset on save. Held here as well as there so the register still reads correctly after the asset is recategorised — a handover is a record of what happened, not a live view of what the thing is called now.",
    "fieldname": "asset_type",
    "fieldtype": "Link",
    "label": "Asset Type",
    "options": "Asset Category",
    "read_only": 1
   },
   {
    "description": "`item_code`, falling back to the asset's own name. Filled from the asset on save.",
    "fieldname": "assets_code",
    "fieldtype": "Data",
    "label": "Assets Code",
    "read_only": 1
   },
   {
    "description": "Copied from the asset when it is not typed. Blank on about half of them, and that is a fact about the asset rather than a gap — a chair has no serial number.",
    "fieldname": "serial_number",
    "fieldtype": "Data",
    "label": "Serial Number"
   },
   {
    "description": "Worked out from the three counts on every save. The two exceptions are Scrapped and Damaged Or Not Working, which no count can produce and which a person may therefore impose; any other word picked here that disagrees with the counts is refused rather than overwritten. See manna_hr.rules.assignment_status.",
    "fieldname": "asset_status",
    "fieldtype": "Select",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "label": "Asset Status",
    "options": "\nAssigned\nPartly Returned\nReturned\nPartly Lost\nLost\nScrapped\nDamaged Or Not Working"
   },
   {
    "fieldname": "section_break_out",
    "fieldtype": "Section Break",
    "label": "Out"
   },
   {
    "default": "1",
    "description": "How many of them went out with this person. Not `asset_quantity` — that is how many were capitalised together, and issuing 3 of a batch of 12 had nowhere to be recorded before this doctype.",
    "fieldname": "assign_units",
    "fieldtype": "Int",
    "label": "Assign Units",
    "reqd": 1
   },
   {
    "fieldname": "assign_date",
    "fieldtype": "Date",
    "in_list_view": 1,
    "label": "Assign Date",
    "reqd": 1
   },
   {
    "fieldname": "column_break_out",
    "fieldtype": "Column Break"
   },
   {
    "description": "The date it was lent until. Nothing enforces it and nothing should — it is the date somebody agreed to, so the register can be chased against it. An ERPNext handover has no such date because a log ends when a second row brings the asset back.",
    "fieldname": "valid_till",
    "fieldtype": "Date",
    "label": "Valid Till"
   },
   {
    "fieldname": "section_break_back",
    "fieldtype": "Section Break",
    "label": "Back, Or Not"
   },
   {
    "default": "0",
    "description": "How many came back. What makes Partly Returned a state rather than a guess.",
    "fieldname": "return_unit",
    "fieldtype": "Int",
    "label": "Return Unit"
   },
   {
    "fieldname": "returned_on",
    "fieldtype": "Date",
    "label": "Returned On"
   },
   {
    "fieldname": "column_break_back",
    "fieldtype": "Column Break"
   },
   {
    "default": "0",
    "description": "How many did not come back. Scrapping is an accounting entry against the whole asset; this is a count against a person, and the two are not the same act.",
    "fieldname": "lost_units",
    "fieldtype": "Int",
    "label": "Lost Units"
   },
   {
    "description": "The day somebody said it was missing. Not `disposal_date` on Asset — that one is set by scrapping, which may happen months later or not at all.",
    "fieldname": "lost_on",
    "fieldtype": "Date",
    "label": "Lost On"
   },
   {
    "description": "The figure agreed with the person. It is recorded here and taken nowhere: a deduction is a salary component on their next slip, which is a separate and deliberate act. Refused when nothing has been lost.",
    "fieldname": "recovery_amount",
    "fieldtype": "Currency",
    "label": "Recovery Amount",
    "options": "company:company_currency"
   },
   {
    "fieldname": "section_break_notes",
    "fieldtype": "Section Break",
    "label": "Notes"
   },
   {
    "description": "Why this handover happened, or what was unusual about it. Frappe hangs Comments off a document instead, which is a different thing — a comment is signed and dated and cannot be edited into agreement later.",
    "fieldname": "remarks",
    "fieldtype": "Small Text",
    "label": "Remarks"
   },
   {
    "description": "A note about the thing itself — the dent it already had. Belongs with the handover rather than with the asset, and ERPNext's Asset has no field for it under any name.",
    "fieldname": "assets_detail",
    "fieldtype": "Small Text",
    "label": "Assets Detail"
   }
  ],
  "index_web_pages_for_search": 0,
  "links": [],
  "module": "Manna HR",
  "name": "Asset Assignment",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR User",
    "share": 1,
    "write": 1
   },
   {
    "read": 1,
    "role": "Employee"
   }
  ],
  "search_fields": "employee_name,asset,asset_status",
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "title_field": "employee_name",
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "autoname": "naming_series:",
  "engine": "InnoDB",
  "fields": [
   {
    "default": "HR-REG-.YYYY.-",
    "fieldname": "naming_series",
    "fieldtype": "Select",
    "label": "Series",
    "options": "HR-REG-.YYYY.-"
   },
   {
    "fieldname": "employee",
    "fieldtype": "Link",
    "in_list_view": 1,
    "label": "Employee",
    "options": "Employee",
    "reqd": 1
   },
   {
    "fetch_from": "employee.employee_name",
    "fieldname": "employee_name",
    "fieldtype": "Data",
    "in_list_view": 1,
    "label": "Name",
    "read_only": 1
   },
   {
    "fetch_from": "employee.company",
    "fieldname": "company",
    "fieldtype": "Link",
    "in_standard_filter": 1,
    "label": "Company",
    "options": "Company",
    "read_only": 1
   },
   {
    "fieldname": "column_break_who",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "attendance_date",
    "fieldtype": "Date",
    "in_list_view": 1,
    "label": "Date",
    "reqd": 1,
    "search_index": 1
   },
   {
    "default": "Draft",
    "fieldname": "status",
    "fieldtype": "Select",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "label": "Status",
    "options": "Draft\nPending Approval\nApproved\nRejected\nCompleted",
    "description": "Driven by the Attendance Regularization Approval workflow — see manna_hr/workflow.py. Approved means the punches were written; Completed means the day was rebuilt from them.",
    "in_preview": 1,
    "search_index": 1
   },
   {
    "description": "A person's correction is their manager's to decide. A manager's own goes to HR, because an approver signing off their own attendance is not an approval.",
    "fieldname": "approver_type",
    "fieldtype": "Select",
    "in_standard_filter": 1,
    "label": "Decided By",
    "options": "Reporting Manager\nHR",
    "read_only": 1
   },
   {
    "fieldname": "section_times",
    "fieldtype": "Section Break",
    "label": "Corrected Times",
    "description": "Leave either blank if only one punch was missed. A missed punch-out is the common case."
   },
   {
    "fieldname": "requested_in",
    "fieldtype": "Datetime",
    "label": "Punch In"
   },
   {
    "fieldname": "column_break_times",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "requested_out",
    "fieldtype": "Datetime",
    "label": "Punch Out"
   },
   {
    "fieldname": "section_why",
    "fieldtype": "Section Break"
   },
   {
    "description": "What happened. The person deciding this was not there.",
    "fieldname": "reason",
    "fieldtype": "Small Text",
    "label": "Reason",
    "reqd": 1
   },
   {
    "depends_on": "eval:['Approved','Rejected','Completed'].includes(doc.status)",
    "fieldname": "section_decision",
    "fieldtype": "Section Break",
    "label": "Decision"
   },
   {
    "fieldname": "decided_by",
    "fieldtype": "Link",
    "label": "Decided By",
    "options": "User",
    "read_only": 1
   },
   {
    "fieldname": "decided_on",
    "fieldtype": "Datetime",
    "label": "Decided On",
    "read_only": 1
   },
   {
    "fieldname": "column_break_decision",
    "fieldtype": "Column Break"
   },
   {
    "description": "Shown back to the employee. A rejection with no sentence is the thing people escalate.",
    "fieldname": "decision_note",
    "fieldtype": "Small Text",
    "label": "Note"
   }
  ],
  "index_web_pages_for_search": 1,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Attendance Regularization",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "print": 1,
    "read": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "create": 1,
    "read": 1,
    "role": "HR User",
    "write": 1
   },
   {
    "read": 1,
    "role": "Manna Attendance Approver",
    "write": 1
   },
   {
    "create": 1,
    "read": 1,
    "role": "Employee"
   }
  ],
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "track_changes": 1,
  "title_field": "employee_name",
  "show_title_field_in_link": 1,
  "search_fields": "employee,employee_name,attendance_date,status",
  "default_sort_field": "modified",
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "value_name",
    "fieldtype": "Data",
    "label": "Value",
    "reqd": 1,
    "in_list_view": 1,
    "columns": 4
   },
   {
    "fieldname": "value_code",
    "fieldtype": "Data",
    "label": "Code",
    "in_list_view": 1,
    "columns": 2
   },
   {
    "fieldname": "is_active",
    "fieldtype": "Check",
    "label": "Active",
    "default": "1",
    "in_list_view": 1,
    "columns": 1
   },
   {
    "fieldname": "description",
    "fieldtype": "Small Text",
    "label": "Description",
    "in_list_view": 1,
    "columns": 3
   }
  ],
  "index_web_pages_for_search": 0,
  "istable": 1,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Category Value",
  "permissions": [],
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "track_changes": 0,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "autoname": "field:document_type_name",
  "engine": "InnoDB",
  "fields": [
   {
    "description": "The name people pick it by, and the name an Employee Document links to. Renames are refused for the same reason Letter Type refuses them — every document already filed names this string.",
    "fieldname": "document_type_name",
    "fieldtype": "Data",
    "in_list_view": 1,
    "label": "Document Type",
    "reqd": 1,
    "unique": 1
   },
   {
    "description": "Factor HR groups theirs loosely — Identity, Statutory, Employment. Free text rather than a Select: the list is theirs and is still being read off their screens.",
    "fieldname": "category",
    "fieldtype": "Data",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "label": "Category"
   },
   {
    "default": "1",
    "description": "A retired type. Kept rather than deleted — documents already filed under it still name it.",
    "fieldname": "is_active",
    "fieldtype": "Check",
    "in_standard_filter": 1,
    "label": "Is Active"
   },
   {
    "fieldname": "column_break_shape",
    "fieldtype": "Column Break"
   },
   {
    "default": "1",
    "description": "Nearly everything has one. A type without a number is a document identified only by the person and the date — a medical certificate, say.",
    "fieldname": "has_number",
    "fieldtype": "Check",
    "label": "Has A Number"
   },
   {
    "default": "1",
    "description": "Unticked means the document never expires — a PAN card, a degree certificate. Such a document is never chased, and its status stays No Expiry rather than being reported as valid forever.",
    "fieldname": "has_expiry",
    "fieldtype": "Check",
    "label": "Has An Expiry"
   },
   {
    "default": "0",
    "fieldname": "has_place",
    "fieldtype": "Check",
    "label": "Has A Place Of Issue"
   },
   {
    "fieldname": "section_break_watch",
    "fieldtype": "Section Break",
    "label": "Expiry Watch"
   },
   {
    "default": "0",
    "description": "Ticked means a person whose document has expired may not lawfully be at work — a visa, a residence card, a labour card. This is the difference the register exists to draw: an expired passport is an inconvenience, an expired visa is somebody who cannot be on site tomorrow.",
    "fieldname": "is_statutory",
    "fieldtype": "Check",
    "in_standard_filter": 1,
    "label": "Legally Required To Work"
   },
   {
    "default": "30",
    "description": "How many days before expiry this type starts being reported as Expiring. A visa wants months, not weeks — renewing one takes longer than noticing it.",
    "fieldname": "warn_days",
    "fieldtype": "Int",
    "label": "Warn Days Before Expiry"
   },
   {
    "fieldname": "column_break_watch",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "description",
    "fieldtype": "Small Text",
    "label": "Description"
   }
  ],
  "index_web_pages_for_search": 1,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Document Type",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "create": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR User",
    "share": 1,
    "write": 1
   },
   {
    "read": 1,
    "role": "Employee"
   }
  ],
  "search_fields": "document_type_name,category",
  "show_title_field_in_link": 1,
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "title_field": "document_type_name",
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "period",
    "fieldtype": "Data",
    "label": "Period",
    "reqd": 1,
    "in_list_view": 1,
    "columns": 2,
    "description": "The payroll month this instalment belongs to, as `YYYY-MM`."
   },
   {
    "fieldname": "due_date",
    "fieldtype": "Date",
    "label": "Due Date",
    "in_list_view": 1,
    "columns": 2
   },
   {
    "fieldname": "principal_amount",
    "fieldtype": "Currency",
    "label": "Principal",
    "in_list_view": 1,
    "columns": 2
   },
   {
    "fieldname": "interest_amount",
    "fieldtype": "Currency",
    "label": "Interest",
    "columns": 1
   },
   {
    "fieldname": "total_amount",
    "fieldtype": "Currency",
    "label": "Instalment",
    "in_list_view": 1,
    "columns": 2
   },
   {
    "fieldname": "paid_amount",
    "fieldtype": "Currency",
    "label": "Paid",
    "in_list_view": 1,
    "columns": 1
   },
   {
    "fieldname": "status",
    "fieldtype": "Select",
    "label": "Status",
    "options": "Pending\nPartly Paid\nPaid\nSkipped",
    "default": "Pending",
    "in_list_view": 1,
    "columns": 2
   }
  ],
  "index_web_pages_for_search": 0,
  "istable": 1,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Loan Repayment Schedule",
  "permissions": [],
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "track_changes": 0,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 1,
  "autoname": "field:loan_type_name",
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "loan_type_name",
    "fieldtype": "Data",
    "label": "Loan Type",
    "reqd": 1,
    "unique": 1,
    "in_list_view": 1,
    "description": "Salary Advance and Tour Advance are the two Factor HR is using."
   },
   {
    "fieldname": "is_active",
    "fieldtype": "Check",
    "label": "Is Active",
    "default": "1",
    "in_list_view": 1,
    "in_standard_filter": 1
   },
   {
    "fieldname": "company",
    "fieldtype": "Link",
    "label": "Company",
    "options": "Company",
    "in_standard_filter": 1,
    "description": "Blank means every company. A staff advance offered group-wide and a scheme that belongs to one plant are both real, so this is not required."
   },
   {
    "fieldname": "column_break_what",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "interest_type",
    "fieldtype": "Select",
    "label": "Interest Type",
    "options": "Interest free\nReducing balance\nFlat",
    "default": "Interest free",
    "in_list_view": 1,
    "description": "Interest free is the case the perquisite columns on the application are for."
   },
   {
    "fieldname": "section_terms",
    "fieldtype": "Section Break",
    "label": "Terms"
   },
   {
    "fieldname": "rate_of_interest",
    "fieldtype": "Percent",
    "label": "Rate Of Interest (% p.a.)"
   },
   {
    "fieldname": "term_months",
    "fieldtype": "Int",
    "label": "Term (months)",
    "in_list_view": 1
   },
   {
    "fieldname": "maximum_amount",
    "fieldtype": "Currency",
    "label": "Maximum Amount",
    "description": "What may be sanctioned under this scheme. Checked when an application is saved, and only checked — a sanction above it is refused with the figure named rather than silently trimmed."
   },
   {
    "fieldname": "column_break_terms",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "salary_component",
    "fieldtype": "Link",
    "label": "Deduction Component",
    "options": "Salary Component",
    "description": "The `Salary Component` a recovery is deducted under. Without it a repayment can still be recorded by hand and nothing reaches a payslip on its own."
   },
   {
    "fieldname": "description",
    "fieldtype": "Small Text",
    "label": "Description"
   }
  ],
  "index_web_pages_for_search": 0,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Loan Type",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR User",
    "share": 1,
    "write": 1
   },
   {
    "read": 1,
    "role": "Employee"
   }
  ],
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "title_field": "loan_type_name",
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "fieldname",
    "fieldtype": "Data",
    "label": "Field",
    "reqd": 1,
    "in_list_view": 1,
    "columns": 3
   },
   {
    "fieldname": "label",
    "fieldtype": "Data",
    "label": "Label",
    "in_list_view": 1,
    "columns": 3
   },
   {
    "fieldname": "old_value",
    "fieldtype": "Small Text",
    "label": "From",
    "read_only": 1,
    "in_list_view": 1,
    "columns": 3
   },
   {
    "fieldname": "new_value",
    "fieldtype": "Small Text",
    "label": "To",
    "reqd": 1,
    "in_list_view": 1,
    "columns": 3
   }
  ],
  "index_web_pages_for_search": 0,
  "istable": 1,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Profile Change Item",
  "permissions": [],
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "track_changes": 0,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "question_no",
    "fieldtype": "Int",
    "label": "No",
    "in_list_view": 1,
    "columns": 1
   },
   {
    "fieldname": "question",
    "fieldtype": "Small Text",
    "label": "Question",
    "read_only": 1,
    "in_list_view": 1,
    "columns": 5
   },
   {
    "fieldname": "answer",
    "fieldtype": "Small Text",
    "label": "Answer",
    "in_list_view": 1,
    "columns": 4
   },
   {
    "fieldname": "rating",
    "fieldtype": "Int",
    "label": "Rating",
    "in_list_view": 1,
    "columns": 1
   }
  ],
  "index_web_pages_for_search": 0,
  "istable": 1,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Survey Answer",
  "permissions": [],
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "track_changes": 0,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "question_no",
    "fieldtype": "Int",
    "label": "No",
    "in_list_view": 1,
    "columns": 1
   },
   {
    "fieldname": "question",
    "fieldtype": "Small Text",
    "label": "Question",
    "reqd": 1,
    "in_list_view": 1,
    "columns": 4
   },
   {
    "fieldname": "answer_type",
    "fieldtype": "Select",
    "label": "Answer Type",
    "options": "Rating\nYes or No\nSingle Choice\nMultiple Choice\nShort Text\nLong Text",
    "default": "Rating",
    "reqd": 1,
    "in_list_view": 1,
    "columns": 2
   },
   {
    "fieldname": "options",
    "fieldtype": "Small Text",
    "label": "Options",
    "in_list_view": 1,
    "columns": 3,
    "description": "One per line. Read only for the two Choice types; ignored otherwise."
   },
   {
    "fieldname": "is_required",
    "fieldtype": "Check",
    "label": "Required",
    "default": "0",
    "in_list_view": 1,
    "columns": 1
   }
  ],
  "index_web_pages_for_search": 0,
  "istable": 1,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Survey Question",
  "permissions": [],
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "track_changes": 0,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "autoname": "field:letter_type_name",
  "engine": "InnoDB",
  "fields": [
   {
    "description": "The name people pick it by, and the name an Employee Letter links to. Renaming one would leave every letter already issued pointing at nothing, which is why this doctype does not allow renames.",
    "fieldname": "letter_type_name",
    "fieldtype": "Data",
    "in_list_view": 1,
    "label": "Letter Type",
    "reqd": 1,
    "unique": 1
   },
   {
    "description": "Factor HR groups its seventeen templates this way — Onboarding, Exit, Statutory. Free text rather than a Select: the list is theirs, it is still being read off their screens, and a Select invented here would be a list nobody can add to without a schema change.",
    "fieldname": "category",
    "fieldtype": "Data",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "label": "Category"
   },
   {
    "fieldname": "column_break_what",
    "fieldtype": "Column Break"
   },
   {
    "default": "1",
    "description": "A retired template. Kept rather than deleted — letters already issued from it still name it, and a letter whose type has vanished is a letter nobody can explain.",
    "fieldname": "is_active",
    "fieldtype": "Check",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "label": "Is Active"
   },
   {
    "fieldname": "section_body",
    "fieldtype": "Section Break",
    "label": "Template"
   },
   {
    "description": "The letter, with {Tokens} where a value goes — {EmployeeName}, {DateOfJoining}, {Designation}. A token with nothing behind it is printed as [[Token]] rather than blanked, because a letter with a visible gap is obviously unfinished and one with a blank space looks finished.",
    "fieldname": "body",
    "fieldtype": "Text Editor",
    "label": "Body"
   },
   {
    "description": "Every token this template uses, worked out from the body when it is saved. Read-only — it is a fact about the text, not a second place to state one.",
    "fieldname": "fields_used",
    "fieldtype": "Small Text",
    "label": "Fields Used",
    "read_only": 1
   }
  ],
  "index_web_pages_for_search": 1,
  "links": [],
  "module": "Manna HR",
  "name": "Letter Type",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "create": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR User",
    "share": 1,
    "write": 1
   },
   {
    "read": 1,
    "role": "Manna Attendance Approver"
   },
   {
    "read": 1,
    "role": "Employee"
   }
  ],
  "search_fields": "letter_type_name,category",
  "show_title_field_in_link": 1,
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "title_field": "letter_type_name",
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "section_geofence",
    "fieldtype": "Section Break",
    "label": "Geofence"
   },
   {
    "default": "1",
    "description": "Off records the coordinates but never refuses a punch. Use it for the first weeks of a rollout, while the radii are still being learned from real distances.",
    "fieldname": "enforce_geofence",
    "fieldtype": "Check",
    "label": "Enforce Geofence"
   },
   {
    "default": "300",
    "description": "Used when a Work Location leaves its own radius blank.",
    "fieldname": "default_radius_metres",
    "fieldtype": "Int",
    "label": "Default Radius (metres)"
   },
   {
    "fieldname": "column_break_geo",
    "fieldtype": "Column Break"
   },
   {
    "default": "1",
    "description": "A phone punch with no coordinate is refused. Off records it as no_location and lets it through.",
    "fieldname": "require_location_for_mobile",
    "fieldtype": "Check",
    "label": "Require Location For Mobile Punches"
   },
   {
    "default": "BIO-",
    "description": "A device_id starting with this is a fingerprint machine: bolted to a wall, so never geofenced and never re-stamped with the server clock.",
    "fieldname": "trusted_device_prefix",
    "fieldtype": "Data",
    "label": "Trusted Device Prefix"
   },
   {
    "fieldname": "section_window",
    "fieldtype": "Section Break",
    "label": "Punch Window",
    "description": "Binds self-service phone punches only. Machine punches and approved regularizations are exempt, because both legitimately record times other than now."
   },
   {
    "default": "1",
    "fieldname": "enforce_punch_window",
    "fieldtype": "Check",
    "label": "Enforce Punch Window"
   },
   {
    "default": "05:00:00",
    "fieldname": "punch_in_from",
    "fieldtype": "Time",
    "label": "Punching Opens"
   },
   {
    "fieldname": "column_break_window",
    "fieldtype": "Column Break"
   },
   {
    "default": "21:30:00",
    "fieldname": "punch_out_until",
    "fieldtype": "Time",
    "label": "Punching Closes"
   }
  ],
  "index_web_pages_for_search": 1,
  "issingle": 1,
  "links": [],
  "module": "Manna HR",
  "name": "Manna HR Settings",
  "permissions": [
   {
    "create": 1,
    "email": 1,
    "print": 1,
    "read": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "read": 1,
    "role": "HR User"
   }
  ],
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 1,
  "autoname": "field:location_name",
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "location_name",
    "fieldtype": "Data",
    "in_list_view": 1,
    "label": "Location Name",
    "reqd": 1,
    "unique": 1
   },
   {
    "fieldname": "company",
    "fieldtype": "Link",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "label": "Company",
    "options": "Company",
    "reqd": 1
   },
   {
    "default": "1",
    "fieldname": "is_active",
    "fieldtype": "Check",
    "label": "Active"
   },
   {
    "fieldname": "column_break_place",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "address",
    "fieldtype": "Small Text",
    "label": "Address",
    "description": "For people to read. Never matched against anything."
   },
   {
    "fieldname": "section_break_fence",
    "fieldtype": "Section Break",
    "label": "Geofence"
   },
   {
    "description": "Captured by standing at the gate, not from a map pin. A pin lands on the roof; people punch at the door.",
    "fieldname": "latitude",
    "fieldtype": "Float",
    "label": "Latitude",
    "precision": "8",
    "reqd": 1
   },
   {
    "fieldname": "longitude",
    "fieldtype": "Float",
    "label": "Longitude",
    "precision": "8",
    "reqd": 1
   },
   {
    "fieldname": "column_break_fence",
    "fieldtype": "Column Break"
   },
   {
    "description": "Blank falls back to Manna HR Settings. Generous on purpose: a phone against a metal shed reads badly, and refusing somebody who did turn up is the expensive mistake.",
    "fieldname": "radius_metres",
    "fieldtype": "Int",
    "in_list_view": 1,
    "label": "Radius (metres)"
   }
  ],
  "index_web_pages_for_search": 1,
  "links": [],
  "module": "Manna HR",
  "name": "Work Location",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "print": 1,
    "read": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "read": 1,
    "role": "HR User"
   },
   {
    "read": 1,
    "role": "Employee"
   }
  ],
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 1,
  "autoname": "field:device_name",
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "device_name",
    "fieldtype": "Data",
    "label": "Device Name",
    "reqd": 1,
    "unique": 1,
    "in_list_view": 1,
    "description": "What people at the plant call it. Naming is by this, so it is what every report and every alert says."
   },
   {
    "fieldname": "device_id",
    "fieldtype": "Data",
    "label": "Device ID",
    "reqd": 1,
    "unique": 1,
    "in_list_view": 1,
    "search_index": 1,
    "description": "Exactly the string this machine puts in `Employee Checkin.device_id`. It must start with `Manna HR Settings.trusted_device_prefix` (`BIO-`) or every punch off it is judged as a phone punch, geofenced, and refused — no fingerprint machine sends a coordinate. Renaming it here without renaming it on the machine breaks that machine's punches silently."
   },
   {
    "fieldname": "company",
    "fieldtype": "Link",
    "label": "Company",
    "options": "Company",
    "reqd": 1,
    "in_standard_filter": 1
   },
   {
    "fieldname": "work_location",
    "fieldtype": "Link",
    "label": "Work Location",
    "options": "Work Location",
    "description": "The gate this machine stands at. Only for reports and for the silence alert — a machine punch is never geofenced."
   },
   {
    "fieldname": "is_active",
    "fieldtype": "Check",
    "label": "Active",
    "default": "1",
    "in_list_view": 1,
    "description": "Retire rather than delete. A punch from a device nobody can name is a punch nobody can explain."
   },
   {
    "fieldname": "column_break_net",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "ip_address",
    "fieldtype": "Data",
    "label": "IP Address",
    "description": "On the plant LAN, e.g. 192.168.1.40. The bridge reaches it; the site never does."
   },
   {
    "fieldname": "port",
    "fieldtype": "Int",
    "label": "Port",
    "default": "4370",
    "description": "ZK protocol default. Named here rather than in bridge/config.toml so a machine moved to another port is one edit by somebody who is not at a console."
   },
   {
    "fieldname": "serial_number",
    "fieldtype": "Data",
    "label": "Serial Number"
   },
   {
    "fieldname": "model",
    "fieldtype": "Data",
    "label": "Model",
    "default": "Identix K90+ID"
   },
   {
    "fieldname": "section_break_health",
    "fieldtype": "Section Break",
    "label": "Health"
   },
   {
    "fieldname": "last_seen",
    "fieldtype": "Datetime",
    "label": "Last Seen",
    "read_only": 1,
    "in_list_view": 1,
    "description": "When the bridge last spoke to it. Written by the bridge, never by hand."
   },
   {
    "fieldname": "last_punch_at",
    "fieldtype": "Datetime",
    "label": "Last Punch At",
    "read_only": 1,
    "description": "The newest punch delivered from this machine. Silence here is what `manna_hr.tasks.alert_on_silent_devices` reads: a dead bridge and a workforce that stopped coming in look identical until payroll runs."
   },
   {
    "fieldname": "column_break_health",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "silent_after_hours",
    "fieldtype": "Int",
    "label": "Alert After (hours of silence)",
    "default": "12",
    "description": "Blank or zero means never alert on this one — right for a machine at a site that works one shift a week, wrong for a factory gate."
   },
   {
    "fieldname": "notes",
    "fieldtype": "Small Text",
    "label": "Notes"
   }
  ],
  "index_web_pages_for_search": 0,
  "links": [],
  "module": "Manna HR",
  "name": "Attendance Device",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "read": 1,
    "report": 1,
    "export": 1,
    "role": "HR User"
   }
  ],
  "search_fields": "device_id,company,work_location",
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "title_field": "device_name",
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "autoname": "field:category_type_name",
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "category_type_name",
    "fieldtype": "Data",
    "label": "Category Type",
    "reqd": 1,
    "unique": 1,
    "in_list_view": 1,
    "description": "Factor HR's Description — the label a person reads beside the box."
   },
   {
    "fieldname": "category_code",
    "fieldtype": "Data",
    "label": "Code",
    "reqd": 1,
    "unique": 1,
    "in_list_view": 1,
    "description": "Becomes the `Custom Field` fieldname on Employee, prefixed `custom_cat_` and lower-cased with underscores. Frappe reserves the unprefixed namespace for its own fields and a collision is the kind of mistake nobody finds until an upgrade."
   },
   {
    "fieldname": "custom_field",
    "fieldtype": "Data",
    "label": "Custom Field",
    "read_only": 1,
    "description": "The `Custom Field` this type created on Employee, once it has. Read-only because the field is the thing that exists — this row records which one."
   },
   {
    "fieldname": "is_active",
    "fieldtype": "Check",
    "label": "Active",
    "default": "1",
    "in_list_view": 1
   },
   {
    "fieldname": "column_break_tree",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "parent_category_type",
    "fieldtype": "Link",
    "label": "Parent Category Type",
    "options": "Employee Category Type",
    "description": "Factor HR nests category types. Frappe has no hierarchy for custom fields — a field belongs to a doctype and sits after another field, and that is the whole of its structure. The nesting is held here so it is not lost, and it decides nothing on the site."
   },
   {
    "fieldname": "is_mandatory",
    "fieldtype": "Check",
    "label": "Mandatory On Employee",
    "default": "0",
    "description": "Writes `Custom Field.reqd`. The site then refuses to save an Employee without it, which is what mandatory has to mean if it means anything."
   },
   {
    "fieldname": "show_in_filter",
    "fieldtype": "Check",
    "label": "Show In Filters",
    "default": "1"
   },
   {
    "fieldname": "section_break_display",
    "fieldtype": "Section Break",
    "label": "Display"
   },
   {
    "fieldname": "prompt_message",
    "fieldtype": "Small Text",
    "label": "Prompt Message",
    "description": "`Custom Field.description` — the grey line under the box."
   },
   {
    "fieldname": "screen_priority",
    "fieldtype": "Int",
    "label": "Screen Display Priority",
    "description": "Factor HR orders the form by a number; Frappe answers with `insert_after`, a field name. The two do not convert, so this is carried as intent for whoever places the field."
   },
   {
    "fieldname": "column_break_display",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "report_priority",
    "fieldtype": "Int",
    "label": "Report Display Priority"
   },
   {
    "fieldname": "report_display",
    "fieldtype": "Small Text",
    "label": "Report Category Display",
    "description": "Which of Factor HR's reports this printed on. Nothing on this side reads it: an ERPNext report prints the columns the report asks for. Kept so whoever builds those reports can read what was wanted."
   },
   {
    "fieldname": "section_break_values",
    "fieldtype": "Section Break",
    "label": "Values"
   },
   {
    "fieldname": "values",
    "fieldtype": "Table",
    "label": "Values",
    "options": "Employee Category Value",
    "description": "What this category may be set to. On the site these become the `options` lines of the Select field — which is why a value retired here must be deactivated rather than deleted: an Employee already carrying it would otherwise hold a value the field no longer offers."
   }
  ],
  "index_web_pages_for_search": 0,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Category Type",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "read": 1,
    "report": 1,
    "export": 1,
    "role": "HR User"
   },
   {
    "read": 1,
    "role": "Employee"
   }
  ],
  "search_fields": "category_code,parent_category_type",
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "title_field": "category_type_name",
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "autoname": "naming_series:",
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "naming_series",
    "fieldtype": "Select",
    "hidden": 1,
    "label": "Series",
    "options": "HR-EDOC-.#####",
    "default": "HR-EDOC-.#####"
   },
   {
    "fieldname": "employee",
    "fieldtype": "Link",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "label": "Employee",
    "options": "Employee",
    "reqd": 1,
    "search_index": 1
   },
   {
    "fetch_from": "employee.employee_name",
    "fieldname": "employee_name",
    "fieldtype": "Data",
    "in_list_view": 1,
    "label": "Employee Name",
    "read_only": 1
   },
   {
    "description": "Copied from the person, not chosen here. One machine serves several companies at Manna and the company follows the employee — see docs/DEVICES.md.",
    "fetch_from": "employee.company",
    "fieldname": "company",
    "fieldtype": "Link",
    "in_standard_filter": 1,
    "label": "Company",
    "options": "Company",
    "read_only": 1
   },
   {
    "fieldname": "column_break_who",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "document_type",
    "fieldtype": "Link",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "label": "Document Type",
    "options": "Employee Document Type",
    "reqd": 1
   },
   {
    "description": "Copied from the type so the register can be filtered on it without a join. Read-only here: whether a document is legally required is a fact about the type, not about one person's copy of it.",
    "fetch_from": "document_type.is_statutory",
    "fieldname": "is_statutory",
    "fieldtype": "Check",
    "in_standard_filter": 1,
    "label": "Legally Required To Work",
    "read_only": 1
   },
   {
    "description": "Worked out from the expiry date when this is saved, and again every night by manna_hr.onboard.refresh_document_status. Stored rather than computed on read so the expiry watch is a list filter and a report, not arithmetic that only happens when somebody opens a screen.",
    "fieldname": "status",
    "fieldtype": "Select",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "label": "Status",
    "options": "\nValid\nExpiring\nExpired\nNo Expiry",
    "read_only": 1
   },
   {
    "fieldname": "section_break_doc",
    "fieldtype": "Section Break",
    "label": "The Document"
   },
   {
    "fieldname": "document_number",
    "fieldtype": "Data",
    "in_list_view": 1,
    "label": "Document Number",
    "search_index": 1
   },
   {
    "fieldname": "date_of_issue",
    "fieldtype": "Date",
    "label": "Date Of Issue"
   },
   {
    "fieldname": "place_of_issue",
    "fieldtype": "Data",
    "label": "Place Of Issue"
   },
   {
    "fieldname": "column_break_doc",
    "fieldtype": "Column Break"
   },
   {
    "description": "Blank on a type that has no expiry. Blank on a type that does have one is not an error either — it is a document nobody has finished filing, and it is reported as such rather than being counted as valid.",
    "fieldname": "valid_upto",
    "fieldtype": "Date",
    "in_list_view": 1,
    "label": "Valid Upto"
   },
   {
    "description": "Negative means it has already expired. Kept alongside the status so a report can sort by urgency rather than by category.",
    "fieldname": "days_to_expiry",
    "fieldtype": "Int",
    "label": "Days To Expiry",
    "read_only": 1
   },
   {
    "fieldname": "section_break_file",
    "fieldtype": "Section Break",
    "label": "Scan And Notes"
   },
   {
    "description": "The scan. Private by default — this is somebody's passport.",
    "fieldname": "attachment",
    "fieldtype": "Attach",
    "label": "Attachment"
   },
   {
    "description": "The box Factor HR has and ERPNext's Employee has nowhere for. A note about this one document, not about the person.",
    "fieldname": "remarks",
    "fieldtype": "Small Text",
    "label": "Remarks"
   }
  ],
  "index_web_pages_for_search": 0,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Document",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR User",
    "share": 1,
    "write": 1
   },
   {
    "read": 1,
    "role": "Employee"
   }
  ],
  "search_fields": "employee_name,document_type,document_number",
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "title_field": "employee_name",
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "autoname": "naming_series:",
  "engine": "InnoDB",
  "fields": [
   {
    "default": "HR-LTR-.YYYY.-",
    "fieldname": "naming_series",
    "fieldtype": "Select",
    "label": "Series",
    "options": "HR-LTR-.YYYY.-"
   },
   {
    "fieldname": "employee",
    "fieldtype": "Link",
    "in_list_view": 1,
    "label": "Employee",
    "options": "Employee",
    "reqd": 1,
    "search_index": 1
   },
   {
    "fetch_from": "employee.employee_name",
    "fieldname": "employee_name",
    "fieldtype": "Data",
    "in_list_view": 1,
    "label": "Name",
    "read_only": 1
   },
   {
    "fetch_from": "employee.company",
    "fieldname": "company",
    "fieldtype": "Link",
    "in_standard_filter": 1,
    "label": "Company",
    "options": "Company",
    "read_only": 1
   },
   {
    "fieldname": "column_break_who",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "letter_type",
    "fieldtype": "Link",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "label": "Letter Type",
    "options": "Letter Type",
    "reqd": 1
   },
   {
    "default": "Today",
    "fieldname": "letter_date",
    "fieldtype": "Date",
    "in_list_view": 1,
    "label": "Letter Date",
    "reqd": 1,
    "search_index": 1
   },
   {
    "description": "Their own running number, per type per year. Kept because it is what appears on the paper and what somebody quotes back over the phone — the document name is ours and means nothing to the person holding the letter.",
    "fieldname": "letter_number",
    "fieldtype": "Int",
    "label": "Letter Number"
   },
   {
    "fieldname": "reference_number",
    "fieldtype": "Data",
    "label": "Reference Number"
   },
   {
    "fieldname": "section_body",
    "fieldtype": "Section Break",
    "label": "As It Went Out"
   },
   {
    "description": "The merged text, kept as it was issued — not re-merged from the template when this is opened. A letter is a statement somebody was given on a date; re-rendering it against today's record would quietly rewrite what they were told when their designation or salary changes.",
    "fieldname": "body",
    "fieldtype": "Text Editor",
    "label": "Body"
   },
   {
    "fieldname": "section_notes",
    "fieldtype": "Section Break"
   },
   {
    "description": "Ours, not theirs. Why it was issued, or what was unusual about it.",
    "fieldname": "remarks",
    "fieldtype": "Small Text",
    "label": "Remarks"
   }
  ],
  "index_web_pages_for_search": 1,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Letter",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "create": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR User",
    "share": 1,
    "write": 1
   },
   {
    "print": 1,
    "read": 1,
    "role": "Employee"
   }
  ],
  "search_fields": "employee,employee_name,letter_type,letter_date",
  "show_title_field_in_link": 1,
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "title_field": "employee_name",
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "autoname": "naming_series:",
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "naming_series",
    "fieldtype": "Select",
    "label": "Series",
    "options": "HR-LOAN-.YYYY.-",
    "default": "HR-LOAN-.YYYY.-"
   },
   {
    "fieldname": "employee",
    "fieldtype": "Link",
    "label": "Employee",
    "options": "Employee",
    "reqd": 1,
    "search_index": 1,
    "in_list_view": 1
   },
   {
    "fieldname": "employee_name",
    "fieldtype": "Data",
    "label": "Name",
    "fetch_from": "employee.employee_name",
    "in_list_view": 1,
    "read_only": 1
   },
   {
    "fieldname": "company",
    "fieldtype": "Link",
    "label": "Company",
    "options": "Company",
    "fetch_from": "employee.company",
    "in_standard_filter": 1,
    "read_only": 1
   },
   {
    "fieldname": "column_break_who",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "loan_type",
    "fieldtype": "Link",
    "label": "Loan Type",
    "options": "Employee Loan Type",
    "reqd": 1,
    "in_list_view": 1,
    "in_standard_filter": 1
   },
   {
    "fieldname": "interest_type",
    "fieldtype": "Select",
    "label": "Interest Type",
    "options": "Interest free\nReducing balance\nFlat",
    "fetch_from": "loan_type.interest_type",
    "description": "Off the Loan Type master. The rate and the term are there too."
   },
   {
    "fieldname": "loan_status",
    "fieldtype": "Select",
    "label": "Loan Status",
    "options": "Applied\nSanctioned\nDisbursed\nRunning\nClosed",
    "default": "Applied",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "description": "Applied and Closed are the two a person imposes. The three in between follow the figures — sanctioned but not paid, paid but nothing recovered, recovering — and a chosen state that disagrees with them is refused rather than overwritten. See manna_hr.rules.loan_status."
   },
   {
    "fieldname": "section_amounts",
    "fieldtype": "Section Break",
    "label": "Amounts"
   },
   {
    "fieldname": "amount_requested",
    "fieldtype": "Currency",
    "label": "Amount Requested",
    "description": "Separate from Sanctioned on purpose: the difference between the two is the sanction."
   },
   {
    "fieldname": "sanctioned_amount",
    "fieldtype": "Currency",
    "label": "Sanctioned Amount",
    "in_list_view": 1,
    "description": "What the schedule is computed on. Not the same as disbursed — a sanctioned loan never paid out must not show as owing."
   },
   {
    "fieldname": "disbursed_amount",
    "fieldtype": "Currency",
    "label": "Disbursed Amount",
    "description": "What actually left the account. Kept apart from the sanction because the gap between them is a loan that was agreed and not yet paid, and that gap is the one thing a register must not round away."
   },
   {
    "fieldname": "opening_balance",
    "fieldtype": "Currency",
    "label": "Opening Balance",
    "description": "What was still owed the day this system took over. Loaded, never derived — the recoveries that produced it happened on Factor HR and are not here."
   },
   {
    "fieldname": "column_break_amounts",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "loan_required_for",
    "fieldtype": "Select",
    "label": "Loan Required For",
    "options": "\nGeneral\nMedical Treatment - Specified Disease\nEducation\nHousing\nVehicle\nMarriage\nTour Advance\nOther",
    "description": "A tax field before it is a filing one: Rule 3(7)(i) exempts a loan for the medical treatment of a specified disease from the perquisite altogether."
   },
   {
    "fieldname": "purpose_details",
    "fieldtype": "Small Text",
    "label": "Details Of Purpose"
   },
   {
    "fieldname": "recovered_amount",
    "fieldtype": "Currency",
    "label": "Recovered To Date",
    "read_only": 1,
    "in_list_view": 1,
    "description": "The sum of the `Employee Loan Repayment` rows against this loan. Derived on save and never typed — two places to state one figure is two figures."
   },
   {
    "fieldname": "outstanding_amount",
    "fieldtype": "Currency",
    "label": "Outstanding",
    "read_only": 1,
    "in_list_view": 1,
    "description": "Opening balance plus disbursed, less recovered, floored at zero. Over-recovery is reported on its own rather than as a negative that prints as a credit."
   },
   {
    "fieldname": "section_dates",
    "fieldtype": "Section Break",
    "label": "Dates"
   },
   {
    "fieldname": "loan_date",
    "fieldtype": "Date",
    "label": "Loan Date",
    "reqd": 1,
    "default": "Today",
    "in_list_view": 1,
    "description": "When it was applied for. Not when it was paid."
   },
   {
    "fieldname": "deduction_start_from",
    "fieldtype": "Date",
    "label": "Deduction Start From",
    "description": "The first payslip that carries an instalment. An advance paid mid-month is normally recovered from the month after."
   },
   {
    "fieldname": "column_break_dates",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "payment_date",
    "fieldtype": "Date",
    "label": "Payment Date",
    "description": "Disbursement — the one date money actually moved on."
   },
   {
    "fieldname": "loan_account_no",
    "fieldtype": "Data",
    "label": "Loan Account No",
    "description": "The lender's own reference. Not the employee's bank account."
   },
   {
    "fieldname": "section_recovery",
    "fieldtype": "Section Break",
    "label": "Recovery"
   },
   {
    "fieldname": "monthly_instalment",
    "fieldtype": "Currency",
    "label": "Monthly Instalment",
    "description": "Blank lets the schedule split the sanction evenly over the term. Set it to hold an instalment somebody agreed to that the arithmetic would not have produced."
   },
   {
    "fieldname": "salary_component",
    "fieldtype": "Link",
    "label": "Deduction Component",
    "options": "Salary Component",
    "fetch_from": "loan_type.salary_component",
    "fetch_if_empty": 1
   },
   {
    "fieldname": "column_break_recovery",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "repayment_schedule",
    "fieldtype": "Table",
    "label": "Repayment Schedule",
    "options": "Employee Loan Repayment Schedule",
    "description": "Built from the sanction, the term and the start month, and rebuilt only while nothing has been recovered — a schedule that rewrites itself under a loan somebody has been paying is a loan nobody can reconcile."
   },
   {
    "fieldname": "section_close",
    "fieldtype": "Section Break",
    "label": "Closure"
   },
   {
    "fieldname": "loan_completed",
    "fieldtype": "Check",
    "label": "Loan Completed",
    "default": "0",
    "read_only": 1,
    "description": "Set by the schedule finishing, not by a person."
   },
   {
    "fieldname": "do_not_auto_complete",
    "fieldtype": "Check",
    "label": "Do Not Auto Complete",
    "default": "0",
    "description": "The override, because a loan can finish its schedule and still be owed: a bounced deduction, a stopped month, an adjustment."
   },
   {
    "fieldname": "column_break_close",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "loan_completed_on",
    "fieldtype": "Date",
    "label": "Loan Completed On",
    "read_only": 1
   },
   {
    "fieldname": "remarks",
    "fieldtype": "Small Text",
    "label": "Remarks"
   }
  ],
  "index_web_pages_for_search": 0,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Loan Application",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR User",
    "share": 1,
    "write": 1
   },
   {
    "read": 1,
    "role": "Employee"
   }
  ],
  "search_fields": "employee,employee_name,loan_type,loan_status",
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "title_field": "employee_name",
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "autoname": "naming_series:",
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "naming_series",
    "fieldtype": "Select",
    "label": "Series",
    "options": "HR-PCR-.YYYY.-.#####",
    "default": "HR-PCR-.YYYY.-.#####",
    "hidden": 1
   },
   {
    "fieldname": "employee",
    "fieldtype": "Link",
    "label": "Employee",
    "options": "Employee",
    "reqd": 1,
    "in_list_view": 1,
    "in_standard_filter": 1,
    "search_index": 1
   },
   {
    "fieldname": "employee_name",
    "fieldtype": "Data",
    "label": "Employee Name",
    "fetch_from": "employee.employee_name",
    "read_only": 1,
    "in_list_view": 1
   },
   {
    "fieldname": "company",
    "fieldtype": "Link",
    "label": "Company",
    "options": "Company",
    "fetch_from": "employee.company",
    "read_only": 1,
    "in_standard_filter": 1,
    "description": "From the person, never typed. Four companies share this site and a row that names the wrong one is a row the per-company permission does not hide."
   },
   {
    "fieldname": "column_break_pcr",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "requested_on",
    "fieldtype": "Datetime",
    "label": "Requested On",
    "read_only": 1,
    "in_list_view": 1
   },
   {
    "fieldname": "reason",
    "fieldtype": "Small Text",
    "label": "Reason"
   },
   {
    "fieldname": "section_break_changes",
    "fieldtype": "Section Break",
    "label": "What Changes"
   },
   {
    "fieldname": "changes",
    "fieldtype": "Table",
    "label": "Changes",
    "options": "Employee Profile Change Item",
    "reqd": 1,
    "description": "`old_value` is captured when the request is raised, not when it is decided. An approver is agreeing to a change from something, and a From column that re-reads the record shows whatever it says now."
   },
   {
    "fieldname": "section_break_decision",
    "fieldtype": "Section Break",
    "label": "Decision"
   },
   {
    "fieldname": "status",
    "fieldtype": "Select",
    "label": "Status",
    "options": "Draft\nPending Approval\nApproved\nRejected",
    "default": "Draft",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "reqd": 1,
    "allow_on_submit": 0
   },
   {
    "fieldname": "decided_by",
    "fieldtype": "Link",
    "label": "Decided By",
    "options": "User",
    "read_only": 1
   },
   {
    "fieldname": "column_break_decision",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "decided_on",
    "fieldtype": "Datetime",
    "label": "Decided On",
    "read_only": 1
   },
   {
    "fieldname": "decision_note",
    "fieldtype": "Small Text",
    "label": "Decision Note",
    "description": "Shown back to the person on a refusal. A rejection with no reason is one that gets raised again unchanged."
   },
   {
    "fieldname": "applied_on",
    "fieldtype": "Datetime",
    "label": "Applied On",
    "read_only": 1,
    "description": "Approving does not write to `Employee` on its own. This is set when somebody does, so an approved request that never landed is visible as exactly that."
   }
  ],
  "index_web_pages_for_search": 0,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Profile Change Request",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR User",
    "share": 1,
    "write": 1
   },
   {
    "create": 1,
    "read": 1,
    "write": 1,
    "role": "Employee"
   }
  ],
  "search_fields": "employee_name,status",
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "title_field": "employee_name",
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 1,
  "autoname": "field:survey_name",
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "survey_name",
    "fieldtype": "Data",
    "label": "Survey",
    "reqd": 1,
    "unique": 1,
    "in_list_view": 1
   },
   {
    "fieldname": "company",
    "fieldtype": "Link",
    "label": "Company",
    "options": "Company",
    "in_standard_filter": 1
   },
   {
    "fieldname": "status",
    "fieldtype": "Select",
    "label": "Status",
    "options": "Draft\nOpen\nClosed",
    "default": "Draft",
    "reqd": 1,
    "in_list_view": 1,
    "in_standard_filter": 1,
    "description": "Only `Open` accepts a response. Closing one does not delete anything — it stops the form and leaves the answers."
   },
   {
    "fieldname": "column_break_when",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "start_date",
    "fieldtype": "Date",
    "label": "Opens",
    "in_list_view": 1
   },
   {
    "fieldname": "end_date",
    "fieldtype": "Date",
    "label": "Closes",
    "in_list_view": 1
   },
   {
    "fieldname": "is_anonymous",
    "fieldtype": "Check",
    "label": "Anonymous",
    "default": "0",
    "description": "**Decided once, before the first response, and never changed.** A survey that was anonymous and then is not exposes people who answered on the promise that it was. When set, a response is stored with no employee on it at all — not hidden, absent — so there is nothing to change your mind about later."
   },
   {
    "fieldname": "section_break_audience",
    "fieldtype": "Section Break",
    "label": "Audience"
   },
   {
    "fieldname": "audience",
    "fieldtype": "Select",
    "label": "Audience",
    "options": "All Employees\nCompany\nDepartment\nDesignation\nBranch",
    "default": "All Employees",
    "reqd": 1
   },
   {
    "fieldname": "audience_value",
    "fieldtype": "Data",
    "label": "Audience Value",
    "description": "The department, designation or branch named above. Ignored for All Employees."
   },
   {
    "fieldname": "column_break_audience",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "introduction",
    "fieldtype": "Text Editor",
    "label": "Introduction",
    "description": "What people read before the first question. The place to say who sees the answers, which is the question every survey gets asked and few answer."
   },
   {
    "fieldname": "section_break_questions",
    "fieldtype": "Section Break",
    "label": "Questions"
   },
   {
    "fieldname": "questions",
    "fieldtype": "Table",
    "label": "Questions",
    "options": "Employee Survey Question",
    "reqd": 1
   }
  ],
  "index_web_pages_for_search": 0,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Survey",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "read": 1,
    "report": 1,
    "export": 1,
    "role": "HR User"
   },
   {
    "read": 1,
    "role": "Employee"
   }
  ],
  "search_fields": "status,company",
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "title_field": "survey_name",
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "autoname": "naming_series:",
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "naming_series",
    "fieldtype": "Select",
    "label": "Series",
    "options": "HR-LREP-.YYYY.-",
    "default": "HR-LREP-.YYYY.-"
   },
   {
    "fieldname": "loan_application",
    "fieldtype": "Link",
    "label": "Loan",
    "options": "Employee Loan Application",
    "reqd": 1,
    "search_index": 1,
    "in_list_view": 1
   },
   {
    "fieldname": "employee",
    "fieldtype": "Link",
    "label": "Employee",
    "options": "Employee",
    "fetch_from": "loan_application.employee",
    "in_list_view": 1,
    "read_only": 1
   },
   {
    "fieldname": "employee_name",
    "fieldtype": "Data",
    "label": "Name",
    "fetch_from": "loan_application.employee_name",
    "read_only": 1
   },
   {
    "fieldname": "company",
    "fieldtype": "Link",
    "label": "Company",
    "options": "Company",
    "fetch_from": "loan_application.company",
    "read_only": 1,
    "in_standard_filter": 1,
    "description": "From the loan, never typed. Four companies share this site and a recovery filed against the wrong one is a recovery the per-company permission does not hide."
   },
   {
    "fieldname": "column_break_who",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "repayment_date",
    "fieldtype": "Date",
    "label": "Repayment Date",
    "reqd": 1,
    "search_index": 1,
    "default": "Today",
    "in_list_view": 1
   },
   {
    "fieldname": "period",
    "fieldtype": "Data",
    "label": "Period",
    "description": "`YYYY-MM` — which line of the schedule this settles. Blank is allowed: an adjustment belongs to no instalment, and forcing one onto a month would make that month look paid."
   },
   {
    "fieldname": "source",
    "fieldtype": "Select",
    "label": "Source",
    "options": "Payroll\nPre Recovery\nManual",
    "default": "Payroll",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "description": "Pre Recovery is money that did not come out of a payslip — cash, a transfer, or an amount taken before the salary deduction starts. The schedule and the payroll run are two different clocks."
   },
   {
    "fieldname": "salary_slip",
    "fieldtype": "Link",
    "label": "Salary Slip",
    "options": "Salary Slip",
    "depends_on": "eval:doc.source=='Payroll'",
    "description": "The payslip this instalment came out of. Blank for anything recovered outside payroll."
   },
   {
    "fieldname": "section_amounts",
    "fieldtype": "Section Break",
    "label": "Amounts"
   },
   {
    "fieldname": "amount",
    "fieldtype": "Currency",
    "label": "Amount",
    "reqd": 1,
    "in_list_view": 1
   },
   {
    "fieldname": "principal_amount",
    "fieldtype": "Currency",
    "label": "Principal"
   },
   {
    "fieldname": "column_break_amounts",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "interest_amount",
    "fieldtype": "Currency",
    "label": "Interest"
   },
   {
    "fieldname": "is_manual",
    "fieldtype": "Check",
    "label": "Manual EMI",
    "default": "0",
    "description": "An instalment typed rather than computed — one month at a different amount, without rewriting the schedule under it."
   },
   {
    "fieldname": "section_notes",
    "fieldtype": "Section Break",
    "label": ""
   },
   {
    "fieldname": "remarks",
    "fieldtype": "Small Text",
    "label": "Remarks"
   }
  ],
  "index_web_pages_for_search": 0,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Loan Repayment",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR User",
    "share": 1,
    "write": 1
   },
   {
    "read": 1,
    "role": "Employee"
   }
  ],
  "search_fields": "loan_application,employee,employee_name,repayment_date",
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "title_field": "employee_name",
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 },
 {
  "actions": [],
  "allow_rename": 0,
  "autoname": "naming_series:",
  "engine": "InnoDB",
  "fields": [
   {
    "fieldname": "naming_series",
    "fieldtype": "Select",
    "label": "Series",
    "options": "HR-SRV-.YYYY.-.#####",
    "default": "HR-SRV-.YYYY.-.#####",
    "hidden": 1
   },
   {
    "fieldname": "survey",
    "fieldtype": "Link",
    "label": "Survey",
    "options": "Employee Survey",
    "reqd": 1,
    "in_list_view": 1,
    "in_standard_filter": 1,
    "search_index": 1
   },
   {
    "fieldname": "employee",
    "fieldtype": "Link",
    "label": "Employee",
    "options": "Employee",
    "in_list_view": 1,
    "in_standard_filter": 1,
    "description": "**Left empty on an anonymous survey, deliberately.** Not hidden by a permission — a permission is a promise somebody can change; an empty column is one nobody can."
   },
   {
    "fieldname": "employee_name",
    "fieldtype": "Data",
    "label": "Employee Name",
    "fetch_from": "employee.employee_name",
    "read_only": 1
   },
   {
    "fieldname": "company",
    "fieldtype": "Link",
    "label": "Company",
    "options": "Company",
    "fetch_from": "employee.company",
    "read_only": 1
   },
   {
    "fieldname": "column_break_response",
    "fieldtype": "Column Break"
   },
   {
    "fieldname": "status",
    "fieldtype": "Select",
    "label": "Status",
    "options": "Draft\nSubmitted",
    "default": "Draft",
    "reqd": 1,
    "in_list_view": 1,
    "in_standard_filter": 1
   },
   {
    "fieldname": "submitted_on",
    "fieldtype": "Datetime",
    "label": "Submitted On",
    "read_only": 1
   },
   {
    "fieldname": "section_break_answers",
    "fieldtype": "Section Break",
    "label": "Answers"
   },
   {
    "fieldname": "answers",
    "fieldtype": "Table",
    "label": "Answers",
    "options": "Employee Survey Answer"
   }
  ],
  "index_web_pages_for_search": 0,
  "links": [],
  "module": "Manna HR",
  "name": "Employee Survey Response",
  "permissions": [
   {
    "create": 1,
    "delete": 1,
    "email": 1,
    "export": 1,
    "print": 1,
    "read": 1,
    "report": 1,
    "role": "HR Manager",
    "share": 1,
    "write": 1
   },
   {
    "read": 1,
    "report": 1,
    "export": 1,
    "role": "HR User"
   },
   {
    "create": 1,
    "read": 1,
    "write": 1,
    "role": "Employee"
   }
  ],
  "search_fields": "survey,employee_name,status",
  "sort_field": "modified",
  "sort_order": "DESC",
  "states": [],
  "track_changes": 1,
  "doctype": "DocType",
  "custom": 1
 }
];

(async () => {
	const api = async (path, opts) => {
		const r = await fetch(path, {
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"X-Frappe-CSRF-Token": window.frappe && window.frappe.csrf_token,
			},
			...opts,
		});
		const text = await r.text();
		let json = null;
		try { json = JSON.parse(text); } catch (e) { /* Frappe answers an error with HTML */ }
		return { ok: r.ok, status: r.status, json,
		         text: text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 300) };
	};

	if (!window.frappe || !window.frappe.csrf_token) {
		console.error("Open /app first and stay signed in — this needs the desk's CSRF token.");
		return;
	}

	const list = async (dt, params) => {
		const r = await api(`/api/resource/${encodeURIComponent(dt)}?${new URLSearchParams(params)}`);
		return r.ok ? r.json.data : [];
	};

	const roles = new Set((await list("Role", { fields: '["name"]', limit_page_length: 0 })).map((x) => x.name));
	const modules = new Set((await list("Module Def", { fields: '["name"]', limit_page_length: 500 })).map((x) => x.name));
	const there = new Set((await list("DocType", {
		fields: '["name"]',
		filters: JSON.stringify([["name", "in", DOCTYPES.map((d) => d.name)]]),
		limit_page_length: 0,
	})).map((x) => x.name));

	console.log(`site      ${location.origin}`);
	console.log(`signed in ${frappe.session.user}`);
	console.log(`doctypes  ${DOCTYPES.length} in this app, ${there.size} already on the site`);
	console.log("");

	const done = [];
	for (const spec of DOCTYPES) {
		const doc = JSON.parse(JSON.stringify(spec));

		/* `Manna HR` is a Module Def the app creates when a bench installs it.
		   On a site where it has never been installed it is absent, and `Custom`
		   is where Frappe itself puts a custom doctype. Printed, because which
		   module a doctype is in decides where it shows up on the desk. */
		if (!modules.has(doc.module)) doc.module = "Custom";

		/* A role the site has not got is refused on the way in. Dropping it
		   leaves a doctype only System Manager can reach — a permission to add
		   later rather than a wall — and dropping it silently would read to HR
		   as the save button being broken, so it is said out loud. */
		const want = doc.permissions || [];
		const kept = want.filter((p) => roles.has(p.role));
		const gone = want.filter((p) => !roles.has(p.role)).map((p) => p.role);
		if (!doc.istable && !kept.some((p) => p.create)) {
			kept.push({ role: "System Manager", read: 1, write: 1, create: 1, delete: 1,
			            report: 1, export: 1, print: 1, email: 1, share: 1 });
		}
		doc.permissions = kept;

		const exists = there.has(doc.name);
		if (exists && !UPDATE_EXISTING) {
			console.log(`  skip    ${doc.name.padEnd(42)} already there`);
			done.push({ doctype: doc.name, action: "left alone" });
			continue;
		}

		const r = exists
			? await api(`/api/resource/DocType/${encodeURIComponent(doc.name)}`,
			            { method: "PUT", body: JSON.stringify(doc) })
			: await api("/api/resource/DocType", { method: "POST", body: JSON.stringify(doc) });

		if (r.ok) {
			console.log(`  ${exists ? "updated" : "created"} ${doc.name}${gone.length ? "   (roles dropped: " + gone.join(", ") + ")" : ""}`);
			done.push({ doctype: doc.name, action: exists ? "updated" : "created" });
		} else {
			console.error(`  FAILED  ${doc.name}\n          HTTP ${r.status}: ${r.text}`);
			done.push({ doctype: doc.name, action: `FAILED ${r.status}`, why: r.text });
		}
	}

	console.log("");
	console.table(done);
	console.log("Reload the desk to see them in the sidebar.");
})();
