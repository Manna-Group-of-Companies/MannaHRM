/** field · label · which count on the dashboard answers it · icon · is it a
    doctype of its own on our side. */
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

/** What a calendar is on our side. The toolbar's three buttons open one. */
export const CAL_DT = "Holiday List";

/* The three buttons and the Data Import menu, in Factor HR's order. All of them
   write, and this page proxies GET only — so rather than sitting dead with the
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
};
