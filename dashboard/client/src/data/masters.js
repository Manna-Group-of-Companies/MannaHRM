/** field · label · which count on the dashboard answers it · icon · is it a
    doctype of its own on our side.

    Nothing renders this today — the per-field cards it drew under Categories
    were dropped, because FH_CATEGORY_TYPES below already says the same thing a
    row at a time. Kept because the mapping itself is the finding: which of the
    five groupings ERPNext holds as a master of its own, and which are only a
    field on Employee with no list behind them. */
export const CATEGORY_FIELDS = [
  ["department",      "Department",      "departments",  "🏢", true],
  ["designation",     "Designation",     "designations", "🎓", true],
  ["grade",           "Grade",           null,           "▤", false],
  ["branch",          "Branch",          null,           "📍", false],
  ["employment_type", "Employment type", null,           "📄", false],
];

/* Factor HR's Categories, photographed 28 August 2026 — and it is not the
   screen the name suggested. Behind that menu item is `Category Type`: a
   master of masters, eight rows, each holding its own value list behind a
   View Category button — a second screen, photographed 29 August 2026: a plain
   Code / Description / Status list with its own toolbar and pager. Two things
   follow from that, and FACTOHR_SCREENS §9 guessed both of them wrong.

   It is not one Worker / Staff / Contract list, so there is no single field to
   map it onto. And two of the five rows visible are not groupings at all —
   Gratuity Applicable and LWF Applicable are statutory pay treatment, filed in
   the same table as Department and maintained by whoever maintains
   departments. ERPNext has neither as a category, so neither imports onto a
   field; both have to be rebuilt as rules.

   `field` is the ERPNext field the type reads onto, or null where nothing on
   our side answers it at all. */

/**
 * @typedef {Object} CategoryType
 * @property {string} name
 * @property {string} code
 * @property {string|null} field the ERPNext field it reads onto, or null
 * @property {string} [dt] the doctype holding those values on our side — what
 *   Add and Edit open. Absent where the type is a pay rule rather than a list.
 * @property {string} [count] which dashboard count answers it
 * @property {string} ico
 * @property {string} [maps] how it maps onto our side — HTML, hand-written here
 * @property {string} [why] why it exists over there, where nothing here answers it
 * @property {string} [miss] what has never been seen, and would settle it
 * @property {string} [hint] what it would have to be rebuilt as here
 */

/** @type {CategoryType[]} */
export const FH_CATEGORY_TYPES = [
  {name:"Company Name", dt:"Company", code:"", field:"company", count:"companies", ico:"🏭",
   maps:'<code>Employee.company</code>, with a real <code>Company</code> doctype behind it',
   /* Photographed 29 August 2026 — the first View Category anybody has opened,
      and it settles what that button does: a second screen, not an expansion.
      Their own pager says 6 entries; page 1 held these five, and the sixth has
      still not been seen. Kept as evidence rather than as a count, because the
      gap between their six and ours is the only thing this screen is for. */
   seen:["HI-TECH PRETREADS", "HI-TECH RUBBER INDUSTRIES", "MANNA GROUP H-QTRS",
         "MANNA RUBBER PRODUCTS PVT.LTD.", "MANNA TREADS PVT.LTD"],
   theirs:6},
  {name:"Department", dt:"Department", code:"P001", field:"department", count:"departments", ico:"🏢",
   maps:'<code>Employee.department</code>'},
  {name:"Designation", dt:"Designation", code:"", field:"designation", count:"designations", ico:"🎓",
   maps:'<code>Employee.designation</code>'},
  {name:"Gratuity Applicable", code:"", field:null, ico:"🏦",
   why:'Whether gratuity applies to a person. In Factor HR that is a <b>category</b> — set from this screen, by whoever maintains departments.',
   miss:'The list behind it: who is marked applicable, and on what rule. One View Category click in their tenant, and it has not been taken.',
   hint:'ERPNext has no such flag on <code>Employee</code>. hrms carries gratuity as a <code>Gratuity Rule</code> — a service threshold and a per-year entitlement — plus a payroll component. <b>So this does not import onto a field.</b> It has to be read as a rule and rebuilt as one, and the list of who is marked applicable is how you check the rule was written right.'},
  {name:"LWF Applicable", code:"", field:null, ico:"🏦",
   why:'Labour Welfare Fund, per person. A state levy, so the rate and how often it is deducted depend on where the employer is registered — which is why it is a flag on the person rather than one setting for the group.',
   miss:'Who is marked applicable, and which states are involved.',
   hint:'ERPNext handles LWF as a <b>salary component with its own condition</b>, not as a category, so again there is no field to import onto. Worth pinning down before payroll rather than after: one deduction row applied group-wide is wrong for somebody the moment two companies sit in two states.'},
];
/* Page 1 of 2. The count is theirs, read off the screen, and the gap between
   the two numbers is the point — see the panel below. */

export const FH_CAT_SEEN = 5;
export const FH_CAT_TOTAL = 8;

export const CAL_MONTHS = ["January","February","March","April","May","June","July",
                    "August","September","October","November","December"];

export const CAL_DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
/* How many entries a cell shows before it collapses the rest behind Factor
   HR's own "+ N more…". Two fits the cell at every width this page is used at. */
export const CAL_SHOWN = 2;

