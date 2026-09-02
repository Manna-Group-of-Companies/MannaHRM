import { MONTHS } from "@/lib/format";


/* The register's columns. Every one of them is arithmetic over the application
   plus the recoveries — which is why the register cannot be built first, and
   why an opening balance has to be loaded rather than derived. */
export const REGISTER_COLS = [
  ["Employee, code, company", "off the Employee record", "stock", "The only three columns that exist today"],
  ["Loan type, sanctioned amount, sanction date", "off the application", "build", ""],
  ["Disbursed", "Currency", "build",
   "Separate from sanctioned. A sanctioned loan that was never paid out must not show as owing"],
  ["Recovered to date", "sum of the payroll deductions", "build",
   "Which means it is a sum over rows payroll has not started writing"],
  ["Outstanding", "disbursed &minus; recovered", "build",
   "The one number anybody opens this page for, and the one nobody can produce today"],
  ["Instalments paid / remaining", "count", "build", ""],
  ["Status", "Select", "build", "Running, closed, written off, or stopped because the person left"],
];

/* ---------------------------------------------------------------------------
   LOAN PROJECTION — the form, photographed 29 August 2026.

   The first Loans screen anybody here has seen past the menu, and it answers
   two of the five questions §26 of FACTOHR_SCREENS.md left open.

   **Their Loan Type box reads "Salary Advance, Tour Advance".** Both are
   advances. Nobody has yet said Manna lends, and this is the closest thing to
   an answer we hold: the two types in use are the two an employer recovers out
   of payroll rather than the two an employer charges for.

   **Interest is a checkbox, and it is off.** Principal is ticked and Interest
   is not. So interest exists as a concept over there — the box would not be
   drawn otherwise — but the projection somebody actually ran did not ask for
   it. That is the difference between `Employee Advance`, which stayed in hrms,
   and the whole `lending` app, which on v15 and later is a third `bench
   get-app` and an accounting build behind it.

   **The window opens in the past.** 01-Apr-2025 to 31-Aug-2026 on a form
   captured on 29 August 2026 — seventeen months, most of them already paid.
   So this is not a forecast: it prints every instalment in a window, behind and
   ahead alike, and "projection" is their word for a schedule.
   --------------------------------------------------------------------------- */

/* Its first six controls are the Loan Register panel's first six, box for box —
   Employee Status, Particular Employee, From, Till, Loan Type, Filter By. So the
   four constants under this comment are read by *both* screens and are defined
   once: one truncated status recorded twice in two spellings is exactly the
   drift that would let the two forms disagree about who is in scope. `LOAN_BY`
   is further down, with the Register's own controls. */

/** Their Employee Status box, as both screens found it: four values, and the
    fourth is clipped at the edge of the control at "Tempo". It is recorded as
    clipped rather than completed — `Employee.status` in ERPNext offers Active,
    Inactive, Suspended and Left, and has nothing temporary on it, so guessing
    the word would invent a status *and* a mapping for it. */
export const LP_STATUS_SEEN = ["Active", "Inactive", "Suspended"];
export const LP_STATUS_CLIPPED = "Tempo…";

/** What can actually be filtered on — the site's own four. `Left` was in
    neither box and is offered anyway: 344 people have left, and what happens to
    a balance when somebody does is the open question §26 ends on. */
export const LP_STATUSES = ["Active", "Inactive", "Suspended", "Left"];

/** The two loan types, ticked on both forms. Not a list of what Factor HR
    offers — that dropdown was never opened — but of what somebody selected,
    which is the better evidence: these are the two an employer recovers out of
    payroll rather than the two an employer charges for. */
export const LOAN_TYPES = ["Salary Advance", "Tour Advance"];

/** Their two checkboxes, in their order and in the states the capture had them.
    `on` is the capture, not a preference. */
export const LP_FLAGS = [
  ["principal", "Include Principal", true,
   "The capital being recovered — the part of an instalment that reduces what is owed. Ticked in "
   + "their capture, and the only one of the two that an interest-free advance has at all."],
  ["interest", "Include Interest", false,
   "<b>Unticked in their capture, and that is the finding.</b> An interest-free advance recovered "
   + "over N months needs a deduction component and a schedule. Interest needs accrual, a rest "
   + "convention and ledger entries — which on Frappe v15 and later is the separate "
   + "<code>lending</code> app, a third <code>bench get-app</code> on top of hrms. The box exists "
   + "over there, so somebody can charge it; nobody has said whether Manna does."],
];

/** What a projection row has to carry, and what stands behind it here. The
    empty ones are the point of the exercise — same shape as REGISTER_COLS
    above, and for the same reason. */
