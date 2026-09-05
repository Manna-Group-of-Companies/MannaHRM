import { MONTHS, dmy, fmt, tidyDept, todayIso } from "@/lib/format";

/* The Salary Register's columns, which are also the shape of the E1 export.
   Listed so the two can be compared column for column when the file lands. */
export const REGISTER_COLS = [
  ["Employee, name, department, designation", "Who", "stock", ""],
  ["Branch, company", "Where", "stock",
   "The company column is the one that matters here &mdash; four of them, and one in another country"],
  ["Payment days, leave without pay", "How much of the month was worked", "stock",
   "<b>This column is attendance.</b> Everything to the right of it is arithmetic on it"],
  ["One column per earning component", "Basic, DA, HRA, allowances", "stock", "The widths come from E1"],
  ["Gross pay", "The sum of the earnings", "stock", ""],
  ["One column per deduction", "PF, ESI, PT, TDS, advances", "stock", ""],
  ["Total deduction, net pay", "What reaches the bank", "stock", ""],
  ["Employer contributions", "PF and ESI employer share", "stock",
   "There if they are set up as components. Factor HR&rsquo;s register carries them; a structure that omits them will not"],
];


/* ---------------------------------------------------------------------------
   ADHOC PAYMENTS/DEDUCTIONS, photographed 29 August 2026.

   Their screen is a title bar with six icons on its right edge, one bar of five
   filters, and a table of four columns — DESCRIPTION, EARNING, DEDUCTION,
   REFERENCE / REMARKS — whose rows are salary components with the two amount
   cells left blank. So it is not a list of payments already made: **it is the
   component list, and somebody types an amount against a person into it.**

   That is the finding worth carrying, because it is not the shape of the
   doctype that would stand behind it. `Additional Salary` is one document per
   person per component per date. Their one screenful is our N documents, and
   any import written against E1 has to unfold it that way round.
   --------------------------------------------------------------------------- */

/** The five filters on their bar, in their order, with what was actually in
    each. Only PAYMENT PROCESS carried a value; none of the four lists has been
    opened, so what else they offer is unknown and is left unknown. */
export const FH_ADHOC_FILTERS = [
  ["Year", "",
   "Which payroll year the amount belongs to. Additional Salary has no year on it — it has one "
   + "payroll_date, and the year falls out of that. Empty in the capture and never opened."],
  ["Payment Process", "Salary",
   "The one value seen in any of these four lists. Whether it offers anything besides Salary is "
   + "unknown — their list has not been opened, and nothing is invented in its place."],
  ["Payroll Type", "",
   "Empty in the capture and never opened. Nothing is invented in its place."],
  ["Day", "",
   "Empty in the capture and never opened. The nearest thing here is payroll_date, which is a date "
   + "rather than a day of the month."],
];

/* The rows, read off the capture in the order they appear.

   `head` is the one outer heading. `n` is the number in the left-hand gutter —
   REGULAR EARNING carries a 1 and nothing else carries anything, and **why is
   not resolvable from the capture**: it sits at the same indent as the four
   component rows but is drawn bold and in their link blue, so it is either a
   second heading or a numbered row. It is drawn as what it looks like and said
   to be unresolved, rather than promoted to a heading it may not be.

   `map` is what would stand behind the row on our side and `why` is the reason,
   and both are read in a tooltip — so they are plain text, no markup.

   The capture is cropped below LEAVE TRAVEL ALLOWANCE, so this list has no end
   and this page never states a total. */
export const FH_ADHOC_ROWS = [
  { head: "CTC Wise Input" },
  { desc: "GRATUITY AMOUNT MANUAL", map: "Gratuity",
    why: "Gratuity is a statutory payment on leaving, not a monthly adhoc line. Frappe HR computes it "
       + "from a Gratuity Rule and the length of service; “manual” here says theirs does not." },
  { desc: "HEALTH INSURANCE CTC", map: "Salary Component",
    why: "Employer cost carried in the CTC rather than money that reaches a bank account — a "
       + "component in the structure with Do Not Include in Total, not an Additional Salary." },
  { desc: "REGULAR EARNING", n: 1, blue: true },
  { desc: "FOOD ALLOWANCE", map: "Additional Salary",
    why: "One-off or recurring, against an Earning component. This is the row the whole screen is for." },
  { desc: "LEAVE TRAVEL ALLOWANCE", map: "Additional Salary",
    why: "Paid as an Additional Salary, but the exemption against it is claimed on Employee Tax "
       + "Exemption Declaration — two doctypes here for one line there." },
];

/** Their list runs on past the bottom of the capture. Said out loud wherever a
    count of these rows is drawn, so it can never read as a total. */
export const FH_ADHOC_CLIPPED = true;


/* ---------------------------------------------------------------------------
   SALARY PAYSLIP, photographed 29 August 2026.

   Their screen is the report chrome the attendance and leave reports already
   carry — Particular Employee with its status dot, Employee Status, Filter By,
   an import arrow, refresh and a Generate split button — plus one control none
   of the others has: PERIOD TYPE. Then two tabs, BASIC and ADVANCE, where the
   others say Report Criteria and Advance.

   BASIC holds six controls and three checkboxes: Payroll Type, Year, Report
   Output, Month, Payslip Format, and then *Generate report for employees
   without email*, *Include Zero Value Employees* (ticked) and *Include IT
   Statement*.

   **The three checkboxes are the finding, not the six dropdowns.** Every one of
   them is about delivery rather than arithmetic: who gets a document, whether a
   person with nothing to pay still gets one, and whether the tax sheet rides
   along. Factor HR is not only computing payroll here, it is mailing 160 people
   a PDF each month — which is the part of E1 nobody has costed. See the note on
   PSL_FLAGS below.

   ADVANCE was not opened, so what is on it is unknown and nothing is invented
   in its place.
   --------------------------------------------------------------------------- */

