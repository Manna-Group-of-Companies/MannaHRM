import { clock, dayOf, dmy, dmyTime, spanOf, tidyDept } from "@/lib/format";
/* Factor HR's Quick Reports — the exports that exist without asking support.
   Tagged by whether the file is already in hand, because that is the only thing
   deciding whether a report is a task or a footnote. */
export const FH_REPORTS = [
  ["Daily Detail Attendance",        "attendance", "have", "already supplied"],
  ["In-Out Activity",                "attendance", "have", "already supplied"],
  ["Employee Detail",                "attendance", "have", "already supplied, 504 rows"],
  ["Leave Balance Report",           "leave",      "want", "opening balances — blocks D3"],
  ["Salary Register Report",         "payroll",    "want", "salary structures — E1"],
  ["Salary Pay-slip Report",         "payroll",    "want", "three months of test payslips — E3"],
  ["ECR File",                       "payroll",    "bg",   "EPFO return; confirms PF is live"],
  ["IncomeTax Computation Register", "payroll",    "bg",   "TDS"],
  ["Employee Earnings Report",       "payroll",    "bg",   ""],
];

/* The Leave Balance Report as read on 23 Aug 2026. Fixed rather than queried:
   no leave type on our side has an entitlement, so there is nothing to query.
   This is the target to reconcile against, not a live figure. */
export const FH_LEAVE = [
  ["Casual Leave",       73,  551.0,  325.5, 179.0],
  ["Leave Without Pay",   0,    0.0, 1300.5,   0.0],
  ["Company Purpose",     0,    0.0,    0.0,   0.0],
  ["Maternity Leave",     0,    0.0,    0.0,   0.0],
  ["Privilege Leave",     0,    0.0,    0.0,   0.0],
  ["Sick Leave",          0,    0.0,    0.0,   0.0],
];
/* ------------------------------------------- Attendance: the new pages --- */

/* Submit Attendance — Factor HR's monthly freeze. HR generates and saves the
   month, payroll runs from that saved copy, and it cannot be deleted once
   salary has been processed. Frappe HR has no equivalent gate at all.

   So this page is a readiness check rather than a button: it says what would
   have to be true before a month could honestly be closed, against live
   numbers. A Submit that could be pressed today would freeze nothing. */
/* Factor HR's Daily Detail Attendance Report panel, photographed 28 Aug 2026:
   the title, one row of labelled controls — Particular Employee, Employee
   Status, Filter By, Report Period, an Excel split button, refresh, and
   Generate — then two tabs, Report Criteria and Advance, holding a date range,
   layout-option chips and an Additional Filters funnel.

   Two things about it are copied on purpose. **Nothing is listed until Generate
   is pressed**, as on their screen and on CTC / Earnings: a report that runs on
   open is a report nobody chose the filters for. And **the status filter appears
   twice** — the coloured dot beside the search box and the Employee Status
   select — so both are bound to one value here. Whether their dot means
   something else on this screen is unknown; nobody has opened it. */

/* Photographed 29 August 2026 with the menu open: two entries, and no more.
   Date Wise is one row per person per day; Month Wise rolls those same days up
   into one row per person per month. */
export const DDA_PERIODS = [["date","Date Wise"],["month","Month Wise"]];

/* Their Advance tab, photographed 29 August 2026. Four controls, and what each
   can honestly do here is decided one at a time — see DailyDetail.jsx, where
   the two that cannot answer say so rather than filtering to nothing. */

/** Group By offers *categories*, not fields — Factor HR's `Category Type`
    master, the same rows that sit behind the Categories screen. Each is
    `[id, label, the Employee field it reads onto, why it cannot group here]`.

    Three of the five seen read onto a field and can section a report. The other
    two are pay treatment rather than groupings and have no field on our side at
    all; they are listed anyway, because a category dropped from the list is a
    gap nobody can see, and one picked here says why instead of quietly grouping
    everybody into one section.

    Both the Daily Detail and the In / Out report carry this control on their
    Advance tab, so it is one list. */
export const CAT_GROUP_BY = [
	["", "Select Category", "", ""],
	["company", "Company Name", "company", ""],
	["department", "Department", "department", ""],
	["designation", "Designation", "designation", ""],
	["gratuity", "Gratuity Applicable", "", "Gratuity Applicable is a category over there and a <b>rule</b> here: hrms carries gratuity as a Gratuity Rule plus a payroll component, and <code>Employee</code> has no such flag to group by. Nothing to section the report on until that rule is written."],
	["lwf", "LWF Applicable", "", "LWF is a state levy, and ERPNext handles it as a salary component with a condition rather than as a flag on the person. There is no field on <code>Employee</code> to group by, and one group-wide deduction would be wrong for somebody the moment two companies sit in two states."],
];

