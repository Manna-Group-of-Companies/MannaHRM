/* ---------------------------------------------------------------------------
   Factor HR's approval queue, tab for tab and in its order — screenshot of
   28 Aug 2026 reads: Leave 3 · Attendance 50 · Employee Profile 0 ·
   Onboarding 0 · Transfer & Promotion 0 · Letter Assignment 0 · Other.

   The five empty queues are pages here rather than greyed-out buttons. What is
   actually being agreed with HR is each queue's *field list* — and a field list
   nobody can open is a field list nobody checks. Every field carries its own
   state, so "the page exists" is never mistaken for "the queue works".

   This is content, not code: the notes are hand-written HTML because several of
   them need an arrow or a <code> span, and they are rendered as such. They are
   authored in this file and never come off the wire, which is the whole of why
   that is safe.
   --------------------------------------------------------------------------- */

/**
 * Field, type, state, note — the four columns of every spec table.
 *
 * The state is a plain string rather than the `FieldState` union: several rows
 * carry a key that is not one of the three, and the chip falls back to "To
 * build" rather than the page falling over.
 * @typedef {[string, string, string, string]} SpecRow
 */

/**
 * @typedef {Object} Queue
 * @property {string} k
 * @property {string} l
 * @property {import("@/lib/types").Cov} cov
 * @property {string} ico
 * @property {string} kind
 * @property {string} src which doctype the queue reads, in prose
 * @property {string} [doctype] which doctype a decision would be written to,
 *   when there is one
 * @property {string[]} [tpl] the header row an import would have to match, in
 *   the doctype's own fieldnames — not this page's labels, which would import
 *   as nothing
 * @property {"grid"} [view] Factor HR's grid screen rather than the card stack
 * @property {string} empty
 * @property {string} maps
 * @property {SpecRow[]} fields
 * @property {SpecRow[]} [tools]
 * @property {{title: string, ico?: string, note: string, rows: SpecRow[]}} [extra]
 */

/** A row's state on a field-list panel, and how it is drawn. */
export const FSTATE = {
	live:  ["live", "Live"],   // read off the site and shown on this page today
	stock: ["part", "Stock"],  // the field exists in the doctype, not yet surfaced
	build: ["none", "To build"],
};