/** The payroll year a date falls in, written the way their box writes it —
    "2025-26". April to March: that is the year every Indian payroll return is
    filed against, and the label in their capture is exactly that year. The UAE
    company files against a different one, which is F4's problem and not this
    control's. */
export function fyOf(iso = todayIso()) {
  const y = Number(String(iso).slice(0, 4));
  const m = Number(String(iso).slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The years the Year box offers: this one and the two before it. Derived from
    the clock rather than listed, so the box does not go stale in April — and
    stopping at the current year is deliberate, because a payslip for a month
    that has not happened is not a document anybody should be able to ask for. */
export const fyList = (iso = todayIso()) => {
  const y = Number(fyOf(iso).slice(0, 4));
  return [y - 2, y - 1, y].map((n) => `${n}-${String((n + 1) % 100).padStart(2, "0")}`);
};

/** The twelve months of one payroll year, April first — payroll order, not
    calendar order. The value is `YYYY-MM` so a month picked here and a date
    read anywhere else cannot disagree about which year March belongs to. */
export function fyMonths(label) {
  const start = Number(String(label).slice(0, 4));
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(start, 3 + i, 1);
    return [
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    ];
  });
}

/** PERIOD TYPE, which no other report of theirs carries. One value was in the
    capture and the list was never opened, so one value is all this offers. The
    name implies a multi-period sibling; what that sibling is called is not
    known, and a guess here would be a guess about what a payslip covers. */
export const PSL_PERIODS = ["Single Period"];

/** PAYROLL TYPE. **The same control is on their Adhoc Payments screen**, where
    it was empty and was recorded as unknown — see FH_ADHOC_FILTERS. This
    capture is the first time it has held anything, so one of its values is now
    known and the rest still are not. */
export const PSL_PAYROLL_TYPES = ["Monthly"];

/** PAYSLIP FORMAT. "Format 7" was selected, which means there are at least
    seven of them, and that is the whole finding: a payslip layout is not one
    document on their side, it is a numbered library somebody chose from. On
    ours it is a Print Format against `Salary Slip` — stock ERPNext ships one,
    and matching this means writing however many of the seven are actually in
    use. Nobody has said which. */
export const PSL_FORMATS = ["Format 7"];

/** REPORT OUTPUT. PDF was their selected value; the other three are ours,
    because unlike their list these are things this page can actually produce —
    the same four every other report here offers, off one HTML builder. */
export const PSL_OUTPUTS = ["PDF", "Excel", "Word", "On screen"];

/** Their three checkboxes, in their order, with the state each was in and what
    it would take to honour it here.

    `on` is the capture, not a preference: Include Zero Value Employees was
    ticked and the other two were not, and that is copied rather than tidied. */
export const PSL_FLAGS = [
  ["noemail", "Generate report for employees without email", false,
   "<b>Their form mails these out</b>, and this box decides whether somebody with no address still has a "
   + "document produced for them. It is the one control on this screen that can be answered here: press "
   + "Generate and the address fields are read off <code>Employee</code>, so the count of people who could "
   + "not be sent a payslip is a real number rather than an estimate. Untick it and this report drops them, "
   + "which is what their side does."],
  ["zero", "Include Zero Value Employees", true,
   "Somebody whose net pay is nil for the period — joined after the cut-off, or on unpaid leave for the "
   + "whole month — still gets a slip. <b>Every value here is nil</b>, because no salary structure is "
   + "readable, so unticking this would empty the report entirely and say nothing true about anybody. It "
   + "is left ticked and left alone."],
  ["itstat", "Include IT Statement", false,
   "Appends the tax computation sheet to the payslip. That needs an income tax slab, a declaration per "
   + "person and a payroll run to compute against — <code>Income Tax Slab</code>, "
   + "<code>Employee Tax Exemption Declaration</code>, <code>Salary Slip</code>. None is on the proxy "
   + "allowlist and the site holds none of them, so there are two reasons and fixing one would not be "
   + "enough."],
];

/** The rows Generate lists, in the order a payslip run would produce them.

    Four of these eleven columns are blank on every row and that is the report:
    who a payslip would go to is answerable off the `Employee` master, and what
    would be *on* it is not answerable at all. A column with nothing behind it
    is shaded rather than dropped — see the note under the table. */
export const PSL_COLS = [
  ["Emp code",     (r) => r.e.employee_number || r.e.name, "mono"],
  ["Name",         (r) => r.e.employee_name || "—", ""],
  ["Department",   (r) => tidyDept(r.e.department), ""],
  ["Company",      (r) => r.e.company || "—", ""],
  ["Month",        (r) => r.month, "mono"],
  ["Email",        (r) => r.email || "— none —", "mono"],
  ["CTC / year",   (r) => (r.e.ctc ? fmt(Math.round(Number(r.e.ctc))) : "—"), "mono"],
  ["Payment days", () => "—", "mono gone"],
  ["Gross",        () => "—", "mono gone"],
  ["Deductions",   () => "—", "mono gone"],
  ["Net pay",      () => "—", "mono gone"],
];

/** The payslip document itself, as a list of the lines Format 7 would carry.
    Drawn from `Salary Slip`'s own structure rather than from their layout,
    which has not been read at field level — so this is the shape of the thing
    we would have to fill, not a copy of the thing they print. */