/* ---------------------------------------------------------------------------
   The day-type bar on every cell of Factor HR's calendar, photographed
   4 September 2026.

   **Their calendar labels every single day**, and that is what it is for: it is
   a day-type roster, not a list of holidays. Three labels are visible on their
   capture — `Week Off Full Paid Day` in orange on every Sunday, `Full Working
   Day` in blue on the other six, and `Gandhi Jayanthi` in green on 2 October.

   ERPNext has no such thing. A `Holiday List` holds holidays; every day not in
   it is a working day by omission, and nothing anywhere records what a day *is*
   or how it is paid. So two thirds of their vocabulary can be derived and one
   third cannot:

     Week off      derivable — `weekly_off` on the Holiday row says so.
     Holiday       derivable — it is a row in the list, and its description is
                   the name printed on their bar.
     Working day   derivable by omission, which is the honest form of it: a day
                   this list does not mention is a day people are expected in.

     **Full Paid**  not derivable, and deliberately not claimed. Their label
                   says how the week off is *paid*, and no field on either side
                   of this comparison carries that — not on the Holiday, not on
                   the Holiday List, not on the Employee. A bar reading "Week
                   Off Full Paid Day" here would be this dashboard asserting a
                   pay treatment nobody has told it. So the bar reads "Week Off"
                   and the legend says what was dropped and why.
   --------------------------------------------------------------------------- */

/** The three bars, as `[class, label]`. `work` is the one that is true of a day
    by omission, so it is the one drawn quietest — it is on twenty-six cells out
    of thirty and a calendar shouting the ordinary is a calendar nobody reads
    the exceptions off. */
export const CAL_WORK = "Full Working Day";
export const CAL_OFF = "Week Off";

/** Why their label is four words and ours is two. On the legend, where somebody
    comparing the two screens will be looking. */
export const CAL_PAID_WHY = "Factor HR's bar reads “Week Off Full Paid Day”. The pay half is dropped "
	+ "here rather than copied: nothing on an ERPNext Holiday, Holiday List or Employee records how a "
	+ "non-working day is paid, so a bar claiming it would be this dashboard inventing a pay treatment. "
	+ "The day type is derivable and is what is drawn.";

/** What a day with nothing in the list means, on the working-day bar itself. */
export const CAL_WORK_WHY = "Not a record — a day this holiday list does not mention. ERPNext holds holidays "
	+ "and says nothing about working days, so this bar is the absence of a holiday drawn as a fact, which "
	+ "is exactly what it is.";

/** What a calendar is on our side. The toolbar's three buttons open one. */
export const CAL_DT = "Holiday List";

/* The three buttons and the Data Import menu, in Factor HR's order. All of them
   write, and `Holiday List` is read-only on this API — `writable: null` in
   server/src/doctypes/registry.ts — so rather than sitting dead with the
   reason on a tooltip, each one opens the same job on the ERPNext site, where a
   holiday list is a document and where the rules that guard it actually run.
   A link rather than a form on purpose: the write path stays on the site, and
   the API token never has to leave the proxy. See CLAUDE.md §1.

   `needsList` marks the two that act on the list currently shown rather than on
   the doctype — with no holiday list on the site there is nothing for them to
   open, and they stay disabled. */
export const CAL_TOOLS = [
  {k: "new", label: "New", ico: "＋", needsList: false,
   tip: "Create a holiday list on the ERPNext site — this page only reads. Opens in a new tab."},
  {k: "edit", label: "Edit", ico: "✎", needsList: true,
   tip: "Open this holiday list on the ERPNext site. Editing it changes who is expected at the gate, so it is a write and it belongs there. Opens in a new tab."},
  {k: "delete", label: "Delete", ico: "⊘", needsList: true,
   tip: "Open this holiday list on the ERPNext site, where Menu → Delete removes it. Deleting one leaves everybody on it with no weekly off, so it is deliberately two steps rather than one click here."},
];

export const CTC_UNITS = ["Yearly","Monthly","Daily"];

export const CTC_BY = [["","(none)"],["company","Company"],["department","Department"],
                ["designation","Designation"],["grade","Grade"],["branch","Branch"]];

/* Why a control cannot do what its label promises. Shown when it is used
   rather than as a footnote, so the answer arrives where the question was
   asked. */
export const CTC_WHY = {
  incr: "With Increment History needs a dated salary revision per person. ERPNext keeps that in Salary Structure Assignment rows over time and our site has none, so there is no history to show — today's number is the only number.",
  attdays: "Based on Attendance Days needs generated Attendance, and there are 0 rows. It also needs the divisor — 26 days, calendar days, or working days — which is an attendance policy nobody has stated. That divisor is the difference between two payslips.",
  hidegroup: "Hide Wage Type Group hides the earning-head grouping in Factor HR's output. There is nothing to hide here: no earning heads have been loaded at all, which is the ask behind E1.",
  catcode: "Show Category Code In Place Of Description swaps a category's name for its code. Their Category Type master carries both — Department is code P001 — and ours carries only the name: ERPNext's Department, Designation and Branch are named documents with no separate code field. So there is no code to show in place of anything, and adding one is a Custom Field per master.",
  grouptotal: "Display Group Wise Total needs the grouping to exist before it can be totalled. Filter By above does group the output, and the total it would print is the sum of one number per person — which is the CTC already on the record, and blank on most of them.",
  qual: "Show Qualification reads the education rows on the record, which live in a child table. A list call cannot reach a child table, so this needs one document read per person — 161 requests to print one column. Worth doing for a filtered handful; not for everybody.",
  exp: "Show Experience is the same child table problem as Qualification, one table along: past employment sits in its own rows on the record. There is a second gap behind it — nothing on our side computes years of service into a number, and whether that means service here or total career is a question their column does not answer.",
  rating: "Show Rating has nothing behind it at all. Factor HR carries an appraisal rating per person — see the CTC Rating Data Import above, which is how it gets loaded — and ERPNext keeps appraisals in hrms, which was installed on this site only recently and holds no Appraisal rows. So this column would be empty for all 161 people.",
};

/* The five boxes under More options, photographed expanded on 31 August 2026.
   The earlier capture had the section collapsed and this page said so rather
   than inventing them; this is what was behind it.

   None of the five can be honoured, and each says why in CTC_WHY. That is the
   finding: three of them need a child table a list call cannot reach, one needs
   a code field ERPNext's masters do not have, and one needs an appraisal record
   that does not exist. */