/** @type {Queue[]} */
export const APPROVALS = [
  {k:"leave", l:"Leave", cov:"part", ico:"🌴", kind:"Leave Request",
   src:"Leave Application", doctype:"Leave Application",
   tpl:["employee","leave_type","from_date","to_date","half_day","half_day_date",
        "description","leave_approver","status"],
   empty:"No leave applications are open. Factor HR is holding 3.",
   maps:"Stock Frappe HR, and it covers the model in FACTOHR_DATA §7 — half days are first-class and the balance is carried on the row. Nothing to build here beyond the approval remarks.",
   fields:[
     ["Employee","Link → Employee","live",""],
     ["Name and code","fetched from Employee","live",""],
     ["Leave type","Link → Leave Type","live","Casual and LWP are the two in real use"],
     ["From date","Date","live",""],
     ["To date","Date","live",""],
     ["Half day, and which half","Check + Date","live","Factor HR calls it First / Second Half Day, 0.5 days"],
     ["Total leave days","Float","live",""],
     ["Balance before application","Float","live","Frozen on the row, as Factor HR does"],
     ["Reason","Small Text","live","<code>description</code> on the doctype"],
     ["Leave approver","Link → User","live","Defaults from the employee's leave approver"],
     ["Raised on","Date","live","<code>posting_date</code>"],
     ["Status","Open / Approved / Rejected / Cancelled","live",""],
     ["Approval remarks","Small Text","build","Factor HR keeps the employee's remarks and the approver's apart; the stock doctype has one field and a comment thread"],
     ["Leave availed dates","Leave Ledger Entry","stock","Written on approval, not requested"],
   ]},

  {k:"attendance", l:"Attendance", cov:"part", ico:"🕒", kind:"Time Correction",
   src:"Attendance Regularization",
   tpl:["employee","attendance_date","requested_in","requested_out","reason",
        "approver_type","status"],
   empty:"No corrections raised here yet. Factor HR is holding 50.",
   maps:"This app's own doctype — see <code>docs/SCHEMA.md</code>. Approving one writes the missing <b>Employee Checkin</b> and lets the shift job rebuild Attendance; it never edits Attendance directly.",
   fields:[
     ["Doc no","Naming series HR-REG-.YYYY.-","stock","Factor HR heads every card with it — <code>DocNo : 47299</code>. It is what an approver quotes on the phone, so it is shown, not hidden"],
     ["Request kind","“Time Correction”","live","One kind today. Factor HR labels the card, which is how it mixes several kinds in one queue"],
     ["Employee","Link → Employee","live",""],
     ["Company","Link → Company","stock","Scopes the queue per company"],
     ["Date","Date","live",""],
     ["Shift on the day","Link → Shift Type","build","Factor HR names it in full on the card — <em>Hi-Tech Rubber Industries-Production shift4</em>. The shift is what makes any other number on the card mean anything"],
     ["Planned in / out","from the shift window","build","The left of Factor HR's <b>Planned | Attended</b> pair — 08:30 / 16:30. Reads “—” here until Shift Type has times"],
     ["Attended in / out","the original punches","build","The right of the pair — 06:42 / 18:00, never overwritten. Needs the day's Employee Checkin rows loaded, not just today's"],
     ["Requested in","Datetime","live","Factor HR's <code>AR In</code>. Either may be blank — a missed punch-out is the common case"],
     ["Requested out","Datetime","live","Factor HR's <code>AR Out</code>"],
     ["Working hours","computed","live","Worded as Factor HR words it — <em>11 hrs 18 minutes</em>. Computed from the requested pair here; from planned vs attended once shifts exist"],
     ["Overtime hours","computed","build","<em>3 hrs 18 minutes</em> on the card. Cannot be computed without the shift window"],
     ["Correction for","Select","build","<em>Overtime marking</em> in the 24 Aug screenshot — what the employee is asking to change. Inferred from the missing punch until the field exists, and labelled as inferred"],
     ["Claimed hours","Duration","build","<em>Hours: 3 hrs 0 minutes</em> — the overtime being claimed, which is the number that becomes money"],
     ["Reason","Select","stock","A picked value in Factor HR — <em>System Error</em>, <em>Forgot to Punch</em>. The list itself is still needed"],
     ["Remarks","Small Text","build","Separate from Reason on Factor HR's card and empty in all three samples; the doctype has no field for it yet"],
     ["Time log","the day's raw punches","build","A link on every Factor HR card. Employee Checkin is loaded for today only here"],
     ["Initiated by, applied on","owner + creation","stock","Factor HR shows <em>Applied On</em> on the card face"],
     ["Last action by, last action on","modified_by + modified","live","Shown in the card header, as Factor HR shows it — <em>24-Aug-2026 17:15, HRI-040 - SURESH KUMAR P S</em>. Populated even while the request is still open"],
     ["Decided by","Reporting Manager / HR","stock","Routed from the reporting line — an approver must not sign off their own attendance"],
     ["Decision, who and when","Link → User + Datetime","stock",""],
     ["Decision note","Small Text","stock","Shown back to the employee on a rejection"],
     ["Status","Pending Approval / Approved / Rejected","live","Factor HR's open state reads <b>Initiated</b>. Ours says Pending Approval, and the queue reads either"],
     ["Break out / break in","Datetime","build","Two kinds of break are counted in Factor HR — see FACTOHR_DATA §6. Not designed in yet, and it moves worked hours, which moves pay"],
     ["Late-in, early-out duration","Duration","build","Per row in Factor HR. Waits on the attendance policy"],
   ],
   tools:[
     ["Select all","Toolbar, far left","live","Covers what is shown, never rows a search has hidden — the select-all that quietly includes filtered-out rows is how the wrong person gets approved"],
     ["Bulk Approve / Reject","Bulk Action dropdown","build","Reads the selection and says what it would do. Approving in bulk writes punches for every row at once, so it is the last thing to wire, not the first"],
     ["Import / Export Data","Bulk Action dropdown → dialog","part","Opens Factor HR's three-button dialog. <b>Export</b> and <b>Download Template</b> work — the selection or everything shown as CSV, and the doctype's own header row. <b>Import Data</b> writes attendance from a spreadsheet and is refused"],
     ["Search","Toolbar","live","One box over name, code, doc no, reason, date and status — an approver hunting <em>47299</em> and one hunting <em>Ekka</em> use the same box"],
     ["Refresh","Toolbar","live","Reloads from the site"],
     ["All · Last 10 / 20 / 50 Activities · Last 7 / 31 Days · Past Two / Three Months","Toolbar","live","Factor HR's own eight, defaulting to 50. Counted from when the request was raised, not the day it is about"],
     ["Employee Wise · Request Type Wise · Reporting Manager Wise","Toolbar","live","Factor HR's three. Reporting Manager Wise is the one that matters here — it is the queue an approver actually owns, and it shows up anybody with no reporting line"],
     ["Approve, reject","Green tick and red cross, per card","build","Drawn where Factor HR draws them and inert: deciding writes <b>Employee Checkin</b> rows, which must happen on the server. This page proxies GET only"],
     ["View Details","Per card","build","Every field on the request, and its decision trail"],
     ["Time Log","Per card","build","The day's raw punches, beside the correction"],
   ]},

  {k:"profile", l:"Employee Profile", cov:"none", ico:"👤", kind:"Profile Change",
   src:"nothing yet",
   empty:"Nothing here, and nothing in Factor HR either — its tab reads 0. The fields below are what one of these would carry.",
   maps:"Frappe HR has <b>no request-and-approve step for a profile edit</b>: somebody with write access changes the record and the change lands in the version log. Matching Factor HR means either a Workflow on <code>Employee</code> — configured, not coded — or a small custom doctype holding the before and the after.",
   fields:[
     ["Employee","Link → Employee","build",""],
     ["Field changed","Select over the editable Employee fields","build","Address, mobile, bank account and nominee are the ones people actually change"],
     ["Current value","Data, read off the record","build","Captured when raised, so a later edit cannot rewrite what was agreed"],
     ["Requested value","Data","build",""],
     ["Supporting document","Attach","build","A bank change with no cancelled cheque is the one to refuse"],
     ["Raised by, raised on","Link → User + Datetime","build",""],
     ["Status","Pending Approval / Approved / Rejected","build",""],
     ["Decision, who, when, note","Link → User + Datetime + Small Text","build",""],
     ["Applied to Employee","Check","build","Approval has to write the field, or the queue is a suggestion box"],
   ]},

  {k:"onboarding", l:"Onboarding", cov:"none", ico:"🚪", kind:"Onboarding",
   src:"Employee Onboarding + Employee Boarding Activity",
   empty:"Nothing here, and Factor HR's tab reads 0 too. The fields below are stock Frappe HR, waiting on a template rather than on code.",
   maps:"<b>Entirely stock.</b> Employee Onboarding drives a checklist of Boarding Activities and creates the Employee at the end. Nothing to build — it needs one template per joiner type and the responsible users named.",
   fields:[
     ["Job applicant / candidate","Link → Job Applicant","stock",""],
     ["Onboarding template","Link → Employee Onboarding Template","stock","One per joiner type — factory, staff, contract"],
     ["Company, department, designation, grade","Links","stock",""],
     ["Date of joining","Date","stock",""],
     ["Activity","Child rows","stock","Activity name, responsible user, role, begin-on, duration"],
     ["Required for employee creation","Check, per activity","stock","Holds the Employee record back until the activity is done"],
     ["Completed","Check, per activity","stock",""],
     ["Boarding status","Pending / In Process / Completed","stock",""],
     ["Employee created","Link → Employee","stock","The record the checklist produces"],
     ["Biometric enrolment","attendance_device_id","build","Not a stock activity, and it is the one that decides whether day one is recorded at all"],
   ]},

  {k:"transfer", l:"Transfer & Promotion", cov:"none", ico:"↗", kind:"Transfer / Promotion",
   src:"Employee Transfer + Employee Promotion",
   empty:"Nothing here, and Factor HR's tab reads 0. Both doctypes exist in Frappe HR already; what is missing is the sign-off in front of them.",
   maps:"Both are stock and both are <b>submittable</b>, which means Frappe's own approval is one person pressing Submit. Factor HR's multi-level sign-off is a <b>Frappe Workflow</b> — configured, not coded.",
   fields:[
     ["Employee","Link → Employee","stock",""],
     ["Effective date","Transfer date / promotion date","stock","Dated forward — the change applies on the day, not when it is approved"],
     ["New company","Link → Company","stock","Transfer only. Six companies here, so a cross-company move is the normal case"],
     ["Property changed","Child table: property, current, new","stock","Department, designation, grade, branch, reports-to"],
     ["Revised CTC and salary structure","Currency + Link","stock","Payroll is deferred, so this is recorded and not acted on"],
     ["Create new employee id","Check","stock","Transfer only. Leave it off — a new id orphans the punch history"],
     ["Reallocate leave balances","Check","stock",""],
     ["Reason","Small Text","build","On neither doctype; Factor HR's queue shows it to the approver"],
     ["Approval chain and status","Frappe Workflow","build","Draft → recommended → approved → submitted"],
   ]},

  {k:"letter", l:"Letter Assignment", cov:"part", ico:"✉", kind:"Letter Assignment",
   src:"Letter Type + Employee Letter",
   empty:"Nothing waiting. Factor HR's tab reads 0 — but 17 templates are loaded here and merge against live employee data on the On Board page.",
   maps:"The templates and the merge are built — see <b>On Board → Letters</b>. What this queue adds is the step in front of issue: somebody agrees the letter before it is printed and handed over.",
   fields:[
     ["Employee","Link → Employee","live",""],
     ["Letter type","Link → Letter Type","live","17 templates, 118 distinct merge tokens"],
     ["Letter date","Date","live",""],
     ["Unresolved merge fields","computed at render","live","Shown, never blanked — a letter with a visible gap is obviously unfinished"],
     ["Requested by, requested on","Link → User + Datetime","build",""],
     ["Approval status","Draft / Approved / Issued / Acknowledged","build","Nothing should print from Draft"],
     ["Issued by, issued on","Link → User + Date","build",""],
     ["Signed copy","Attach","build","The acknowledged copy back from the employee"],
     ["Acknowledged on","Date","build",""],
   ]},

  {k:"other", l:"Other", cov:"none", ico:"❓", kind:"Other Request", view:"grid",
   src:"unknown",
   empty:"No pending at your end.",
   maps:"The grid above is Factor HR's, screen for screen. Its <b>activity type</b> filter is what lets one grid serve several kinds of request — <em>Nominee</em> is the only value ever seen, and the rest of that list is a screenshot away.",
   fields:[
     ["Reference No.","the document name","build","Every row is a document somewhere; this queue is a view over several doctypes at once, which is why it needs a reference rather than a link"],
     ["Date","Date","build","The date the request is about, not when it was raised"],
     ["Employee","Link → Employee","build",""],
     ["Description","Data","build","One line saying what is being asked. It is the whole of what an approver reads on this screen, so it has to carry the ask on its own"],
     ["Remarks","Data","build","The employee's words, kept apart from the description"],
     ["Current Status","Pending / Approved / Rejected","build",""],
     ["Your Action","Approve / Reject, per row","live","<b>Staged, not applied</b> — pick on many rows, then Save. Copied because it is the better model: nothing is decided one misclick at a time"],
     ["Last Action By","Link → User","build",""],
     ["Activity type","Select","build","<em>Nominee</em> is the one value seen. This is the field that decides what else belongs in this queue"],
   ],
   tools:[
     ["Save Approval Changes","Grid toolbar","live","Writes every staged decision at once, one document at a time. A row with a doctype behind it goes to the site — which fires the server rule, so approving a correction writes its punches; a row without one is applied to this screen and reported as exactly that. <b>Writes are off unless the proxy is started with <code>ERP_WRITE=1</code></b>"],
     ["Refresh Approval Activities","Grid toolbar","live","Reloads from the site, which is also what proves whether a save landed"],
     ["Approval Activities Log","Grid toolbar","live","Every decision made from this page, newest first, marked <em>Site</em> or <em>Screen</em>, exportable. Session-scoped — Frappe's version log is the durable record, per document"],
     ["Bulk Approval","Grid toolbar","live","Marks the selection Approve or Reject, or clears it. Marking is not deciding: Save is"],
     ["Export","Grid toolbar","live","The rows shown, as CSV"],
     ["Filter Activity Type","Above the grid","part","<em>Nominee</em>, plus All. The rest of the list has never been screenshotted"],
     ["Filter By Period","Above the grid","live","The same eight windows as the card queues"],
     ["A filter box under every column","Grid header","live","Eight independent contains-filters, combined. Factor HR puts them under the headings and so does this"],
   ],
   extra:{title:"Other — what might belong in this queue", ico:"🧭",
     note:"<b>This list is a question, not a design.</b> These are the requests Manna is known to run outside Factor HR today. Anything on it that is wanted needs saying — and <em>Nominee</em>, which Factor HR does hold here, is not on it because nobody has said whether nominee declarations matter.",
     rows:[
     ["Nominee declaration","employee, nominee, relationship, share","build","The one activity type Factor HR's own grid names. PF and gratuity nominations, which is why it has an approval step at all"],
     ["Planned overtime","employee, date, hours, approved by","build","Identified 23 Aug. Frappe HR measures overtime backwards from punches and records no intention beforehand — plant managers pick tomorrow's overtime today"],
     ["Shift change request","employee, date, from shift, to shift","build","Shift Assignment exists; the request in front of it does not"],
     ["Resignation / separation","Employee Separation","stock","Stock Frappe HR, the mirror image of Onboarding"],
     ["Asset issue and return","Asset + Employee","stock","ERPNext Asset, if the queue is wanted at all"],
     ["Loan and advance","Employee Advance / Loan","stock","Recovery only means something once payroll moves — deferred"],
     ["Attendance submission (monthly freeze)","period, company, locked by","build","Factor HR makes HR freeze the month before payroll runs. Frappe HR has no such gate — a control the team has today and would otherwise lose"],
   ]}},
];