export const PSL_SLIP_EARNINGS = ["Basic", "Dearness Allowance", "House Rent Allowance",
  "Conveyance", "Other Allowances"];
export const PSL_SLIP_DEDUCTIONS = ["Provident Fund", "ESI", "Professional Tax",
  "Income Tax (TDS)", "Advances / Loans"];


/* ---------------------------------------------------------------------------
   PROF. TAX STATEMENT, photographed 29 August 2026.

   Thirteen controls, three checkboxes, and four buttons — no Schedule Report,
   which every attendance report on their side carries. Only what is visible in
   the capture is recorded as theirs: not one of the thirteen lists was opened,
   so where a control needs options to be usable at all the options below are
   ours, and the page says which is which rather than letting a reader assume.

   Two of their controls are the whole finding on this page.

   **State**, because Professional Tax is a state levy: every state that
   charges it has its own slab, its own return, its own due date and its own
   registration. A form that filters by state is a form whose master holds a
   state against a person. Ours holds none — there is no state field on
   `Employee`, and so nothing on this site can say which return somebody
   belongs on. That is a gap in the master, not in the report.

   **Payroll Type: Monthly**, because it is not monthly everywhere — some
   states deduct every month and some file half-yearly or once a year. A
   control that picks the period concedes that the period is not the same for
   everybody, which is the state finding again wearing a different hat.
   --------------------------------------------------------------------------- */

/** Their Payment Process, the one value seen. The list was not opened; nothing
    is invented beside it. Adhoc Payments/Deductions carries the same control
    with the same single value — see FH_ADHOC_FILTERS. */
export const PT_PROCESS = ["Salary"];

/** Report Type held Detail. A statement of this kind conventionally also has a
    summary, and conventionally is not evidence — so Detail stands alone until
    somebody opens the list. */
export const PT_REPORT_TYPES = ["Detail"];

/** Payroll Type held Monthly. Same rule: what else it offers is unknown, and
    the states that file half-yearly are the reason it is worth finding out. */
export const PT_TYPES = ["Monthly"];

/** State held All, which is the only value a closed list can be read from. The
    slab-bearing states are deliberately not listed here — this side holds no
    state against anybody, and a dropdown of sixteen states would suggest we
    could tell which one a person is in. */
export const PT_STATES = ["All"];

/** The same three Report Output values the attendance forms offer. Copied
    rather than imported from `data/attendance`: a payroll page has no business
    depending on the attendance module, and the day their two lists are found to
    differ, this one changes on its own. */
export const PT_OUTPUTS = ["Excel", "PDF", "On screen"];

/** Their Employee Status read "Active, Inactive, Suspended" — three of the four
    Frappe carries, and the missing one is `Left`.

    That omission is worth a line, because it rounds the wrong way: somebody who
    left in August still had PT deducted for April to July, and a year's
    statement that drops them is short by those months and cannot be reconciled
    against what was actually remitted. The capture's three are ticked by
    default because they are theirs; the fourth is offered, and the page says
    why anyone filing a return should tick it. */
export const PT_STATUSES = ["Active", "Inactive", "Suspended", "Left"];
export const PT_STATUS_SEEN = ["Active", "Inactive", "Suspended"];

/** Filter By and GroupBy, which their form carries side by side and neither of
    which was opened. Read the way the attendance reports read the same pair:
    GroupBy sections the report, Filter By groups inside the section. The fields
    are ours, and every one of them is a field `Employee` actually has — the
    field a PT statement really wants to group by is the state, and that is the
    one this list cannot offer. */
export const PT_BY = [["", "(none)"], ["company", "Company"], ["department", "Department"],
	["designation", "Designation"], ["branch", "Branch"], ["grade", "Grade"]];

/** The columns a Professional Tax return needs, and what this site can put
    behind each. Same shape and same purpose as SR_COLS: the empty ones are the
    point of the exercise, so they are shaded rather than dropped. */
export const PT_COLS = [
	["Emp code", true, (e) => e.employee_number || e.name, ""],
	["Name", true, (e) => e.employee_name || "", ""],
	["Company", true, (e) => e.company || "—", ""],
	["Department", true, (e) => tidyDept(e.department), ""],
	["Status", true, (e) => e.status || "—", ""],
	["State", false, null, "no state field on Employee — and the slab is chosen by it"],
	["PT registration", false, null, "no enrolment or registration number is held anywhere on this site"],
	["Gross for the month", false, null, "payroll not started, and no payroll doctype is readable"],
	["Slab", false, null, "Frappe HR has the deduction mechanism and no slab master"],
	["PT deducted", false, null, "payroll not started"],
];

/* Their Year is a fiscal year — "2025-26", not 2025 — and that is not
   decoration: PT periods run April to March, so a calendar year files March in
   the wrong return and drops the following March out of every return. The
   capture read 2025-26, which was the year then current. */

/* The fiscal year a date falls in is `fyOf` above, written for the payslip
   form and taking an ISO date rather than a `Date`. It was declared a second
   time here, which is a duplicate binding and stopped the whole bundle
   building — so this one is gone and the payslip's is the only one. Both
   answered the same question; the difference was only what they were handed. */

/** The current fiscal year and the four before it. Computed rather than listed
    so that a page left open across an April does not offer a stale year. */
export const ptYears = (d = new Date()) => {
	const y = d.getFullYear() - (d.getMonth() < 3 ? 1 : 0);
	return [0, 1, 2, 3, 4].map((n) => `${y - n}-${String((y - n + 1) % 100).padStart(2, "0")}`);
};

