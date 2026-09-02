/** The four line icons on an employee card, as path data. */
export const EICON = {
  code:  "M3 5h18v14H3zM7 9.5h3.5v3.5H7zM14 10h4M14 14h4",
  role:  "M12 3a3.6 3.6 0 1 0 0 7.2A3.6 3.6 0 0 0 12 3M5 21v-1.2A5.4 5.4 0 0 1 10.4 14h3.2A5.4 5.4 0 0 1 19 19.8V21",
  dept:  "M3 21h18M5 21V4h9v17M14 10h5v11M8 8h3M8 12h3M8 16h3",
  where: "M12 21s6.5-5.7 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.3 12 21 12 21M12 12.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4",
};

/* Factor HR's status filter, dot for dot: green Active, red InActive, blue All.
   A native <select> cannot colour an option, and on this control the colour is
   what gets read — so it is a button and a listbox rather than a dropdown with
   the words alone. The statuses come off the records, so a site that grows a
   fourth one grows a fourth row here without anybody editing this. */
/* Factor HR draws Active and InActive whether or not anybody is in them, and
   so does this: a filter that appears only once somebody has that status is a
   filter nobody knows exists, and *nobody is Inactive* is worth being able to
   ask for and see. Anything else the site holds — Left, Suspended — is appended
   after them, so the control still follows the data rather than a fixed list. */
export const STATUS_ROWS = [["Active","on"],["Inactive","off"]];

/* One person's record, grouped the way Factor HR groups its Employee Detail.
   The directory's list call asks for sixteen fields; this page fetches the
   whole document, so a blank here is blank on the site rather than merely
   unfetched — which is the only thing that makes the page worth having. */
export const DETAIL_GROUPS = [
  ["Identity", "🧍", [["employee_number","Employee code"],["employee_name","Name"],
    ["gender","Gender"],["date_of_birth","Date of birth"],["blood_group","Blood group"],
    ["marital_status","Marital status"]]],
  ["Employment", "🏭", [["company","Company"],["department","Department"],
    ["designation","Designation"],["grade","Grade"],["branch","Branch"],
    ["employment_type","Employment type"],["date_of_joining","Joined"],
    ["status","Status"],["relieving_date","Relieved"]]],
  ["Attendance", "🔑", [["attendance_device_id","Device id"],["default_shift","Default shift"],
    ["holiday_list","Holiday list"],["reports_to","Reports to"]]],
  ["Contact", "☎", [["cell_number","Mobile"],["personal_email","Personal email"],
    ["company_email","Work email"],["current_address","Address"],
    ["person_to_be_contacted","Emergency contact"],["emergency_phone_number","Emergency phone"]]],
  ["Statutory and pay", "🏦", [["pan_number","PAN"],["provident_fund_account","PF account"],
    ["salary_mode","Salary mode"],["bank_name","Bank"],["bank_ac_no","Account"],
    ["ctc","CTC"],["salary_currency","Currency"]]],
];

export const DATEISH = /(date|birth)/;

export const ED_SECTIONS = [
	["category",  "Category Detail",       ["department","designation","grade","branch","employment_type"], ""],
	["pf",        "PF / ESIC Detail",      ["provident_fund_account"], ""],
	["salary",    "Salary Master Detail",  ["ctc","salary_currency","salary_mode"], ""],
	["personal",  "Personal Detail",       ["gender","date_of_birth","blood_group","marital_status","cell_number","personal_email"], ""],
	["skills",    "Skill Set Details",     [], "nochild"],
	["identity",  "Identity Detail",       ["pan_number","passport_number","valid_upto"], ""],
	["bank",      "Bank Detail",           ["salary_mode","bank_name","bank_ac_no","iban"], ""],
	["family",    "Family Detail",         ["person_to_be_contacted","relation","emergency_phone_number"], ""],
	["past",      "Past History",          [], "child"],
	["asjoin",    "Show Categories As Per Joining Date", [], "modifier"],
	["qual",      "Qualification Detail",  [], "child"],
	["nominee",   "Nominee Detail",        [], "nochild"],
	["transfer",  "Transfer / Promotion History", [], "child"],
	["separation","Separation",            ["relieving_date","reason_for_leaving","held_on"], ""],
];