export const CTC_MORE = [
  ["catcode",    "Show Category Code In Place Of Description"],
  ["grouptotal", "Display Group Wise Total"],
  ["qual",       "Show Qualification"],
  ["exp",        "Show Experience"],
  ["rating",     "Show Rating"],
];

/* Their CTC Rating Data Import is a menu, not a button — two items, both of
   them a file moving in or out. Copied as a menu for the same reason every
   other dead control here is copied: the shape of what is being replaced is
   the deliverable, and a button hides that there are two of them. */
export const CTC_RATING_MENU = [
  /* The reason here said "this page proxies GET only — see server/index.js",
     and both halves had gone stale: that file does not exist (the server is
     `server/src/`), and this API does write — allowlisted PUTs, drafts, and two
     file routes. The conclusion is unchanged and the accurate reason is the
     stronger one, so it is worth stating properly rather than softening: pay is
     unwritable **by name**. */
  ["upload", "⬆", "Upload Rating from Excel file",
   "<b>This writes salary.</b> A spreadsheet loaded onto CTC is the one action on this page that could "
   + "pay somebody the wrong amount without anybody noticing. This API does write — but only what "
   + "<code>server/src/doctypes/registry.ts</code> names, field by field, and what it names on "
   + "<code>Employee</code> is five document numbers. <code>ctc</code> is not on that list, and it is "
   + "off it deliberately: an allowlist is the way round that fails safe, so a pay field stays "
   + "unwritable until somebody says otherwise in that file. It wants a rule on the site in front of "
   + "it rather than a file picker on a dashboard."],
  ["template", "⬇", "Download Rating Upload Template",
   "The columns are ours rather than theirs: Factor HR's own template has never been seen, so this is "
   + "what a rating import would need here — who, how much, from when. Where the ratings then land is "
   + "still open. hrms keeps them on an <code>Appraisal</code>, which exists on this site and holds no "
   + "rows, and whether that is the right home is a question in <code>docs/OPEN_QUESTIONS.md</code>. "
   + "Filling this in is useful either way: the collecting is the slow part, and the file outlives "
   + "whatever it is eventually loaded into."],
];


/* ---------------------------------------------------------------------------
   The ↑ on Categories, which is a menu rather than a button — photographed
   4 September 2026: **Data import from file** and **Download template**.

   It is on both of that screen's headers, the Category Type list and the View
   Category drill behind it, and the two items do not mean the same thing on the
   two screens. That is the same split the + Add beside them already makes:

     On the **drill**, the master is real — a `Company`, a `Department`, a
     `Designation` on the site — so both items work. Import opens ERPNext's
     Data Import; the template is written here, carrying what the site already
     holds so nobody retypes it.

     On the **list**, the master would be a Category Type, and there is no such
     doctype here. Import still works, because Data Import asks which doctype to
     load into and the answer is one of the three behind the rows. The template
     does not: a template of category types is a file with no doctype to load
     into, and writing one would be inventing a schema in a header row.
   --------------------------------------------------------------------------- */

/** `[key, icon, label, why]` — their two items in their order.

    Two screens draw them now, Categories and Calendar, so the table is one
    and `ImportMenu` in components/ui.jsx is the control. The `why` on each is
    general enough to be true on both: what the import does is the same act on
    either, and what the template holds is said by the screen that writes it.

    The glyphs are deliberately **not** the same mark twice. Theirs are, and
    two identical icons on two adjacent rows is two controls nobody can tell
    apart at a glance; the same call this repo made on Create Letters, where
    three near-identical sheets became a folder, a sheet and an arrow. One
    points into the site and one points out of it, and that is the difference
    worth drawing. */
export const IMPORT_MENU = [
	["import", "up", "Data import from file",
		"ERPNext's Data Import: a spreadsheet in, master records out, with a preview and an error report "
		+ "of its own. It writes on the site, under the site's validation — which is where a bulk write "
		+ "belongs and why this is a link rather than a file picker here."],
	["template", "down", "Download template",
		"The columns Data Import wants, with what the site already holds already in them — so a new value "
		+ "is a row added at the bottom rather than a list retyped. The ID column is Frappe's own: rows "
		+ "carrying one are what an Update Existing Records import matches on, and a row with it left "
		+ "blank is a new record."],
];

/** Why Download template is dead on the outer screen. The import beside it is
    not, and the difference is worth being exact about — see the note above. */
export const CAT_TEMPLATE_DEAD = "This screen lists category types, and there is no Category Type doctype "
	+ "on this site for a template to load into — the eight rows are Factor HR's own master. Open one with "
	+ "View Category: the template there is for the doctype that type reads onto, and it is real.";

/* ---------------------------------------------------------------------------
   Salary Master → the revision form, photographed 31 August 2026.

   This is what their + opens: one person, one effective date, and every wage
   type they carry laid out as a form — CTC Wise Input on its own, then Salary
   Structure split into five numbered groups. Five columns: the wage type, a
   Pay Basis list reading Monthly on every row, an Amount box, the pair headed
   ANNUALLY / MANUALLY, and Reference / Remarks. Two buttons at the foot, SAVE
   and SAVE & UPDATE FUTURE REVISIONS.

   **This is the screen the whole payroll estimate turns on.** Everything else
   photographed so far reads; this one writes, and what it writes is what people
   are paid. Nearly every row below is a `Salary Component` on our side — except
   the ones that are not, and those are the finding. Nine are not a component at
   all: three totals sitting among the inputs that make them, two gratuity rows
   hrms derives from a rule and length of service, TDS, a leave encashment that
   is a document of its own, an accounting provision that is not pay, and one
   head nobody has been able to expand. Two more are components filed in the
   wrong group — EMPLOYEE ESI CTC and EMPLOYEE PF CTC come out of the employee's
   pay, under a heading reading COMPANY CONTRIBUTION.

   **A migration that maps this table row-for-row onto components gets all
   eleven wrong**, and gets them wrong in somebody's favour or against it.

   `map` is what stands behind the row here and `why` is the reason; both are
   read in a tooltip, so both are plain text with no markup. `nosum` marks a row
   that must not be added into its own group's subtotal — see NET PAY CTC.
   --------------------------------------------------------------------------- */