/** What Show Categories appends, in the order it appends them. The label on
    their screen is a count and the field held 0, so the reading here is: show
    that many category columns. Three is all this site can fill — the rest of
    their Category Type master is pay treatment with no field behind it — and
    the number is capped at what can be answered rather than padding the table
    with dashes. One screenshot of it set above zero would settle it.

    A report that already carries one of these as a column of its own does not
    repeat it; each builds its own accessors, because their rows are different
    shapes. */
export const CAT_FIELDS = [["Company", "company"], ["Department", "department"], ["Designation", "designation"]];

/** Show Categories on the Daily Detail report, whose rows carry the employee. */
export const DDA_CAT_COLS = CAT_FIELDS.map(([head, field]) => [
	head,
	r => (field === "department" ? tidyDept(r.emp.department) : r.emp[field]) || "—",
	"muted",
]);

/** Punch Type, read as a property of the *day* rather than of the person,
    because that is the only reading this site can answer: the holiday list
    says which days a punch was expected. The fourth needs a per-person or
    per-shift flag saying one punch is enough, and nothing here holds one. */
export const DDA_PUNCH_TYPES = [
	["", "All"],
	["req", "Attendance Punch Required"],
	["not", "Attendance Punch Not Required"],
	["single", "Attendance Single Punch Required"],
];

/** The month-wise columns. Not the day columns with a total bolted on: a
    roll-up answers different questions, and the five day columns that are
    dashes for everybody would be five dashes here too.

    Working Days is a calendar fact — days in the range that are neither a
    weekly off nor a holiday. It is emphatically not payable days, which is an
    output of the policy engine and of leave. */
export const DDA_MONTH_COLS = [
	["Emp Code",      r => r.emp.employee_number||"—", "mono"],
	["Employee",      r => r.emp.employee_name||"",          ""],
	["Month",         r => r.label,                          ""],
	["Days",          r => r.days,                           "mono"],
	["Weekly Off",    r => r.off,                            "mono"],
	["Holidays",      r => r.hol,                            "mono"],
	["Working Days",  r => r.working,                        "mono"],
	["Days Punched",  r => r.punched,                        "mono"],
	["Work Duration", r => r.work||"—",                "mono"],
	["Late Coming By",() => "—",                       "mono"],
	["Early Going By",() => "—",                       "mono"],
	["Overtime",      () => "—",                       "mono"],
];

export const DDA_LAYOUT = [["group","Show Employee Grouping"],["logo","With Logo"]];

/* The report's own columns, in Factor HR's order. The fourth entry is what
   fills it here — and five of the fourteen are filled by nothing, which is the
   argument this page exists to make: each is a rule about somebody's pay, not
   a query. */
/**
 * One generated line of the report: a person, a day, and what the punches made
 * of it.
 * @typedef {Object} DdaRow
 * @property {import("@/lib/types").Employee} emp
 * @property {string} date
 * @property {string|null} in
 * @property {string|null} out
 * @property {string|null} work
 * @property {string} status
 */

export const DDA_COLS = [
  ["Emp Code",       r => r.emp.employee_number||"—",  "mono"],
  ["Employee",       r => r.emp.employee_name||"",     ""],
  ["Date",           r => dmy(r.date),                 "mono"],
  ["Day",            r => dayOf(r.date),               "muted"],
  ["Shift",          r => r.emp.default_shift||"—",    ""],
  ["In",             r => r.in||"—",                   "mono"],
  ["Out",            r => r.out||"—",                  "mono"],
  ["Work Duration",  r => r.work||"—",                 "mono"],
  ["Late Coming By", () => "—",                         "mono"],
  ["Early Going By", () => "—",                         "mono"],
  ["Overtime",       () => "—",                         "mono"],
  ["Break",          () => "—",                         "mono"],
  ["Personal Break", () => "—",                         "mono"],
  ["Day Status",     r => r.status,                    ""],
];

export const MB_LAYOUT = [["logo","With Logo"], ["shift","Show Shift Code"]];
/* Every status ERPNext's Attendance can hold, in the one or two letters a
   muster grid has room for. Anything unrecognised falls through to its own
   first letter rather than being dropped, because a cell that silently empties
   is a day somebody is not paid for. */
export const MB_LETTER = {"Present":"P", "Absent":"A", "Half Day":"HD", "On Leave":"L",
                   "Work From Home":"WFH", "Holiday":"H"};

export const MB_PAID = {P:1, HD:0.5, L:1, H:1, WFH:1, WO:1};

export const SR_OUTPUTS = ["Excel","PDF","On screen"];

export const SR_BY = [["","(none)"],["company","Company"],["department","Department"],
               ["designation","Designation"],["grade","Grade"],["branch","Branch"]];