/* The three sections that live in a child table *and* have somewhere to live on
   ERPNext's Employee. A list call cannot reach a child table, which is why they
   are out of reach for a report over everybody — but a report of one person is
   a record, the record has already been read whole, and the rows are sitting in
   it. So these three work the moment Particular Employee is set.

   `skills` and `nominee` are not here on purpose: ERPNext's Employee carries no
   child table for either, so no number of reads would find them. That is a gap
   in the model rather than in the request, and the two are told apart on the
   form. */
export const ED_CHILD = {
	past: ["employee_external_work_history", "Past History", [
		["company_name", "Company"], ["designation", "Designation"], ["salary", "Salary"],
		["total_experience", "Experience"],
	]],
	qual: ["employee_education", "Qualification Detail", [
		["school_univ", "Institute"], ["qualification", "Qualification"], ["level", "Level"],
		["year_of_passing", "Year"], ["class_per", "Score"],
	]],
	transfer: ["employee_internal_work_history", "Transfer / Promotion History", [
		["branch", "Branch"], ["department", "Department"], ["designation", "Designation"],
		["from_date", "From"], ["to_date", "To"],
	]],
};

export const ED_WHY = {
	child: "Lives in a child table on the record, so it cannot come from a list call — one document read per person, 161 requests for one report. It worked while this page drew the whole record underneath the form; that view was removed on 31 August 2026 to leave the criteria screen alone, so there is nowhere for these rows to land until Generate Report can carry them.",
	nochild: "Factor HR carries this section; ERPNext's Employee has no child table for it at all, so no number of reads would find it. A gap in the model rather than in the request — it has to be built before it can be reported.",
	modifier: "A modifier on Category Detail rather than a section of its own, and it only means anything once categories are dated.",
};
// Always in the export, ticked or not: a row nobody can identify is not a row.

export const ED_BASE = ["name","employee_number","employee_name","company","status","date_of_joining"];

export const ED_STATUSES = ["Active","Inactive","Suspended","Left"];

/* Prettifying the fieldname is right for most of them and wrong for the few
   that are an acronym, or that would read as something else — `name` holds
   the record id, and a column headed Name beside Employee Name is a column
   nobody can read. */
export const FIELD_LABEL = {name:"Record ID", employee_number:"Employee Code", ctc:"CTC",
	pan_number:"PAN", iban:"IBAN", bank_ac_no:"Bank Account",
	provident_fund_account:"PF Account", valid_upto:"Passport Valid Upto"};

export const DATE_FIELD = /(date|dob|valid_upto|held_on)/;

/* ---------------------------------------------------------------------------
   Create Employee — Factor HR's three-step wizard, drawn in
   features/employees/CreateEmployee.jsx.

   **Step 1 is a copy.** Basic Details was screenshotted on 2 September 2026 and
   is reproduced field for field and in its order, red stars included. Steps 2
   and 3 have only been seen as circles on their stepper — the pages behind them
   have not been opened — so what is under those two headings here is *this
   site's* answer to the heading rather than a copy of theirs. That is said on
   the page as well, because a guess presented as a comparison is the one thing
   this repo's screen copies are not allowed to be.

   Every row is a real field on the ERPNext `Employee` doctype, because this
   form's output is one — the exceptions carry an empty `name` and are listed in
   NEW_EMP_NOFIELD with the reason. A control that collects something nothing
   can store is worse than no control.

   A step is a list of **groups**, and a group is a heading and its rows. Step 1
   has one group with no heading, because their screenshot has none — the step
   title is the heading there. Steps 2 and 3 have four each, because twelve
   boxes in a column with nothing dividing them is a form people fill in wrongly
   and a page nobody can scan.

   Step shape:  [key, title, [ [heading, [row, …]], … ] ]
   Row shape:   [fieldname, label, type, required, options-key, span]

     fieldname  what it is called on Employee, or "" when there is no field
     type       text | date | number | select | email | tel | check
     required   1 when the wizard refuses to move on without it. Emp Code,
                First Name, Gender and Date Of Birth carry Factor HR's own red
                star; Date Of Joining, Company and Status carry ERPNext's —
                hrms refuses the document without them, and finding that out
                from a 417 at the end of a three-step form is a cruel way to
                learn it.
     options    which list fills a select. See optionsFor() in CreateEmployee.jsx —
                several are read off the employees already loaded rather than
                off a master, because the masters behind them are not on the
                proxy's allowlist and a list invented here would be a lie.
     span       how many of the grid's 24 columns the field takes.

   **The spans on step 1 are measured off the screenshot**, not chosen. Their
   first row is a wide Emp Code and Machine Code, a *narrow* Title, and a
   medium First Name — 358px, 358px, 110px, 230px across 1090px of form. Those
   are 8, 8, 3 and 5 twenty-fourths, which is why the grid has 24 columns rather
   than the 12 that would otherwise do: a Title box as wide as a name box is the
   single most obvious way a copy of this screen stops looking like it.

   Steps 2 and 3 are not measured off anything, so they are three to a row —
   eight columns each — and a layout that looked more deliberate than that would
   be claiming a precision this does not have.

   **Every fieldname below was probed against the live site on 2 September 2026**
   by asking for it in a list read, the way api/load.js already does: a field the
   doctype does not have answers 417 rather than a blank column. That is how
   `custom_work_location` came off this list — it is read in data/profile.js and
   the site does not have it. A box wired to a field that is not there does not
   fail, it discards.
   --------------------------------------------------------------------------- */