/**
 * @typedef {Object} SalRevRow
 * @property {string} [head] an outer heading — CTC Wise Input, Salary Structure
 * @property {string} [grp] a numbered group inside Salary Structure
 * @property {number} [n] the number in their left gutter, on `grp` rows
 * @property {boolean} [unseen] a row the captures do not cover
 * @property {string} [desc] the wage type, exactly as their column writes it
 * @property {string} [map] what stands behind it here, or "derived" / "not resolvable"
 * @property {string} [why] why that is the mapping — plain text, read in a tooltip
 * @property {boolean} [nosum] keep it out of its group's subtotal
 */

/** @type {SalRevRow[]} */
export const SAL_REV_ROWS = [
  { head: "CTC Wise Input" },
  { desc: "CTC TOTAL", map: "Employee.ctc", nosum: true,
    why: "The one pay figure this site already holds, and the only one on the record. It is yearly "
       + "there and their Pay Basis reads Monthly here, so the two are a conversion apart that "
       + "nobody has stated. Kept out of the subtotal: it is the total, not a line in it." },
  { desc: "GRATUITY AMOUNT MANUAL", map: "Gratuity Rule",
    why: "hrms computes gratuity from length of service and a per-year entitlement. Manual says "
       + "theirs does not, so an import carries a number where ours would carry a rule — and the "
       + "two disagree the first time somebody's service length changes." },
  { desc: "HEALTH INSURANCE CTC", map: "Salary Component, Do Not Include in Total",
    why: "Employer cost carried inside the CTC rather than money that reaches a bank account. It "
       + "belongs in the structure with that flag set, not as an earning." },
  { desc: "MONTHLY GROSS", map: "derived", nosum: true,
    why: "Gross is the sum of the earning rows on our side, not a field anybody types. A typed "
       + "gross that disagrees with the rows below it is a difference the first payslip finds." },

  { head: "Salary Structure" },

  { grp: "REGULAR EARNING", n: 1 },
  { desc: "BASIC SALARY", map: "Salary Component, Earning",
    why: "The base most other things are a percentage of — PF, gratuity and the HRA exemption all "
       + "read off it, so it is the one row whose value moves five others." },
  { desc: "CONVEYANCE ALLOWANCE" },
  { desc: "DA", map: "Salary Component, Earning",
    why: "Dearness allowance. It joins basic for PF and for gratuity, which is why it is a row of "
       + "its own rather than folded into basic." },
  { desc: "EDUCATION ALLOWANCE" },
  { desc: "FOOD ALLOWANCE" },
  { desc: "HOUSE RENT ALLOWANCE", map: "Salary Component + Employee Tax Exemption Declaration",
    why: "Paid as a component, but the exemption against it is claimed on a separate declaration "
       + "carrying the rent actually paid. One row there is two documents here." },
  { desc: "LEAVE TRAVEL ALLOWANCE", map: "Salary Component + Employee Tax Exemption Declaration",
    why: "The same split as HRA: paid as a component, exempted on a declaration with proof." },
  { desc: "MEDICAL ALLOWANCE" },
  { desc: "OTHER ALLOWANCE" },
  { desc: "SPECIAL ALLOWANCE", map: "Salary Component, Earning",
    why: "Usually the balancing figure — whatever is left of the gross once the named heads are "
       + "set. If theirs is a formula rather than an amount, the formula is what has to come across." },

  { grp: "VARIABLE EARNING", n: 2 },
  { desc: "LEAVE ENCASHMENT", map: "Leave Encashment",
    why: "A document of its own in hrms, raised against a leave balance and posted into payroll. "
       + "Not a standing row on a structure, which is what a value typed here would make it." },
  { desc: "OTHER INCOME" },
  { desc: "OVERTIME", map: "Salary Component, Earning",
    why: "It needs hours before it needs a rate, and the hours come out of Employee Checkin. "
       + "Nothing on this side computes them yet, so a rate typed here has nothing to multiply." },

  { grp: "STATUTORY DEDUCTION", n: 3 },
  { desc: "EPS CONTRIBUTION ARREARS MANUAL", map: "Salary Component, Deduction",
    why: "The pension slice of the employer's PF contribution, in arrears. Derived from basic + DA "
       + "against a wage ceiling on our side, typed on theirs." },
  { desc: "ESIC EMPLOYEE CONTRIBUTION MANUAL", map: "Salary Component with a condition",
    why: "ESI applies below a gross wage ceiling and stops above it, so it is a condition rather "
       + "than an amount — and the ceiling moves by notification, not by revision." },
  { desc: "LWF MANUAL", map: "Salary Component with a condition",
    why: "Labour Welfare Fund. A state levy, so the rate and how often it is deducted depend on "
       + "where the employer is registered. See the LWF Applicable row on Categories — the same "
       + "finding arrived at from the other end." },
  { desc: "MPF CONTRIBUTION MANUAL", map: "not resolvable",
    why: "What MPF stands for is not readable off the capture and it is not a standard Indian "
       + "statutory head. Nothing is invented in its place; one question to HR settles it." },
  { desc: "PROF. TAX MANUAL", map: "Salary Component with a condition",
    why: "Professional tax is a state slab on gross, and two companies in two states owe different "
       + "amounts. One deduction row applied group-wide is wrong for somebody on day one." },
  { desc: "TDS MANUAL", map: "Income Tax Slab + Employee Tax Exemption Declaration",
    why: "hrms computes TDS from a slab, the declared exemptions, and what has already been "
       + "deducted this year. Manual says theirs is typed — a figure rather than a calculation, "
       + "which does not import onto anything." },

  { grp: "COMPANY CONTRIBUTION", n: 4 },
  { desc: "BONUS CTC" },
  { desc: "EMPLOYEE ESI CTC", map: "Salary Component, Deduction",
    why: "An employee deduction, filed under COMPANY CONTRIBUTION. It comes out of the person's "
       + "pay rather than out of the employer's, so this group's total is not employer cost." },
  { desc: "EMPLOYEE PF CTC", map: "Salary Component, Deduction",
    why: "The same as the ESI row above: the employee's own 12%, deducted from pay and grouped "
       + "here with the employer's contributions." },
  { desc: "EMPLOYER EDLI CTC" },
  { desc: "EMPLOYER ESI CTC" },
  { desc: "EMPLOYER PF ADMIN CHARGES CTC" },
  { desc: "EMPLOYER PF CTC" },
  /* One row sits between these two and the two captures overlap short of it, so
     its label is the only thing on this screen nobody has read. The group runs
     in alphabetical order, which puts it after EMPLOYER PF CTC and before
     GRATUITY CONTRIBUTION CTC. Recorded rather than guessed: one screenshot
     settles it, and a row invented here would be a wage type nobody owes. */
  { unseen: true },
  { desc: "GRATUITY CONTRIBUTION CTC", map: "Gratuity Rule",
    why: "The monthly accrual towards gratuity, carried in the CTC. hrms derives it from the rule "
       + "rather than holding it as a component, so there is no field to import this onto." },
  { desc: "NET PAY CTC", map: "derived", nosum: true,
    why: "Net pay is what is left after the deductions above — a total, sitting in a group of "
       + "contributions. Adding it into this group's subtotal would count the whole salary twice, "
       + "so it is left out of the arithmetic and the subtotal row says so." },
  { desc: "PROF TAX CTC", map: "Salary Component, Deduction",
    why: "The same professional tax as the deduction row above, restated as CTC. Whether the two "
       + "are one figure shown twice or two different figures is not answerable from a blank form." },

  { grp: "PROVISION", n: 5 },
  { desc: "BONUS PROVISION", map: "not payroll",
    why: "A provision is money set aside in the accounts against a bonus not yet paid — a journal "
       + "entry, not a salary component. It reaches nobody's bank account in the month it is "
       + "raised, and it is the one row on this form that is accounting rather than pay." },
];