/* The columns any monthly statutory return needs, and where each one would come
   from here. Nothing on this list is a guess about *their* report — it is what
   our site can and cannot put behind a return, which is the question a
   readiness check exists to answer. */
export const SR_COLS = [
  ["Emp code",    "code", e => e.employee_number||e.name, ""],
  ["Name",        "have", e => e.employee_name||"", ""],
  ["Date of joining","have", e => e.date_of_joining||"—", ""],
  ["Company",     "have", e => e.company||"—", ""],
  ["Department",  "have", e => tidyDept(e.department), ""],
  ["Status",      "have", e => e.status||"—", ""],
  ["PF account / UAN","pf", null, "not on this site"],
  ["PAN",         "pan",  null, "PANNOTAVBL for 502 of 504"],
  ["Days paid",   "gap",  null, "0 Attendance rows"],
  ["Gross",       "gap",  null, "payroll not started"],
  ["Employee PF", "gap",  null, "payroll not started"],
  ["Employer PF / ESI","gap", null, "payroll not started"],
];

/**
 * One row of their SHIFT & WORK PATTERN table. `cat` and `emp` are null on the
 * row their capture clipped.
 * @typedef {Object} ShiftRow
 * @property {string} name
 * @property {number|null} cat
 * @property {number|null} emp
 * @property {boolean} [clipped]
 */

/** @type {ShiftRow[]} */
export const FH_SHIFT_ROWS = [
  {name:"Hi-Tech Pretreads-Accountant",                cat:0,  emp:0},
  {name:"Hi-Tech Pretreads-Cook shift",                cat:1,  emp:0},
  {name:"Hi-Tech Pretreads-House Keeping",             cat:0,  emp:0},
  {name:"Hi-Tech Pretreads-Office shift",              cat:9,  emp:0},
  {name:"Hi-Tech Pretreads-Other location",            cat:8,  emp:0},
  {name:"Hi-Tech Pretreads-Production shift-12Hrs-1",  cat:12, emp:0},
  {name:"Hi-Tech Pretreads-Production shift-12Hrs-2",  cat:null, emp:null, clipped:true},
];
/* Their own list length is off the bottom of the capture, so this page says
   "at least" and never a total. */

export const FH_SHIFT_SEEN = FH_SHIFT_ROWS.length;
/* Today's punches, newest last, for whichever company is selected up top.
   Employee Checkin is one table for both streams, which is why this list needs
   no union and no flag: a punch is a punch, and where it came from is a
   column. */

export const IO_PERIODS = ["Date Wise","Employee Wise"];

export const IO_BY = [["","(none)"],["company","Company"],["department","Department"],
               ["designation","Designation"],["grade","Grade"],["branch","Branch"]];

export const IO_MAXDAYS = 92;

/** Their export menu, photographed 28 August 2026 on the In / Out report and
    again on Daily Detail: PDF, Excel, Word, Print, Preview, in that order. One
    list, because it is one menu wearing two hats — a format that behaved
    differently on two reports of the same site would be a bug wearing a
    feature's clothes. Each row is [name, glyph, what it actually does],
    and the third field is the tooltip because four of the five are not quite
    what the word on them promises. There is no PDF writer and no Word writer
    in this browser and there is not going to be one for a table: what there is
    is one HTML document and the two things the platform already knows how to
    do with it. */
export const EXPORT_FORMATS = [
	["PDF", "📄", "the print dialog, with Save as PDF as the destination"],
	["Excel", "📊", "a CSV — what Excel opens without a library shipped to the browser"],
	["Word", "📝", "an HTML document Word opens and edits, the way its own Save as Web Page writes one"],
	["Print", "🖨", "straight to the print dialog, landscape A4"],
	["Preview", "🔍", "the same document on screen first, before it goes anywhere"],
];

/** Twelve columns, four of which cannot be filled — `Original In` / `Original
    Out` are the punch, which the request does not carry, and `Day Status` /
    `AR Hours` are outputs of the policy engine. */
export const FH_REG_COLS = [
  ["Original In",   () => "—",                          "the punch, which this request does not carry"],
  ["Original Out",  () => "—",                          "same"],
  ["AR In",         r => clock(r.requested_in),          ""],
  ["AR Out",        r => clock(r.requested_out),         ""],
  ["AR Hours",      r => spanOf(r.requested_in,r.requested_out)||"—", "computed, not stored"],
  ["Day Status",    () => "—",                          "an output of the attendance policy engine"],
  ["Reason",        r => r.reason||"—",                ""],
  ["Remarks",       r => r.remarks||r.decision_note||"—", ""],
  ["Initiated By",  r => r.owner||"—",                 ""],
  ["Current Status",r => r.status||"—",                ""],
  ["Last Action By",r => r.decided_by||r.modified_by||"—", ""],
  ["Last Action On",r => dmyTime(r.decided_on||r.modified||r.creation), ""],
];