export const NEW_EMP_STEPS = [
	["basic", "Basic Details", [
		["", [
			["employee_number",      "Emp Code",       "text",   1, "",           8],
			["attendance_device_id", "Machine Code",   "text",   0, "",           8],
			["salutation",           "Title",          "select", 0, "salutation", 3],
			["first_name",           "First Name",     "text",   1, "",           5],
			["middle_name",          "Middle Name",    "text",   0, "",           8],
			["last_name",            "Last Name",      "text",   0, "",           8],
			["gender",               "Gender",         "select", 1, "gender",     8],
			["date_of_birth",        "Date Of Birth",  "date",   1, "",           8],
			["",                     "Short Name",     "text",   0, "",           8],
		]],
	]],

	/* Job Details — the terms of the job, and nothing about where it sits in the
	   group, which is step 3. The split is worth keeping to: these are the fields
	   HR fills in off the appointment letter, and those are the ones filled in off
	   the org chart, and they are usually two different conversations. */
	["job", "Job Details", [
		["The appointment", [
			["date_of_joining", "Date Of Joining", "date",   1, "",                8],
			["employment_type", "Employment Type", "select", 0, "employment_type", 8],
			["grade",           "Grade",           "select", 0, "grade",           8],
		]],
		["Probation and confirmation", [
			["scheduled_confirmation_date", "Confirmation Due",  "date",   0, "",       8],
			["final_confirmation_date",     "Confirmation Date", "date",   0, "",       8],
			["status",                      "Status",            "select", 1, "status", 8],
		]],
		/* Filled in at the start for a fixed-term hire and empty for everybody
		   else. Here rather than on a later screen because a contract that ends is
		   a thing somebody has to know about on day one. */
		["How it ends", [
			["contract_end_date",     "Contract End Date",  "date",   0, "", 8],
			["notice_number_of_days", "Notice (Days)",      "number", 0, "", 8],
			["date_of_retirement",    "Date Of Retirement", "date",   0, "", 8],
		]],
		["Reach", [
			["cell_number",    "Mobile Number",  "tel",   0, "", 8],
			["company_email",  "Company Email",  "email", 0, "", 8],
			["personal_email", "Personal Email", "email", 0, "", 8],
		]],
	]],

	/* Job Organization — where this person sits, who answers for them, and how
	   their punches will be judged. The last two groups are what this whole repo
	   is about: a joiner created without a shift is a joiner nothing generates
	   attendance for, and that is not visible until payroll. */
	["org", "Job Organization", [
		["Where in the group", [
			["company",    "Company",    "select", 1, "company",    8],
			["branch",     "Branch",     "select", 0, "branch",     8],
			["department", "Department", "select", 0, "department", 8],
		]],
		["Role and reporting", [
			["designation",    "Designation",       "select", 0, "designation", 8],
			["reports_to",     "Reporting Manager", "select", 0, "reports_to",  8],
			["leave_approver", "Approving Manager", "text",   0, "",            8],
		]],
		/* Two to a row rather than three. There is no third field to put beside
		   them — Machine Code is on step 1, where their screenshot puts it — and a
		   two-thirds row with a hole in it reads worse than two wide boxes. */
		["How their attendance is judged", [
			["default_shift", "Default Shift", "select", 0, "shift",   12],
			["holiday_list",  "Holiday List",  "select", 0, "holiday", 12],
		]],
		["Punching from a phone", [
			["custom_allow_remote_punch", "Punch From Anywhere", "check", 0, "", 24],
		]],
	]],
];