/** April to March — the fiscal year's own month order, which is what From and
    Till have to walk. Both were empty in the capture and neither list was
    opened; a month range inside the chosen year is the reading, and it is
    marked as a reading on the page rather than stated as theirs. */
export const PT_FY_MONTHS = MONTHS.slice(3).concat(MONTHS.slice(0, 3));


/* ---------------------------------------------------------------------------
   BONUS WORKING REPORT — the form, photographed 29 August 2026.

   Seven controls and five buttons: From and Till as months, Employee Status as
   a chip box with Active and Suspended in it, a Particular Employee search with
   its "…" picker, Filter By, Output Currency, Report Output and With Logo —
   then Generate Report, Reset Fields, Close, Schedule Report and Generate In
   Background. The same chrome as their Statutory Reports panel, which is what
   makes copying it worth the trouble: somebody comparing the two screens should
   not first have to work out which control is which.

   **Their From and Till are months, and that is the finding on this form.**
   Apr-23 to Mar-27 in the capture — four accounting years, April to March. A
   bonus is not a total over an arbitrary range: it is computed per accounting
   year, per person, and a range that straddles four of them is four workings.
   So the report below sections by accounting year rather than adding across it.
   --------------------------------------------------------------------------- */

/** The Payment of Bonus Act 1965, in the four numbers that decide a working.
    Kept as figures with their sections beside them because every one of them
    has been amended at least once, and the day one moves the reader needs to
    know which line to change. */
export const BONUS_ACT = {
  /** sec 2(13) — who the Act covers, on salary or wage, per month. */
  ceiling: 21000,
  /** sec 12 — what it is computed on when the wage is above it: ₹7,000 *or the
      minimum wage for the scheduled employment, whichever is higher*. The
      minimum wage is a state notification per trade and is not held anywhere on
      this site, so ₹7,000 is used and every figure that comes off it is a
      floor. */
  basis: 7000,
  /** sec 8 — thirty *working* days in the accounting year. */
  days: 30,
  /** sec 10 and 11 — the band a bonus is declared in. */
  min: 8.33,
  max: 20,
  /** sec 10 proviso — ₹100 for the year, if 8.33% comes to less. */
  floor: 100,
};

/** Their Employee Status box holds chips rather than one value, and the capture
    has two of them in it. ERPNext's `Employee.status` has the same four. */
export const BONUS_STATUS = ["Active", "Suspended", "Inactive", "Left"];

/** Their Output Currency list has never been opened, so it offers the one value
    seen in it and nothing is invented alongside. */
export const BONUS_CURRENCY = ["Default"];

/** Report Output. Theirs read Excel; the four below it are the formats every
    other report here already hands out, built from the one HTML document in
    `lib/doc.js` so no two of them can disagree. */
export const BONUS_OUTPUTS = ["On screen", "Excel", "PDF", "Word", "Print", "Preview"];

/** Eligibility is three-valued and not two, which is the whole honesty of this
    report — see `bonRows` in `BonusReport.jsx` for which answer is reached how. */
export const BONUS_ELIG = {
  yes: ["Yes", "live"],
  no: ["No", "none"],
  unknown: ["Unknown", "part"],
};

const money = (v) => (v == null ? "—" : fmt(Math.round(v)));

/** The working, column by column, in the order it has to be read to be checked:
    who, which year, how long they were there, on what figure, and only then the
    money.

    `Wage — basic + DA` is drawn and never filled, the way the leave report
    draws Entitled. It is the figure sec 2(13) actually tests, this site holds
    no salary structure to get it from, and a column that is missing is a column
    nobody argues about. */
export const BONUS_COLS = [
  ["Employee Code", (r) => r.emp.employee_number || "—", "mono"],
  ["Employee Name", (r) => r.emp.employee_name || r.emp.name, ""],
  ["Department", (r) => tidyDept(r.emp.department), ""],
  ["Accounting Year", (r) => r.fy, "mono"],
  ["Joined", (r) => dmy(r.emp.date_of_joining), "mono"],
  ["Months", (r) => String(r.months), "mono"],
  ["Days in service", (r) => String(r.days), "mono"],
  ["Wage — basic + DA", () => "—", "mono gone"],
  ["CTC ÷ 12", (r) => money(r.wage), "mono"],
  ["Eligible", (r) => BONUS_ELIG[r.elig][0], ""],
  ["Bonus salary", (r) => money(r.salary), "mono"],
  ["At 8.33%", (r) => money(r.lo), "mono"],
  ["At 20%", (r) => money(r.hi), "mono"],
];


/* ---------------------------------------------------------------------------
   FNF & SEPARATION, photographed 29 August 2026.

   One screen, three numbered stages across the top — ① Separation, ② Exit
   Employees Clearance, ③ Final Settlement — and the third was the one open in
   the capture, carrying **(16)**.

   Two findings come off it, and neither is about the layout.

   **Sixteen people are in the settlement queue and none has been processed.**
   §1 read their F&F Summary as three zeroes, and this repo has been repeating
   "all zero in Factor HR" ever since. Both are true and they are not the same
   sentence: nothing has been *processed*, and sixteen are *waiting*. A zero on
   a summary tile that is really a backlog is exactly the number a migration
   gets sized from, so which zero it is matters.

   **DOL and EXP DOL are empty on every row in the capture.** These are people
   their system has already put in a leaving queue, and it holds neither the day
   they left nor the day they are expected to. So whatever puts somebody into
   this list, it is not a date of leaving — which is worth saying twice, because
   the filter sitting directly above the rows is a *Date of Leaving Range*, and
   a range over a column that is empty for everybody returns nobody.
   --------------------------------------------------------------------------- */

