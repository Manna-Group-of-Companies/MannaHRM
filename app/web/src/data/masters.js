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
   View Category button. Two things follow from that, and FACTOHR_SCREENS §9
   guessed both of them wrong.

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
 * @property {string} [count] which dashboard count answers it
 * @property {string} ico
 * @property {string} [maps] how it maps onto our side — HTML, hand-written here
 * @property {string} [why] why it exists over there, where nothing here answers it
 * @property {string} [miss] what has never been seen, and would settle it
 * @property {string} [hint] what it would have to be rebuilt as here
 */

/** @type {CategoryType[]} */
export const FH_CATEGORY_TYPES = [
  {name:"Company Name", code:"", field:"company", count:"companies", ico:"🏭",
   maps:'<code>Employee.company</code>, with a real <code>Company</code> doctype behind it'},
  {name:"Department", code:"P001", field:"department", count:"departments", ico:"🏢",
   maps:'<code>Employee.department</code>'},
  {name:"Designation", code:"", field:"designation", count:"designations", ico:"🎓",
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

/* The five buttons and the Data Import menu, in Factor HR's order. Four of them
   write, and this page proxies GET only — so they are drawn where Factor HR
   draws them and disabled with the reason on them, rather than quietly missing
   or, worse, present and inert. A holiday list is a document on the site. */
export const CAL_TOOLS = [
  ["new",    "New",    "＋", "Holiday lists are created on the ERPNext site. This page only reads — see app/README.md."],
  ["edit",   "Edit",   "✎", "Editing a holiday list changes who is expected at the gate, and that is a write. It belongs on the site."],
  ["delete", "Delete", "⊘", "Deleting a holiday list would leave everybody on it with no weekly off. Not from a dashboard."],
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
