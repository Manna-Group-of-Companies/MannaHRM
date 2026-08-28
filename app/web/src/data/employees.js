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
	["skills",    "Skill Set Details",     [], "child"],
	["identity",  "Identity Detail",       ["pan_number","passport_number","valid_upto"], ""],
	["bank",      "Bank Detail",           ["salary_mode","bank_name","bank_ac_no","iban"], ""],
	["family",    "Family Detail",         ["person_to_be_contacted","relation","emergency_phone_number"], ""],
	["past",      "Past History",          [], "child"],
	["asjoin",    "Show Categories As Per Joining Date", [], "modifier"],
	["qual",      "Qualification Detail",  [], "child"],
	["nominee",   "Nominee Detail",        [], "child"],
	["transfer",  "Transfer / Promotion History", [], "child"],
	["separation","Separation",            ["relieving_date","reason_for_leaving","held_on"], ""],
];

export const ED_WHY = {
	child: "Lives in a child table on the record, so it cannot come from a list call — one document read per person, 161 requests for one report.",
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