/** How many rows on the form take a figure. Counted off the list rather than
    written down beside it, so the two cannot drift. */
export const SAL_REV_FIELDS = SAL_REV_ROWS.filter((r) => r.desc).length;

/** The rows that are not a `Salary Component` here at all — derived from the
    mappings rather than written down beside them, so a number quoted on screen
    cannot drift from the rows that justify it.

    `Salary Component, …` covers the ordinary earnings and deductions, the two
    that need a tax declaration alongside, and the conditional statutory heads.
    What is left over is a field on the employee, a rule hrms computes, a
    document of its own, a total, an accounting entry, and the one head nobody
    has expanded — and every one of those is a row an import has to handle
    rather than map. */
export const SAL_REV_ODD = SAL_REV_ROWS.filter(
  (r) => r.desc && r.map && !r.map.startsWith("Salary Component"),
);

/* Their Pay Basis list reads Monthly on every row and it has never been opened,
   so Monthly is all there is to offer. A second value invented here would
   change what every amount on the form means. */
export const SAL_REV_BASIS = ["Monthly"];

/* The pair of headings between Amount and Reference / Remarks, drawn in two
   different colours on their screen and blank in every row of a blank form.
   ANNUALLY is read as the yearly figure — the one thing that can honestly go in
   a derived column beside a monthly amount — and MANUALLY as the flag its name
   implies, given how many wage types above end in that same word.

   Both are readings, and they are written out here rather than buried in the
   markup precisely because they are: one capture of a filled-in form settles
   both in a single look. */
export const SAL_REV_ANNUALLY =
  "Read as the yearly figure: the Amount at twelve times, since Pay Basis says Monthly. Computed "
  + "here rather than typed. Their column is blank in a blank form, so this is a reading of the "
  + "heading and not something anybody has seen filled in.";

export const SAL_REV_MANUALLY =
  "Read as a flag: this amount was entered by hand rather than derived from the CTC. Six wage "
  + "types on this form already end in MANUAL, which is what the reading rests on. Nothing here "
  + "acts on it — it is kept in the draft and written into the export, and no more.";

/* Their two buttons. Both write, and neither can write from here — no payroll
   doctype is on the proxy's allowlist at all (server/index.js). So each says what
   it would do and where it can actually be done, which is the same bargain
   every other write on this dashboard makes.

   The second one is the dangerous one and it is worth the extra sentence: it
   does not save a revision, it rewrites every later one as well. On our side a
   dated revision is a Salary Structure Assignment per person per date, so their
   one click is N documents amended here — and if it runs across a payroll that
   has already been submitted, it changes the basis of pay somebody has been
   given. */
export const SAL_REV_SAVE = [
  { k: "save", label: "SAVE", pri: true,
    why: "Saves this revision against the effective date above. On our side that is one "
       + "<code>Salary Structure Assignment</code> — the structure, the person, the date it takes "
       + "effect from — and the structure it would attach to does not exist yet." },
  { k: "future", label: "SAVE & UPDATE FUTURE REVISIONS",
    why: "Saves this one <b>and rewrites every dated revision after it</b>. That is one click there "
       + "and N documents here, one per later date, each of which has to be cancelled and "
       + "re-made. Worse, a later date that has already been paid means amending the basis of a "
       + "payslip somebody has already had. This is the single most expensive button on the "
       + "system being replaced, and it wants an approval in front of it rather than a "
       + "confirmation dialog." },
];