/* Factor HR's own toolbar, above the queue and shared by every tab:
   select-all · bulk action · search · refresh · how many activities · grouping.
   Everything here that only reads is wired. The two that write are not, and say
   so when pressed rather than looking broken — see `qmsg`. */
/* Factor HR's own dropdown contents, read off the 28 Aug screenshots.
   Two kinds of window in one list — a count of activities and a stretch of
   days — so the value carries its kind: `n:` a count, `d:` days back. */
export const QSCOPES = [["","All"],["n:10","Last 10 Activities"],["n:20","Last 20 Activities"],
  ["n:50","Last 50 Activities"],["d:7","Last 7 Days"],["d:31","Last 31 Days"],
  ["d:60","Past Two Months"],["d:90","Past Three Months"]];

export const QGROUPS = [["employee","Employee Wise"],["type","Request Type Wise"],
  ["manager","Reporting Manager Wise"]];

export const QBULK = [["","--- Select Bulk Action ---"],["decide","Bulk Approve / Reject"],
  ["data","Import / Export Data"]];

export const READ_ONLY = "Deciding a request is a write, and this page proxies GET only — "
  + "see app/serve.py. It is a window onto the queue, not the queue itself.";

/* ---------------------------------------------------------------------------
   Factor HR's Other queue, which is a different screen from the card queues:
   a grid with a filter box under every heading, an activity-type filter that
   lets one grid serve several kinds of request — Nominee in the screenshot —
   and a "Your Action" per row that is staged rather than applied. Nothing is
   decided until Save Approval Changes, which is a good model and the reason
   the button exists at all.
   --------------------------------------------------------------------------- */
export const OTHER_BUTTONS = [
  ["save","Save Approval Changes","💾"],
  ["refresh","Refresh Approval Activities","↻"],
  ["log","Approval Activities Log","📜"],
  ["bulk","Bulk Approval","☑"],
  ["export","Export","⇩"],
];
/* Only one activity type has ever been seen on this screen. The rest of the
   list is a screenshot away and is not invented here. */

export const OTHER_TYPES = [["","All activity types"],["Nominee","Nominee"]];