/** Their three stages, in their order, with the number drawn in the chip.
    `what` is the doctype that would stand behind the stage here. */
export const FH_FNF_TABS = [
  ["separation", "1", "Separation", "Employee Separation",
   "Frappe HR ships <code>Employee Separation</code> — one document per leaver, raised from a template, "
   + "carrying the exit activities as rows. It is the doctype that would hold this whole screen."],
  ["clearance", "2", "Exit Employees Clearance", "Employee Separation → activities",
   "Not a doctype of its own: the clearance list is the activity table inside "
   + "<code>Employee Separation</code>, one row per department that has to sign off. Which departments "
   + "sign off here, and in what order, is a policy answer nobody has given yet."],
  ["settlement", "3", "Final Settlement", "Full and Final Statement",
   "Frappe HR ships <code>Full and Final Statement</code>, which gathers the payables and receivables, "
   + "and <code>Gratuity</code> beside it. Neither is installed on this site and neither is on the "
   + "proxy&rsquo;s allowlist."],
];

/** What their tab said on 29 August 2026. Quoted rather than compared against:
    their sixteen and ours are two different populations until the master is
    loaded, and one number drawn for both would be read as both. */
export const FH_FNF_WAITING = 16;

/* The three underlines on each of their cards. Factor HR draws Separation and
   Clearance green and FNF amber on every visible row — so on their screen the
   first two stages are done for all sixteen and the third is what everybody is
   waiting on. That is the shape of the backlog, and it is why this page draws
   the same three marks rather than one status.

   What each mark says *here* is not what it says there, and the title on each
   one is where that is spelled out. */
export const FH_FNF_STAGES = [
  ["Separation", "sep",
   "Green on every row of their capture. Here it is read off the record itself — a resignation letter "
   + "date, a relieving date, or a status that is no longer Active. There is no separation document on "
   + "this site to be in a state at all."],
  ["Clearance", "clr",
   "Green on every row of their capture. Nothing on this site holds an exit clearance: it would be the "
   + "activity table inside Employee Separation, and Frappe HR is not installed."],
  ["FNF", "fnf",
   "Amber on every row of their capture — sixteen waiting, none processed. Marked unfinished here for a "
   + "different reason: no settlement can be processed on this site at all."],
];

/* The four fields under each card, in their order, and where each would come
   from. This is the useful half of the capture: three of their four columns
   were empty for everybody, and only one of the three is empty because nobody
   has typed it. */
export const FH_FNF_FIELDS = [
  ["DOJ", "<code>date_of_joining</code>", "live",
   "The one column filled on every row of their capture, and the one this page can fill too."],
  ["DOL", "<code>relieving_date</code>", "live",
   "The field exists on ERPNext&rsquo;s <code>Employee</code> and is read here. Empty on every row of "
   + "their capture, which is a finding about their data rather than a gap on our side — a leaving "
   + "queue that does not record when anybody left."],
  ["EXP DOL", "<code>resignation_letter_date</code> + <code>notice_number_of_days</code>", "stock",
   "<b>Computed here, not stored.</b> ERPNext holds the day notice was given and the length of the "
   + "notice period; an expected last day is arithmetic on the two. Factor HR appears to hold it as a "
   + "field of its own — it is a column on their card — and it was empty on every row."],
  ["FNF Processed Datetime", "<code>Full and Final Statement</code>", "build",
   "Nothing on this site can hold it. The doctype ships with Frappe HR, which is not installed, and no "
   + "payroll doctype is on the proxy&rsquo;s allowlist even once it is."],
];


/* ---------------------------------------------------------------------------
   SALARY REGISTER — their form, photographed 29 August 2026.

   Two tabs, BASIC OPTION and ADD ADDITIONAL COLUMN, with a refresh and a
   Generate split button pinned to the tab row rather than to a bar of its own.
   Basic Option holds eight controls — Select Employee, Employee Status, Filter
   By, Payroll Type, Year, Month, Output Currency, Group By — and then one box
   of chips, Other Options, which the capture found holding five.

   The first three are the toolbar every one of their reports carries, so they
   are drawn from the shared lists the attendance and leave reports already use.
   What is below is only what this report has of its own.

   **Only the second tab's name has been seen.** It is drawn as a tab and says
   so; nothing is invented under it.
   --------------------------------------------------------------------------- */

/** Their PAYROLL TYPE list, which held Monthly and has never been opened. One
    option rather than a plausible four: weekly and fortnightly payrolls exist in
    this group's factories as a question nobody has answered, and answering it
    with a dropdown would be this page inventing policy. */
export const SREG_PAYROLL_TYPES = ["Monthly"];

/* YEAR and MONTH are the payslip form's two boxes over again, so they are the
   payslip form's two helpers over again — `fyList` and `fyMonths` above. Their
   register and their payslip are filed against the same April-to-March year,
   and two functions computing it would be two chances to disagree about which
   return March belongs in. */

/** OTHER OPTIONS, in the order the capture holds them, all five of them on.

    `live` is whether the chip does anything on this side. Two of the five do,
    and the three that do not are still drawn and still removable — a control
    dropped from a copy of a form is a gap nobody can see, and each of these
    three names a different missing thing rather than the same one three times. */