/* ---------------------------------------------------------------------------
   What each wage type becomes on the site when SAVE writes.

   The site was surveyed again on 31 August 2026 and `hrms` **is** installed now
   — docs/SITE_SURVEY.md line 17 still says it is not, and that line is stale.
   Payroll itself is empty: 161 Employees, and zero Salary Structures, zero
   Assignments, zero Slips. Seven Salary Components exist, all of them hrms's
   own defaults, so twenty-five of these thirty-one are created on first save.

   Three things this table decides, and each is a way to pay somebody wrongly:

   `skip` is the rows that are **totals of the rows around them**. CTC TOTAL,
   MONTHLY GROSS and NET PAY CTC are sums, not lines in one, and writing a sum
   as a component counts the same money twice. CTC TOTAL is not lost — it
   becomes the assignment's `base`, which is what hrms means by the same idea.

   `ctc` is employer cost carried inside the CTC rather than money that reaches
   a bank account. Those are written with `do_not_include_in_total`, so they sit
   on the structure, show in the CTC, and change nobody's net pay. Get this flag
   wrong on EMPLOYER PF CTC and the employer's contribution is paid to the
   employee as salary.

   `kind` decides which half of the structure a row lands in. Note the two rows
   filed under COMPANY CONTRIBUTION that are `Deduction` — EMPLOYEE ESI CTC and
   EMPLOYEE PF CTC come out of the person's own pay despite the heading they sit
   under. That is their form's filing, not ours, and it is why this table is
   explicit for all thirty-four rows rather than derived from the group.

   Names are title case rather than the form's capitals: this is the vocabulary
   that ends up on a payslip. Where hrms already ships the component, its name
   is used verbatim — `Basic`, not `Basic Salary` — so nothing is created twice
   under two spellings. `tests/salary.test.js` checks every row is covered. */

/** @typedef {object} SalRevComp
 * @property {string} [comp] the Salary Component this row is written to
 * @property {"Earning"|"Deduction"} [kind] which half of the structure
 * @property {boolean} [ctc] employer cost — written `do_not_include_in_total`
 * @property {string} [skip] why this row is never written as a component
 */

/** @type {Record<string, SalRevComp>} */
export const SAL_REV_COMP = {
	/* CTC Wise Input */
	"CTC TOTAL": { skip: "a total, not a line in one — it is written as the assignment's base" },
	"GRATUITY AMOUNT MANUAL": { comp: "Gratuity Amount Manual", kind: "Earning", ctc: true },
	"HEALTH INSURANCE CTC": { comp: "Health Insurance CTC", kind: "Earning", ctc: true },
	"MONTHLY GROSS": { skip: "gross is the sum of the earning rows — hrms computes it" },

	/* 1 REGULAR EARNING */
	"BASIC SALARY": { comp: "Basic", kind: "Earning" },
	"CONVEYANCE ALLOWANCE": { comp: "Conveyance Allowance", kind: "Earning" },
	"DA": { comp: "DA", kind: "Earning" },
	"EDUCATION ALLOWANCE": { comp: "Education Allowance", kind: "Earning" },
	"FOOD ALLOWANCE": { comp: "Food Allowance", kind: "Earning" },
	"HOUSE RENT ALLOWANCE": { comp: "House Rent Allowance", kind: "Earning" },
	"LEAVE TRAVEL ALLOWANCE": { comp: "Leave Travel Allowance", kind: "Earning" },
	"MEDICAL ALLOWANCE": { comp: "Medical Allowance", kind: "Earning" },
	"OTHER ALLOWANCE": { comp: "Other Allowance", kind: "Earning" },
	"SPECIAL ALLOWANCE": { comp: "Special Allowance", kind: "Earning" },

	/* 2 VARIABLE EARNING */
	"LEAVE ENCASHMENT": { comp: "Leave Encashment", kind: "Earning" },
	"OTHER INCOME": { comp: "Other Income", kind: "Earning" },
	"OVERTIME": { comp: "Overtime", kind: "Earning" },

	/* 3 STATUTORY DEDUCTION */
	"EPS CONTRIBUTION ARREARS MANUAL": { comp: "EPS Contribution Arrears", kind: "Deduction" },
	"ESIC EMPLOYEE CONTRIBUTION MANUAL": { comp: "ESIC Employee Contribution", kind: "Deduction" },
	"LWF MANUAL": { comp: "Labour Welfare Fund", kind: "Deduction" },
	"MPF CONTRIBUTION MANUAL": { comp: "MPF Contribution", kind: "Deduction" },
	"PROF. TAX MANUAL": { comp: "Professional Tax", kind: "Deduction" },
	"TDS MANUAL": { comp: "Income Tax", kind: "Deduction" },

	/* 4 COMPANY CONTRIBUTION — two of these are the employee's own money. */
	"BONUS CTC": { comp: "Bonus CTC", kind: "Earning", ctc: true },
	"EMPLOYEE ESI CTC": { comp: "Employee ESI CTC", kind: "Deduction" },
	"EMPLOYEE PF CTC": { comp: "Provident Fund", kind: "Deduction" },
	"EMPLOYER EDLI CTC": { comp: "Employer EDLI CTC", kind: "Earning", ctc: true },
	"EMPLOYER ESI CTC": { comp: "Employer ESI CTC", kind: "Earning", ctc: true },
	"EMPLOYER PF ADMIN CHARGES CTC": { comp: "Employer PF Admin Charges CTC", kind: "Earning", ctc: true },
	"EMPLOYER PF CTC": { comp: "Employer PF CTC", kind: "Earning", ctc: true },
	"GRATUITY CONTRIBUTION CTC": { comp: "Gratuity Contribution CTC", kind: "Earning", ctc: true },
	"NET PAY CTC": { skip: "net pay is what is left after the deductions above — a total" },
	"PROF TAX CTC": { comp: "Prof Tax CTC", kind: "Earning", ctc: true },

	/* 5 PROVISION */
	"BONUS PROVISION": { comp: "Bonus Provision", kind: "Earning", ctc: true },
};

