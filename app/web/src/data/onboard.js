import { tidyDept } from "@/lib/format";

/* Factor HR's merge tokens, resolved case-insensitively.
   118 distinct tokens across 17 templates, and the same field appears as
   EmployeeName, employeename and EMPLOYEENAME - so the key is lowercased and
   stripped of spaces, dots and underscores, and case is re-applied on output. */
export const TOKENS = {
  employeename:e=>e.employee_name, employeefullname:e=>e.employee_name,
  empcode:e=>e.employee_number, employeecode:e=>e.employee_number,
  designation:e=>e.designation, department:e=>tidyDept(e.department), branch:e=>e.branch,
  doj:e=>e.date_of_joining, dateofjoining:e=>e.date_of_joining, pastdateofjoining:e=>e.date_of_joining,
  dol:e=>e.relieving_date, dateofleaving:e=>e.relieving_date,
  dateofbirth:e=>e.date_of_birth, gender:e=>e.gender,
  nationality:e=>e.custom_nationality, maritalstatus:e=>e.marital_status,
  fathername:e=>e.custom_father_name, employeesfathername:e=>e.custom_father_name,
  employeefathername:e=>e.custom_father_name,
  employeespousename:e=>e.custom_spouse_name, employeesreligion:e=>e.custom_religion,
  employeeaddress:e=>e.current_address||e.permanent_address,
  employeepermanentaddress:e=>e.permanent_address,
  mobileno:e=>e.cell_number, mobile:e=>e.cell_number, employeemobileno:e=>e.cell_number,
  email:e=>e.company_email||e.personal_email, employeeemail:e=>e.company_email||e.personal_email,
  employeepanno:e=>e.custom_pan_no, employeeidentitypanno:e=>e.custom_pan_no,
  employeebankname:e=>e.bank_name, employeebankaccountno:e=>e.bank_ac_no,
  passportno:e=>e.passport_number,
  companyname:e=>e.company, company:e=>e.company,
  grosssalary:e=>e.ctc, currencysymbol:()=>"₹", currencytitle:()=>"Rupees",
  employeetitle:e=>(e.gender==="Female"?"Ms.":"Mr."), title:e=>(e.gender==="Female"?"Ms.":"Mr."),
  hisher:e=>(e.gender==="Female"?"Her":"His"),
  currentdate:()=>new Date().toISOString().slice(0,10),
};

/* Factor HR's last menu item. Read here as the module index: every On Board
   page, what stands behind it, and what is still a question — which is the
   view somebody comparing the two systems actually wants, and the one that
   makes an empty page an answer rather than a hole. */
export const ONBOARD_PAGES = [
  ["Candidate Master",     "candidates", "Job Applicant &rarr; Employee Onboarding", "skip",
   "Empty on both sides. Stock ERPNext if recruitment ever moves across"],
  ["Create Letter / Form", "overview",   "Letter Type + Employee Letter",            "live",
   "15 of 17 formats loaded, merging against live employee records"],
  ["Document Entry",       "documents",  "Employee fields only",                     "none",
   "No doctype. Expiry tracking is the one part ERPNext has no answer for"],
  ["Assets Details",       "assets",     "ERPNext Asset + Asset Category",           "part",
   "Installed and empty. Configuration and a data load, not code"],
  ["Assets Assignment",    "assignment", "Asset custodian + Asset Movement",         "part",
   "Stock, minus the signed handover and the recovery on separation"],
];

/* Factor HR's dashboard panels that are switched on and unused, in the state
   read on 23 Aug 2026. Kept rather than dropped, because "it exists there and
   is empty" is the finding that makes them safe to leave out — and that
   argument disappears if the panels simply vanish from the comparison. */
export const ENGAGEMENT = [
  ["Mood Analysis",    "empty"],
  ["CEO Speak",        "0"],
  ["Announcements",    "0"],
  ["Wish Celebration", "0 — birthdays, work anniversaries, marriages"],
  ["Important Files",  "0"],
  ["Help Desk",        "3 tickets, all Open · 0 resolved, 0 re-opened"],
];

/* The document fields ERPNext ships on Employee, which is all Document Entry
   has to stand on until a doctype of its own exists. Counted live, because
   "the field exists" and "the field is filled" are different findings and only
   the second one decides whether expiry tracking can be switched on. */
export const EMP_DOC_FIELDS = [
  ["passport_number", "Passport number"],
  ["valid_upto",      "Passport valid upto"],
  ["date_of_issue",   "Date of issue"],
  ["place_of_issue",  "Place of issue"],
];

/* Read off Factor HR's export on 25 Aug 2026 and backfilled into Employee.
   Fixed rather than queried only when the live read comes back without the
   custom fields — see loadOnBoard. */
export const DOC_BACKFILL = [
  ["custom_nationality",       "Nationality",       126],
  ["custom_confirmation_date", "Confirmation date",  72],
  ["custom_pan_no",            "PAN number",          2],
  ["custom_father_name",       "Father&rsquo;s name", 0],
  ["custom_mother_name",       "Mother&rsquo;s name", 0],
  ["custom_spouse_name",       "Spouse&rsquo;s name", 0],
  ["custom_religion",          "Religion",            0],
];