export const SREG_OPTIONS = [
  ["master", "Include Employee Master", true,
   "Appends the master columns — company, branch, grade, employment type, date of joining. "
   + "It is the one option here with data behind it, because <code>Employee</code> is the only "
   + "doctype this page can read."],
  ["oldcode", "Hide Old Code", false,
   "<b>There is no old code to hide.</b> Factor HR carries a previous employee code beside the "
   + "current one — the number somebody was known by before a merge or a renumbering. "
   + "<code>Employee</code> has one code, <code>employee_number</code>, and nothing that "
   + "remembers a former one. Whether the Factor HR codes survive the migration at all is open; "
   + "see docs/MIGRATION.md."],
  ["zerocols", "Hide Zero Value Columns", false,
   "<b>A blank is not a zero, so there is nothing here to hide.</b> Every money column on this "
   + "register is empty because no payroll doctype can be read, not because it totalled nought. "
   + "Hiding them would turn the finding of this page into a tidy report of four columns. This "
   + "chip becomes real the day <code>Salary Slip</code> is readable and a component genuinely "
   + "sums to zero."],
  ["zeroemps", "Include Zero Value Employees", true,
   "Live, against the only value on this side: untick it and anybody whose <code>ctc</code> on "
   + "the master is empty or zero drops out. On their register it means somebody whose net pay "
   + "came to nothing — a full month of unpaid leave, or a joiner after the cut-off — which is a "
   + "different question and cannot be asked until payroll runs."],
  ["bank", "Auto Correct Bank Account Number", false,
   "<b>This one writes.</b> It repairs a bank account number on the master as the register is "
   + "built — which is a payroll run editing employee records, and worth knowing before it is "
   + "switched on anywhere. This page proxies GET only (<code>server/index.js</code>), so it cannot "
   + "and should not. Corrections belong on the site, where the version trail is."],
];

/** The register itself, in the column order Factor HR's own reads.

    Six of the ten cannot be filled and are drawn anyway, marked `gone`, for the
    same reason the Leave Balance Report draws Entitled and Balance empty: a
    column that is missing is a column nobody argues about.

    **Payment Days is the one to look at.** It is attendance, and everything to
    its right is arithmetic on it — so it is empty here for two reasons at once,
    no readable payroll *and* no generated `Attendance`, and either alone would
    be enough. See REGISTER_COLS above for the whole shape. */
export const SREG_COLS = [
  ["Employee Code", (r) => r.emp.employee_number || "—", "mono"],
  ["Employee Name", (r) => r.emp.employee_name || r.emp.name, ""],
  ["Department", (r) => tidyDept(r.emp.department), ""],
  ["Designation", (r) => r.emp.designation || "—", ""],
  ["Payment Days", () => "—", "mono gone"],
  ["LWP", () => "—", "mono gone"],
  ["Gross", () => "—", "mono gone"],
  ["Total Deduction", () => "—", "mono gone"],
  ["Net Pay", () => "—", "mono gone"],
  /* Not a payroll figure and never labelled as one. It is the master's annual
     CTC divided by twelve, which is what somebody is *contracted* for rather
     than what a month paid them — the two differ by exactly the thing this
     register exists to show. */
  ["CTC ÷ 12", (r) => (r.emp.ctc ? fmt(Math.round(Number(r.emp.ctc) / 12)) : "—"), "mono"],
];

/** What Include Employee Master appends, in the order it appends them. Every
    one is off the master and every one is real — which is the whole of what
    this register can honestly say today. */
export const SREG_MASTER_COLS = [
  ["Company", (r) => r.emp.company || "—", "muted"],
  ["Branch", (r) => r.emp.branch || "—", "muted"],
  ["Grade", (r) => r.emp.grade || "—", "muted"],
  ["Employment Type", (r) => r.emp.employment_type || "—", "muted"],
  ["Date of Joining", (r) => dmy(r.emp.date_of_joining), "mono"],
];


/* ---------------------------------------------------------------------------
   SALARY PROCESS, photographed 29 August 2026 on MAR 2026.

   Three lists over a strip of twelve month chips, April first; a summary line;
   six tiles; Generated By / On and a Payslip Remarks box; then Start Salary
   Process, Finalize Process and a gear.

   The Year / Payroll Type / month-strip half of this screen is date arithmetic
   and is live here — see fyList and fyMonths above, which the Payslip screen
   already uses. Everything below the strip is payroll state, and none of it is
   readable: no payroll doctype is on the proxy's allowlist and no Payroll Entry
   exists. So those figures are drawn from `Employee` where `Employee` can
   honestly answer them, and left as a dash where it cannot.
   --------------------------------------------------------------------------- */

/** PROCESS FOR, the one value the capture caught. Their list was not opened. */
export const SP_PROCESS_FOR = ["All Employees"];

/** What their screen actually read, kept as the evidence for the paragraph the
    page draws under the tiles. One tenant, one month. */
export const SP_CAPTURE = {
  month: "MAR 2026",
  payroll: "01 Mar - 31 Mar 2026",
  attendance: "01 Mar - 31 Mar 2026",
  days: 31,
  status: "NOT GENERATED",
  total: 160, joined: 9, left: 13,
  pending: 147, processed: 0, of: 160,
  stopSalary: 0, stopPayment: 0, arrears: [0, 0],
};

/* Their six tiles, in their order. `seen` is what the capture read; `map` is
   the doctype or field that would stand behind the figure here, and an empty
   `map` is the finding — there is nothing on our side that means this.

   The tooltips are read on hover, so they are plain text with no markup. */