/* The wage types whose figure would be double-counted against another row on
   the same form — their form carries professional tax, ESI and PF twice, once
   as a deduction and once restated as CTC. Only one of each pair moves money.
   Typing both is a mistake worth a sentence before a draft is written, not a
   refusal: it is their form that asks twice. */
export const SAL_REV_TWINS = [
	["PROF. TAX MANUAL", "PROF TAX CTC"],
	["ESIC EMPLOYEE CONTRIBUTION MANUAL", "EMPLOYEE ESI CTC"],
];

/* ---------------------------------------------------------------------------
   Factor HR's List of Employees, photographed 31 August 2026 — the panel their
   Salary Master opens, and the same nine columns their Employee Master lists.

   Their capture reads "Showing 11 to 20 of 506 entries" over 51 pages, so ten
   to a page, and a running number down the left that counts across pages rather
   than restarting. Both are copied: a pager that renumbers from 1 on every page
   cannot be read out over a phone, which is what that column is for.

   Two of the nine have nothing behind them on this site. **`Employee` here
   carries no PAN and no Aadhaar field at all** — checked against the live
   doctype on 31 August 2026, not inferred. They are drawn anyway, empty and
   labelled, because the gap is the deliverable: a column quietly dropped is a
   column nobody remembers to ask for. Note theirs is barely filled either —
   every PAN in the capture reads `PANNOTAVBL`, and Aadhaar is blank on eight of
   the ten rows.

   `get` names the fields in preference order; the first with a value wins. That
   is how EMAIL works on our side: ERPNext keeps three, and Frappe's own
   `prefered_email` is the one it treats as the address. */

/** @typedef {object} EmpListCol
 * @property {string} key
 * @property {string} label their column heading, their capitals
 * @property {string[]} [get] Employee fields, in preference order
 * @property {"date"|"text"} [kind] how its filter box behaves
 * @property {string} [none] why this site has nothing behind the column
 */

/** @type {EmpListCol[]} */
export const EMP_LIST_COLS = [
	{ key: "code", label: "EMPCODE", get: ["employee_number", "name"] },
	{ key: "name", label: "EMPLOYEE NAME", get: ["employee_name"] },
	{ key: "doj", label: "DATE OF JOINING", get: ["date_of_joining"], kind: "date" },
	{ key: "status", label: "STATUS", get: ["status"] },
	{ key: "email", label: "EMAIL", get: ["prefered_email", "company_email", "personal_email"] },
	{ key: "mobile", label: "MOBILE NO", get: ["cell_number"] },
	{
		key: "aadhaar", label: "AADHAR NO",
		none: "This site's Employee doctype has no Aadhaar field — checked against the live doctype "
			+ "on 31 August 2026. Adding one is a Custom Field, and it is worth asking first whether "
			+ "the number should be held at all: it is the most sensitive identifier on the form and "
			+ "the one with the most rules attached to storing it.",
	},
	{
		key: "pan", label: "PAN NO",
		none: "This site's Employee doctype has no PAN field either. Note theirs is barely filled "
			+ "in: every row in the capture reads PANNOTAVBL, which is Factor HR's own way of "
			+ "writing \"not available\".",
	},
];

/** Their pager: ten rows to a page, and the running number counts across them. */
export const EMP_LIST_SIZE = 10;

/* ---------------------------------------------------------------------------
   **New** on the Employees calendar — Factor HR's create screen, photographed
   4 September 2026.

   It is the same screen with three differences, and each of them says what the
   screen is now for:

     · the toolbar collapses to **Save** and **Cancel**;
     · Calendar Name becomes an empty box you type into, where the view screen
       picks one that exists;
     · the grid is **empty** — no bars at all — with **Set Default Status**
       added beside Go To Month.

   An empty grid is the whole point: nothing is a working day or a week off
   until somebody says so. Their Set Default Status is closed in the capture, so
   what it offers is a reading rather than a copy — the three day types the view
   screen already draws are what a day can be, so those are what it sets.

   ## Save cannot write, and the reason is not the usual one

   Everything else on this dashboard that cannot write is stopped by the field
   allowlist. This is stopped a step earlier: `Holiday List` is
   `creatable: false` in server/src/doctypes/registry.ts, and it is off that
   list on purpose — a holiday list decides who is expected at the gate, and the
   toolbar on the view screen has said so since it was built.

   So Save does the thing a browser tab can do honestly: it writes the file
   Frappe's Data Import loads, with a row per day picked, and offers the desk
   beside it. The picking is the slow part and the file outlives whatever loads
   it — the same argument the CTC rating template makes.
   --------------------------------------------------------------------------- */

/** What a day can be. `weekly_off` is the field on the Holiday row that tells
    the last two apart; a working day is not a row at all, which is why it has
    no fields beside it. */
export const CAL_BRUSHES = [
	["work", "Full Working Day", "Not a row on the list. A day the holiday list does not mention is a day "
		+ "people are expected in, so painting a day back to working removes it rather than adding "
		+ "anything."],
	["off", "Week Off", "A Holiday row with `weekly_off` set. Their label reads Week Off Full Paid Day; the "
		+ "pay half is not on any record here — see CAL_PAID_WHY."],
	["hol", "Named Holiday", "A Holiday row with a description and `weekly_off` clear. The name is what "
		+ "prints on the bar and what travels into the .ics export, so it is asked for rather than "
		+ "defaulted."],
];

/** The one bulk action on this screen, and it is not decoration: `weekly_off`
    exists on ERPNext's Holiday row precisely because a weekly off is a rule
    rather than fifty-two decisions, and Frappe's own Holiday List form has a
    Get Weekly Off Dates button that does this. Painting fifty-two Sundays one
    at a time is not a thing anybody should be asked to do. */
export const CAL_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The columns of the file Save writes.

    Frappe's Data Import addresses a child table as `<parentfield>.<fieldname>`,
    so the three holiday columns carry the `holidays.` prefix and the first
    three are the parent's own. One row per day picked; the parent's name and
    dates repeat down the file, which is what Data Import expects of a document
    with child rows.

    **The header row is where this gets checked, not here.** Data Import shows a
    column mapping and a preview before it writes anything, which is the whole
    reason this is a file handed to that wizard rather than a POST from a
    browser tab. */