/* A control on their form with nothing behind it here. Drawn anyway — the form
   is a comparison as well as a form, and a field quietly dropped is a field
   nobody ever argues about — but it is disabled and it says why, so nothing is
   typed into a box whose contents go nowhere. Keyed by label, because the
   fieldname is exactly what these do not have. */
export const NEW_EMP_NOFIELD = {
	"Short Name": "No field on ERPNext's Employee, standard or backfilled. `employee_name` is derived "
		+ "from the three name fields and is not a short name. Nothing here would store it, so nothing "
		+ "here collects it.",
};

/* What a field means, when it is not simply a box to fill in — a trap, or a
   consequence somebody should know about before leaving it empty. Keyed by
   label for the same reason NEW_EMP_NOFIELD is.

   **These are tooltips on the label, not text on the page.** They were printed
   under the box and it turned a form somebody fills in twice a month into a
   page of grey reading; the sentences that earn their place are the ones a
   person goes looking for, not the ones sitting there on every visit. Hovering
   the label gets them.

   Still deliberately not on every field. Each of these is either a field that
   decides something downstream, or a field that is not quite what its label
   says. */
export const NEW_EMP_HINT = {
	"Machine Code": "The fingerprint machine's enrolment number, and the join between a punch and a "
		+ "person. Left empty, this person can only punch from a phone.",
	"Status": "Active is what a new hire is. Anything else here is a record being back-filled.",
	"Confirmation Date": "ERPNext's own field, which this writes. The 25 August backfill put Factor "
		+ "HR's value in a second one, custom_confirmation_date, and that column is history — this "
		+ "form leaves it alone.",
	"Reporting Manager": "Approvals route on this. Left empty, this person's requests reach nobody.",
	"Approving Manager": "ERPNext holds this as a User rather than an Employee, so it is a login — "
		+ "usually an email address — and not the name in the box beside it.",
	"Default Shift": "What decides whether a punch is late, and which day a night shift belongs to. "
		+ "Left empty, nothing generates attendance for this person.",
	"Punch From Anywhere": "Lets this person punch from a phone, geofenced. Off is the safe default: "
		+ "a device id that does not start with the trusted prefix is treated as a mobile punch.",
};

export const NEW_EMP_COPIED = new Set(["basic"]);

/* ---------------------------------------------------------------------------
   The caret on Add New Employee — Factor HR's own split button, screenshotted
   2 September 2026. Three items: File Import, Week-Off Import, Picture Import.

   Their three, drawn in their order, and each one answered honestly rather than
   copied and left inert. An import is a bulk write, and bulk writes on this
   dashboard happen on the site: `target` says which desk route the item opens,
   and an empty `target` is an item this site has nowhere to send — drawn
   disabled, with `why` on it, because a menu entry that silently does nothing
   is worse than one that says what is missing.

   Row shape: [label, icon, target, why]

     target   "import"  ERPNext's Data Import wizard
              "holiday" the Holiday List master
              ""        nothing here does this; the item is dead and says so
   --------------------------------------------------------------------------- */
export const EMP_IMPORTS = [
	["File Import", "up", "import",
		"ERPNext's Data Import, which is what File Import is here: a spreadsheet in, Employee records "
		+ "out, with a preview and an error report of its own. It writes on the site, under the site's "
		+ "validation."],
	/* Their week-off is a column on a person. Here it is not — a week-off comes
	   off the Holiday List somebody is pointed at, so what there is to import is
	   lists, and the per-person half is one column on the File Import above.
	   Said on the item rather than quietly opening a different screen. */
	["Week-Off Import", "up", "holiday",
		"A week-off is a Holiday List on this site rather than a column on a person, so this opens the "
		+ "lists. To set which list somebody follows, use File Import with a holiday_list column."],
	/* No bulk path, and no honest way to fake one. */
	["Picture Import", "pic", "",
		"No bulk path on this site. Employee.image is one attachment per record, so a control here "
		+ "that looked like it took a folder of photos would take none."],
];

/** The two line icons the import menu uses, as path data — an upload arrow and
    a picture. Kept beside EICON at the top of this file's job: one place where
    a stroke path is a stroke path. */
export const IMPORT_ICON = {
	up:  "M12 15V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
	pic: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M9 10a1.3 1.3 0 1 0 0-2.6A1.3 1.3 0 0 0 9 10",
};