export const PROJ_COLS = [
  ["Employee, code, company", "off the Employee record", "stock", "The only columns that exist today"],
  ["Loan type", "Salary Advance or Tour Advance", "build",
   "Their two, read off this capture. Neither exists as a record on our site"],
  ["Instalment month", "the payroll month the deduction lands in", "build",
   "Which is a row per person per month &mdash; the projection is the schedule unfolded"],
  ["Principal due", "Currency", "build",
   "Needs the sanctioned amount, the disbursed amount and the instalment count. We hold none of the three"],
  ["Interest due", "Currency", "none",
   "<b>Needs the <code>lending</code> app, or nothing at all.</b> Unticked on their form, so it may never be needed &mdash; see LP_FLAGS"],
  ["Recovered to date", "sum of the payroll deductions", "build",
   "Payroll has not started writing the rows this sums"],
  ["Closing balance", "disbursed &minus; recovered, per month", "build",
   "The column somebody opens this page for, and the one nobody can produce today"],
];

/** The months a From/Till window covers, as `["2026-04", "Apr 2026"]`, oldest
    first. Whole months either end: their form takes two dates but a recovery
    lands in a payroll month, so a window that starts on the 12th still means
    that month's instalment. Rounding the other way would drop a real deduction
    out of the report, and CLAUDE.md §4 says which way to round. */
export function monthsBetween(from, till) {
  const a = String(from || "").slice(0, 7);
  const b = String(till || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(a) || !/^\d{4}-\d{2}$/.test(b) || a > b) return [];
  const out = [];
  let [y, m] = a.split("-").map(Number);
  /* Capped rather than unbounded: a mistyped year is one keystroke away, and a
     browser asked to draw forty thousand rows stops answering. The page says
     when it has capped, which a silent truncation would not. */
  while (out.length < 240) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    out.push([ym, `${MONTHS[m - 1].slice(0, 3)} ${y}`]);
    if (ym === b) break;
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}


/* ---------------------------------------------------------------------------
   LOAN REGISTER — the report criteria panel, photographed 29 August 2026.

   Nine controls down one column and three buttons under them, in their order:

   > Employee Status · Particular Employee · From Date · Till Date · Loan Type
   > · Filter By · Group By · Report Type · ☐ Exclude Zero Balance Loans
   > — Generate · Reset Fields · Close

   **It is the Loan Projection form with two controls swapped.** Same status box
   clipped at the same word, same two loan types, same 01-Apr-2025 to 31-Aug-2026
   window; Include Principal / Include Interest are gone and Report Type,
   Group By and Exclude Zero Balance Loans stand in their place. So the two
   Loans reports are one form over one query with a Report Type on it, which is
   worth knowing before either is quoted as a separate build — and it is a
   second, independent sighting of everything LP_* above records.

   What this capture adds:

   **Report Type reads `Month Wise Recovery`.** A month-wise recovery report
   only exists if recovery runs over months, which is the schedule the
   projection implied and this one names. `Employee Advance` carries no
   schedule; that gap is the build, and it is much smaller than a lending
   ledger.

   **Exclude Zero Balance Loans.** A register that can hide a settled loan is a
   register that keeps them — so closed advances stay on the table over there
   rather than being deleted, and whatever export is finally asked for should be
   taken with this box *unticked*.

   Three buttons only: no Schedule Report and no Generate In Background, both of
   which their attendance reports carry and Prof. Tax carries one of.
   --------------------------------------------------------------------------- */

/** Report Type held one value and the list was never opened. The value is worth
    more than the list would be. */
export const LOAN_REPORT_TYPES = ["Month Wise Recovery"];

/** Filter By and Group By were both empty and neither was opened. Ours, offered
    against fields this site actually carries — the same six every other report
    here groups by. */
export const LOAN_BY = [["", "(none)"], ["company", "Company"], ["department", "Department"],
  ["designation", "Designation"], ["grade", "Grade"], ["branch", "Branch"]];

/** The two dates as they stood in the capture — the same window the projection
    form defaulted to, which is why it is recorded once more here rather than
    assumed to be a coincidence. Seventeen months, reaching back to the start of
    the fiscal year before last. Nobody sets that default for something
    recovered out of next month's pay. */
export const LOAN_CAPTURE = { from: "2025-04-01", till: "2026-08-31" };