export const CAL_IMPORT_COLS = [
	"holiday_list_name", "from_date", "to_date",
	"holidays.holiday_date", "holidays.description", "holidays.weekly_off",
];


/* ---------------------------------------------------------------------------
   Delete, on the calendar toolbar.

   It opened the ERPNext desk until 4 September 2026, with a note saying it was
   deliberately two steps rather than one click. **The two steps are still
   there** — this asks before it acts, and the site refuses the dangerous case
   outright — but they now both happen here, because the refusal is the
   interesting half and sending somebody to another tab to be refused is a poor
   way to deliver it.

   `Holiday List` became deletable on the server the same day, behind three
   guards: `Employee.holiday_list`, `Company.default_holiday_list` and
   `ShiftType.holiday_list`. Anything pointing at a calendar refuses the delete
   and the refusal names how many, which is the whole reason this is safe to put
   on a toolbar. See server/src/doctypes/registry.ts, where the argument is.

   What makes it worth guarding rather than merely confirming: an employee with
   no holiday list has no weekly off, so the shift job expects them at the gate
   on a Sunday and marks them absent when they do not come. It costs them the
   day, and nothing on either system says why.
   --------------------------------------------------------------------------- */

export const CAL_DEL_WHY = "Delete this calendar. The site refuses while anybody is on it — an employee "
	+ "with no holiday list has no weekly off, so the shift job expects them at the gate on a Sunday and "
	+ "marks them absent — and the refusal says how many are in the way.";

/** What the confirm asks, in the words that make the consequence the question
    rather than the act. "Are you sure" is a question nobody reads; "N people
    are on this calendar" is one they answer. */
export const calDelAsk = (name, n) =>
	n
		? `${n} active ${n === 1 ? "person is" : "people are"} on ${name}. The site will refuse this — `
			+ "delete it anyway to see what it says?"
		: `Delete ${name}? Nothing here is on it, so nothing loses its weekly off.`;

/** An untouched create screen, and the only definition of one.

    A function rather than an object for the reason `NEW_EMP_BLANK` is one: two
    callers sharing a mutable literal is how a cleared month comes back holding
    the last calendar's picked days.

    `brush` opens on Week Off because that is what a new holiday list is mostly
    made of — fifty-two of them and a dozen festivals — and the first thing
    anybody does on this screen is mark the weekend. */
export const CAL_NEW_BLANK = () => ({
	/* "", "new" or "edit". Not a boolean, because the two modes differ in three
	   places — what Save writes, what Cancel throws away, and whether the name
	   can be changed — and a boolean plus a second flag is two things to keep
	   in step where one word is one. */
	on: "", src: "", name: "", dflt: false, brush: "off", holname: "", days: {}, msg: "",
});

export const CAL_NEW_WHY = "Factor HR's create screen: name the calendar, then give days a status on an "
	+ "empty month. `Holiday List` is not creatable through this API — it decides who is expected at the "
	+ "gate — so Save writes the file ERPNext's Data Import loads, and that wizard previews every row "
	+ "before it writes.";

export const CAL_EDIT_WHY = "Opens this calendar's real days on the same grid the New screen uses — click a "
	+ "date to change what it is, and Save writes the file that carries the change to the site. `Holiday "
	+ "List` is read-only through this API (`writable: null` in registry.ts) because editing one changes "
	+ "who is expected at the gate; the editing happens here and the writing happens there.";

/** The `ID` column, and why an edit carries one where a create does not.

    Frappe's Data Import matches an *Update Existing Records* run on `ID` — the
    document's own name. Without it the same file is an insert and makes a
    second calendar beside the first.

    **The child rows are the part to read the preview for.** Frappe matches
    existing child rows by their own row id, which a read through this API does
    not carry, so rows in this file arrive without one and Data Import appends
    them rather than replacing what is there. For a calendar that means the days
    are added to the days already on it. That is a real hazard and it is said on
    the Save button rather than discovered afterwards: the safe path is Data
    Import's preview, which shows exactly what it is about to do. */
export const CAL_EDIT_ID = "ID";

export const CAL_EDIT_SAVE_WHY = "Writes this calendar's days as a Data Import file, with the ID column so "
	+ "an Update Existing Records run finds the calendar rather than making a second one. **Check the "
	+ "preview before it writes:** Frappe matches child rows by a row id this API does not read, so these "
	+ "days arrive as additions to the ones already on the list rather than as a replacement of them.";


/* ---------------------------------------------------------------------------
   Download template, on the Calendar toolbar.

   The same two items as Categories, and the template is the one the New and
   Edit screens already write — see CAL_IMPORT_COLS. Pre-filled with the days
   the calendar on screen actually carries, for the reason every other template
   in this repo is: a file of bare headings makes somebody retype a list they
   already have, and a mistyped date is a holiday on the wrong day.

   It carries the `ID` column, so a loaded file updates the calendar it came
   from rather than making a second one beside it — and the same caveat applies
   as on Edit's Save: Frappe matches child rows by a row id this API does not
   read, so Data Import's preview is where a round trip gets checked.
   --------------------------------------------------------------------------- */

export const CAL_TEMPLATE_WHY = "The days this calendar carries, in the columns ERPNext's Data Import "
	+ "wants and with the ID column so a loaded file updates this calendar rather than making another. "
	+ "Add a day as a row at the bottom. Check the preview: Frappe matches child rows by a row id this "
	+ "API does not read, so rows arrive as additions to the days already on the list.";

export const CAL_TEMPLATE_DEAD = "There is no calendar on this site to write a template for. A template "
	+ "of bare headings would be a file with no doctype behind it on a page that cannot say what one "
	+ "should hold.";