export const SP_TILES = [
  { k: "total", label: "Total employees", sub: "incl. left", seen: "160",
    map: "Employee",
    why: "Everybody the run would produce a slip for, including anybody who left partway through the "
       + "month — they are still owed the days they worked. Countable here off Employee." },
  { k: "pending", label: "Pending count", seen: "147",
    map: "Employee",
    why: "Who is still to be processed. Nothing is processed on this site, so pending is everybody in "
       + "the run — which is the honest figure rather than a placeholder." },
  { k: "process", label: "Process count", seen: "0 / 160",
    map: "Salary Slip",
    why: "Slips generated, out of the run. Zero of them, and not because a filter found nothing: no "
       + "Payroll Entry has ever run here." },
  { k: "stopsal", label: "Stop salary", seen: "0",
    map: "",
    why: "Their hold on somebody's whole salary. Frappe HR ships no such flag on Employee or on Salary "
       + "Slip — it is a custom field plus a rule in the run, and it does not exist here." },
  { k: "stoppay", label: "Stop payment", seen: "0",
    map: "",
    why: "Their hold on the payment while the slip still generates — a different thing from Stop "
       + "Salary, and it has no equivalent here either." },
  { k: "arrears", label: "Total arrears", seen: "0 / 0",
    map: "Additional Salary",
    why: "Back-dated pay. On our side that is an Additional Salary with a payroll_date in a month "
       + "already closed — the same doctype the Adhoc Payments screen is about. None exist." },
];

/** The three controls under SALARY PROCESS, and where each one actually lives.
    Every one of them writes, so every one of them opens on the site. */
export const SP_ACTIONS = [
  ["Start Salary Process", "Payroll Entry",
   "Picks the people, the dates and the structure, and generates the slips. Opens a new Payroll Entry "
   + "on the site — nothing here writes payroll."],
  ["Finalize Process", "Salary Slip",
   "Submits what was generated, which is the point of no return: a submitted slip is cancelled and "
   + "amended, never edited. It is done on the site, against the Payroll Entry that made them."],
  ["Settings", "Payroll Settings",
   "Their gear. Payroll Settings is where Consider Unmarked Attendance As lives — set to Absent, a "
   + "day the shift job has not processed yet is a day's pay gone. Read it before anybody is paid."],
];


/* ---------------------------------------------------------------------------
   BANK TRANSFER, photographed 29 August 2026 — both tabs of it.

   Their screen is a rail of filters down the left and a preview panel beside
   it, which is a shape no other Factor HR screen here has: everything else of
   theirs is a form above a report. Two tabs across the top, REGULAR and RELEASE
   HELD SALARY, and the rail is the same rail on both. The panel changes its
   title — Report Preview, then With Held Salary — and one of its four buttons;
   the other three are the same on both tabs.

   **Both captures are of an empty screen**: "No Data Available — Apply filters
   and click Preview to view data". So nothing has been seen of what their rows
   hold. And all three filter groups are shut — PAYROLL DETAILS, EMPLOYEE
   SELECTION and BANK DETAILS are three names and three carets and nothing else.

   So the group names are theirs and the fields under them are ours, which the
   page says out loud. Same call Manage Shift makes about Work Pattern, and it
   is a safer call here than there: what a bank payment file needs is not a
   matter of opinion. It is what the bank's own format demands, and three of the
   four things it demands can be checked against `Employee` today.

   **The second tab is the finding, and it is bigger than this screen.** Release
   Held Salary means Factor HR holds somebody's pay and later releases it —
   holds it as a state on the payroll, with a register of its own and a payment
   file of its own. Frappe HR has no such state; SP_TILES' stop-salary tile is
   the same gap seen from the other side. Anybody whose salary is held on the
   day of cutover is money that has to land somewhere here, and there is nowhere
   for it to land yet.
   --------------------------------------------------------------------------- */

/** The two tabs: key, their label, the panel title each one gives the preview,
    and the third button, which is the one control that differs between them. */
export const BT_TABS = [
  ["regular", "Regular", "Report Preview", "Hold Salary Register"],
  ["held", "Release Held Salary", "With Held Salary", "Release Salary Register"],
];

/** The rail, group for group. Their three names, in their order, each with the
    fields this side would need under it — labelled as ours on the page.

    The third element of a field is the hint under it, and every one of them
    answers the same question: is this control doing anything, and if not, what
    is it short of. Read as HTML, and hand-written here like the rest of this
    file. */
export const BT_GROUPS = [
  ["pay", "Payroll Details", [
    ["ptype", "Payroll Type",
     "Monthly is the only value any of their payroll forms has been seen holding. Whether the "
     + "factories run a weekly or a fortnightly payroll is a policy question nobody has answered."],
    ["year", "Year",
     "April to March. Live — it is date arithmetic, and it is the same helper the payslip and the "
     + "register use, so the three cannot disagree about which year March belongs to."],
    ["month", "Month",
     "Which pay run is being paid out. Live as a filter; what it cannot do is find the run, "
     + "because no <code>Payroll Entry</code> has ever been made on this site."],
    ["paydate", "Payment Date",
     "<b>The value date on the instruction, and it is not decoration.</b> It is the day the money "
     + "leaves, it is a mandatory column in every bank's format, and on our side it is "
     + "<code>Payroll Entry.payment_date</code> — a field on a document that does not exist yet."],
  ]],
  ["emp", "Employee Selection", [
    ["status", "Employee Status",
     "Live, off the master. Active is the default here rather than All: a transfer list is who is "
     + "being paid this month, and somebody who has Left is on it only if they are owed a part "
     + "month — which is a payroll question this page cannot answer either way."],
    ["q", "Particular Employee",
     "Live. Matches code, name or designation, and narrows the list below."],
    ["by", "Filter By",
     "Live, and it is worth more here than on a report: a payment file is usually per company, "
     + "because the debit account is per company. Four companies means four files."],
  ]],
  ["bank", "Bank Details", [
    ["mode", "Salary Mode",
     "Live once the bank fields answer — <code>salary_mode</code> on <code>Employee</code>, which "
     + "ERPNext ships holding Bank, Cash or Cheque. Anybody not on Bank is in no transfer file at "
     + "all, and is listed here so they are paid some other way rather than missed."],
    ["bankname", "Bank",
     "Live once the bank fields answer, and built from what the master actually holds rather than "
     + "from a list of banks. A transfer file goes to one bank at a time."],
    ["format", "File Format",
     "<b>Nothing is offered here, and that is the honest state.</b> A payment file is written in "
     + "one bank's own layout — HDFC, ICICI, SBI and Federal differ in column order, header and "
     + "encoding — and which bank the group pays from is not recorded anywhere this page can read. "
     + "Until somebody names it, there is no format to write."],
  ]],
];