/* ---------------------------------------------------------------------------
   LOAN APPLICATION, photographed 29 August 2026 — the form, its five tabs, the
   attachment box and the amortization grid.

   Read it against the Projection capture above rather than on its own, because
   the two say different things and the difference is the finding.

   **This form carries a whole lending product.** Interest Type, an amortization
   schedule, Loan Balance split into principal and interest, and four
   Perquisites columns. **The Projection screen next door was run over two
   advances with Include Interest unticked.** So the machinery is the vendor's,
   and what Manna uses is some subset of it — which means §26's question is
   still open, and this capture narrows it rather than closing it: whatever the
   answer, it is a *setting* over there and an *app* over here.

   What it does close:

   - **Sanctioning happens inside the application.** Amount Requested and
     Sanctioned Amount are two fields on one form, with Loan Status beside them.
     §26 inferred that from the absence of a loan tab in the seven approval
     queues; the form confirms it.
   - **Closure is automatic unless somebody stops it** — Loan Completed (drawn
     read-only), Do not auto complete, Loan Completed On.
   - **The recovery lifecycle is four tabs, not one.** Pre Recovery, Recovery
     From Payroll, Stop Loan Deduction, Manual EMI Deduction. Any of the four
     can make the schedule and the payslip disagree, and all four exist because
     over there they do.

   And what it opens, which nobody has costed: **an interest-free advance over
   twenty thousand rupees is a taxable perquisite.** See LOAN_SCHED_COLS.
   --------------------------------------------------------------------------- */

/** Their five tabs. Only the first has been photographed; the other four are a
    label and nothing else, so what is written under them is a reading of what
    the name has to mean here, and it is marked as one on the page. */
export const LOAN_TABS = [
  ["application", "Loan Application", true,
   "The form itself — photographed, and drawn below control for control."],
  ["pre", "Pre Recovery", false,
   "Recovery that does not come out of a payslip: cash, a bank transfer, or an amount taken before the "
   + "salary deduction starts. It earns a tab because <b>the schedule and the payroll run are two different "
   + "clocks</b> — somebody who repays a lump sum in March has a schedule that no longer matches what "
   + "payroll will deduct in April. On our side it is a repayment not linked to a salary slip, which is a "
   + "row the <code>lending</code> app has and <code>Employee Advance</code> does not."],
  ["payroll", "Recovery From Payroll", false,
   "The instalments that did come out of a payslip. Here that is the loan repayment row on "
   + "<code>Salary Slip</code>, which <code>hrms</code> writes only when the <code>lending</code> app is "
   + "installed — §26. <b>This is the tab that makes Loans a payroll dependency</b>, so the module cannot be "
   + "finished before payroll is, whichever way the interest question goes."],
  ["stop", "Stop Loan Deduction", false,
   "A hold: recovery pauses — unpaid leave, hardship, somebody who has left and whose balance is not settled "
   + "— while the loan itself stays open. Worth noticing that it is a <em>tab on the loan</em> rather than a "
   + "value in Loan Status. A stopped deduction and a closed loan are different things, and running them "
   + "together is how a balance quietly stops being recovered."],
  ["manual", "Manual EMI Deduction", false,
   "An instalment typed rather than computed — which is what the <b>Manual</b> tick box in the amortization "
   + "grid marks. One month at a different amount, without rewriting the schedule under it."],
];

/** Their form, field by field, in the order the capture reads: the left column
    top to bottom, then the right, then the attachment box under both.

    The second element is their yellow shading, which is how that form marks a
    mandatory field — four of the seventeen. */
export const LOAN_FIELDS = [
  ["Loan #", true, "the naming series on the loan document", "build",
   "Assigned when the row is saved. It reads blank on their new form too."],
  ["Employee", true, "<code>Link &rarr; Employee</code>", "live",
   "The one field on this form our site can fill today, which is why the search below is live and nothing "
   + "else on it is."],
  ["Loan Type", true, "<code>Loan Product</code>, in the <code>lending</code> app", "build",
   "<b>The rate and the term are not on this form</b>, so they come off this master — which is how ERPNext "
   + "models it too. A rare case where their shape and ours already agree. Salary Advance and Tour Advance "
   + "are the two seen in use, off the Projection capture."],
  ["Interest Type", false, "<code>Loan Product</code> — rate and repayment method", "build",
   "Empty in the capture and the list was never opened, so what it offers is unknown. The three the "
   + "schedule below can compute are ours."],
  ["Amount Requested", false, "Currency", "build",
   "Separate from Sanctioned, which is the whole point of it: the difference between the two is the "
   + "sanction, and there is no approval queue anywhere on their menu for that decision to live in."],
  ["Sanctioned Amount", false, "<code>Loan.loan_amount</code>", "build",
   "What the schedule is computed on. Not the same as disbursed — a sanctioned loan that was never paid "
   + "out must not show as owing on the register."],
  ["Details of Purpose", false, "Small Text", "build",
   "Free text. Loan Required For is the coded version of the same thing."],
  ["Loan Date", true, "Date", "build", "When it was applied for. Not when it was paid."],
  ["Deduction Start From", false, "Date", "build",
   "The first payslip that carries an instalment. A separate date from the other two because an advance "
   + "paid mid-month is normally recovered from the month after."],
  ["Payment Date", false, "Date", "build",
   "Disbursement — the one date on this form that money actually moved on, and the date interest would run "
   + "from if any were charged."],
  ["Loan Required For", false, "Select", "build",
   "The coded purpose, and <b>it is a tax field before it is a filing one</b>: Rule 3(7)(i) exempts a loan "
   + "for the medical treatment of a specified disease from the perquisite altogether. This list decides "
   + "whether the four Perquisites columns are computed at all."],
  ["Loan Status", false, "Select", "build",
   "Applied, sanctioned, disbursed, running, closed — presumably. Their list has never been opened."],
  ["Loan Account No", false, "Data", "build",
   "The lender&rsquo;s own reference for the loan. Not the employee&rsquo;s bank account, which is already on "
   + "the Employee master and is where a disbursement would land."],
  ["Loan Completed", false, "Check", "build",
   "Drawn read-only on their form — it is set by the schedule finishing, not by a person."],
  ["Do not auto complete", false, "Check", "build",
   "The override for the one above, and it exists because a loan can finish its schedule and still be owed: "
   + "a bounced deduction, a stopped month, an adjustment."],
  ["Loan Completed On", false, "Date", "build", "Stamped when it closes."],
  ["Loan Attachment", false, "<code>File</code>", "none",
   "Their form takes a file. Attaching one writes a <code>File</code> row on the site, and this page "
   + "proxies GET only — see <code>server/index.js</code>."],
];

/** How the schedule is computed. **Ours, not theirs** — their Interest Type
    list has never been opened. These three are what can be computed from a
    sanctioned amount, a rate and a term, and no more than that. */
export const LOAN_INTEREST = [
  ["free", "Interest free", "Nothing charged — and the case the perquisite columns are for."],
  ["reducing", "Reducing balance", "Interest on what is still owed. The EMI is level; the split inside it moves."],
  ["flat", "Flat", "Interest on the whole sanctioned amount for the whole term, spread evenly."],
];

/** The amortization grid, column for column.

    `seen` marks what the capture actually shows. It was scrolled to the right,
    so the first three columns below were off the left edge and are a reading of
    what a schedule has to carry to be one; the fourth is marked seen because
    the last three letters of its heading, "est", sit at the edge of the frame.

    The two spanned groups are theirs: LOAN BALANCE over three columns and
    PERQUISITES over four.

    **The four perquisite columns are the expensive finding on this screen.**
    Under sec 17(2)(viii) and Rule 3(7)(i) a loan given interest-free or under
    the notified rate is a taxable perquisite, valued at the State Bank rate on
    the first day of the year, applied to the maximum outstanding monthly
    balance, less whatever interest was actually charged. It is exempt in two
    cases only: an aggregate not exceeding ₹20,000, and treatment of a specified
    disease. So an interest-free advance of ₹50,000 is not a kindness with no
    paperwork — it is salary, it is TDS, and nothing in `hrms` or in the
    `lending` app computes it. That is a build, and it is the reason this grid
    is drawn here rather than described. */
export const LOAN_SCHED_COLS = [
  ["#", "n", false, ""],
  ["Due Date", "due", false, ""],
  ["Principal", "prin", false, ""],
  ["Interest", "int", true, ""],
  ["Manual", "manual", true, ""],
  ["EMI", "emi", true, ""],
  ["Principal", "balPrin", true, "Loan Balance"],
  ["Interest", "balInt", true, "Loan Balance"],
  ["Total", "balTot", true, "Loan Balance"],
  ["Perquisite Rate", "perkRate", true, "Perquisites"],
  ["Perquisite On", "perkOn", true, "Perquisites"],
  ["Perk Value", "perkVal", true, "Perquisites"],
  ["Perk Amount", "perkAmt", true, "Perquisites"],
];

/** Rule 3(7)(i)'s aggregate threshold: at or under this, no perquisite arises
    at all. Kept as a figure rather than written into a sentence, because it is
    quoted from memory in every argument about it and it has been amended. */
export const PERK_EXEMPT = 20000;