/** ERPNext's own `salary_mode` options, plus the All this rail needs. Not
    invented: these three are what the field ships with. */
export const BT_MODES = ["All", "Bank", "Cash", "Cheque"];

/** The four buttons across the preview panel, in their order.

    `why` is what the page says when the button is pressed. Three of the four
    have to refuse, and each refuses for its own reason rather than for the
    module's: a button that says "payroll is deferred" four times over teaches
    nobody which of these four things is actually the hard one. */
export const BT_ACTIONS = [
  ["amounts", "Show Amounts", "\u{1F441}",
   "<b>Every money column this reveals is blank, and blank is not nought.</b> The amount in a "
   + "transfer file is net pay, which is a <code>Salary Slip</code> figure — no payroll doctype is "
   + "on the proxy's allowlist (<code>server/index.js</code>), and no slip has ever been generated "
   + "here anyway. Two independent reasons, so fixing either alone would still leave the column "
   + "empty. It is drawn empty rather than zero because a zero is a figure somebody can be paid."],
  ["file", "Generate Payment File", "⤓",
   "<b>Refused, and it would still be refused if payroll ran tomorrow.</b> Three things are missing "
   + "at once: the amount (no readable slip), the IFSC (<b>no such field on ERPNext's Employee</b> "
   + "— see the Bank pane of any profile), and the layout to write them in (no bank named, so no "
   + "format). There is a fourth: the debit side. <code>Bank Account</code> is not on this proxy's "
   + "allowlist, so the account the money would leave cannot even be read. What this page can do "
   + "instead is say who <i>could</i> be paid once those exist, which is the list under Preview."],
  ["register", "Hold Salary Register", "\u{1F5CE}",
   "<b>Nothing on this site can hold a salary, so there is no register to open.</b> Factor HR holds "
   + "pay as a state on the payroll — Stop Salary and Stop Payment, two different holds, both on "
   + "their Salary Process screen. Frappe HR ships neither: no flag on <code>Employee</code>, none "
   + "on <code>Salary Slip</code>. It is a custom field plus a rule inside the run, and it has to "
   + "be built before anybody's pay can be held here at all."],
  ["preview", "Preview", "", ""],
];

/** What a bank payment file has to carry, line by line — the acceptance test
    for this screen, the way REGISTER_COLS is for the register.

    Read down the State column. Three of the nine can be filled today, and the
    one that matters most among the rest is a missing *field* rather than a
    missing figure: a figure arrives the day payroll runs, and a field has to be
    built and then filled 160 times from an export only Factor HR holds. */
export const BT_FILE_COLS = [
  ["Beneficiary name", "Who the money is for", "live",
   "<code>employee_name</code>. Banks match the name against the account and reject a mismatch, so "
   + "a master carrying a shortened name is a rejected line rather than a wrong one"],
  ["Account number", "Where it goes", "live",
   "<code>bank_ac_no</code>, read on this page person by person. How many are missing one is the "
   + "single number here worth acting on long before payroll is ready"],
  ["IFSC / branch code", "Which branch of which bank", "build",
   "<b>No field on ERPNext's Employee.</b> An Indian NEFT or RTGS line cannot be written without "
   + "it. A custom field, and then 160 values that only Factor HR holds — so it is an export item "
   + "as much as a build item"],
  ["IBAN", "The UAE company's equivalent", "live",
   "ERPNext's own field, and the one the Kerala companies do not use. The two are not alternatives "
   + "on one file: they are two files, to two banks, in two formats"],
  ["Amount", "Net pay", "build",
   "<code>Salary Slip.net_pay</code>. Not readable, and never generated — see Show Amounts"],
  ["Value date", "When the money leaves", "build",
   "<code>Payroll Entry.payment_date</code>, on a document that does not exist yet"],
  ["Debit account", "Which company account it leaves", "build",
   "The company's <code>Bank Account</code>, which is not on this proxy's allowlist. It is per "
   + "company, so four companies is four files even in one month"],
  ["Transaction type", "NEFT, RTGS, IMPS or internal", "build",
   "Not <code>salary_mode</code>, which only says Bank, Cash or Cheque. Which one a line gets "
   + "depends on the amount, the bank and the cut-off — it is a rule, and the rule is the bank's"],
  ["Narration", "What shows on the statement", "stock",
   "Free text, and the one column here nobody will argue about. Most of them carry something like "
   + "&ldquo;SALARY MAR-2026&rdquo; and the employee code"],
];
