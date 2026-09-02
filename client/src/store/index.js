import { useSyncExternalStore } from "react";
import { thisMonth, todayIso } from "@/lib/format";
import { NEW_EMP_BLANK } from "@/lib/newemp";

/* ---------------------------------------------------------------------------
   One store, and every screen reads it.

   The page it replaces held a single mutable `S` and rebuilt the whole body on
   every keystroke — which is why so much of that file was state that looks like
   it belongs in the DOM: a filter, a search box, which value list is open. It
   is kept in the store here for the same reason it was kept in `S` there: a
   filtered list that quietly unfilters when you switch tabs and back is how
   somebody concludes a person is missing.

   `useSyncExternalStore` rather than a state library on purpose — this is one
   object with one setter, and a dependency that a future reader has to learn
   before they can change a filter is a dependency this does not need.
   --------------------------------------------------------------------------- */

/** One bucket per approval queue, all seven present from the start. A tab whose
    bucket is missing would render as an error rather than as an empty queue,
    and an empty queue is the honest answer for five of them. */
export const NO_APPROVALS = () => ({
	attendance: [], leave: [], profile: [], onboarding: [],
	transfer: [], letter: [], other: [],
});

/* The whole of it, in one literal. Every key is listed here even when it starts
   empty: a screen reading a key this object has never mentioned is a typo that
   renders as "undefined" rather than as an error, and this is the only place
   that can be checked by reading. */
const initial = {
	/* ---- what the site answered ---- */
	employees: [],
	byName: {},
	checkins: [],
	companies: [],
	counts: {},
	approvals: NO_APPROVALS(),
	letterTypes: [],
	letters: [],
	holidayLists: [],
	holidays: {},
	/** Leave Type names, not only how many there are. Apply Leave fills its type
	    dropdown from this — a list built from a count would be invented. */
	leaveTypes: [],
	/** Shift Type names, for the same reason plus one: Manage Shift lists Factor
	    HR's shifts, and whether a row of theirs exists here yet is the difference
	    between a control that can open it and one that has nothing to open. */
	shiftTypes: [],
	/* The two masters behind Category Type. Only their counts were kept before,
	   which was enough for a tile and not enough for the screen behind View
	   Category — that one lists them by name. */
	departments: [],
	designations: [],
	/** Which of the two correction doctypes answered — it decides where a
	    decision would later be written. See pendingRegularizations. */
	regDoctype: "Attendance Regularization",

	/* ---- connection ---- */
	conn: "connecting…",
	connState: "",
	/** The ERPNext site the proxy is pointed at, as it answered on /api/site.
	    Empty until it does, and the controls that link out to the site stay
	    disabled while it is — a link to nowhere is worse than a dead button that
	    says why. */
	site: "",

	/* ---- chrome ---- */
	section: "dashboard",
	subtab: "overview",
	company: "",
	q: "",

	/* Employee Detail reads one whole record at a time and keeps what it read:
	   the same person is re-rendered on every keystroke elsewhere, and
	   re-fetching them each time would be a request per keypress. */
	empDoc: {},
	empSel: "",
	/* Which of the profile's thirteen panes is open. Kept here rather than in
	   the page so that stepping between two people compares the same pane —
	   which is the whole reason somebody opens two records in a row. */
	proftab: "about",
	/** Which of the sidebar's caret groups are open. Empty is Factor HR's own
	    resting state — Personal Details is shut until somebody opens it. */
	profopen: [],

	/* The calendar screen's own state: which month, which holiday list, which
	   days have been expanded past "+ N more…", and the search box Factor HR
	   puts in its toolbar. */
	cal: { month: "", list: "", find: "", search: false, open: {} },

	/* Factor HR's regularization screen is one person at a time, so who is
	   picked is state rather than a scroll position. */
	reg: { cycle: "", emp: "", q: "", cat: "", status: "", menu: false },

	/* The Daily Detail report panel. `run` is the whole of Factor HR's model:
	   nothing is listed until Generate is pressed, and changing a filter puts
	   it back to false rather than leaving a stale report up. */
	dda: {
		emp: "", q: "", status: "Active", by: "", period: "date", from: "", to: "",
		tab: "criteria", layout: { group: true, logo: true }, more: false, run: false,
		msg: "", menu: false,
		/* The Advance tab, all four controls of it. `dow` holds weekday numbers
		   the way `Date.getDay` gives them, so a filter written here and a date
		   read there cannot disagree about which day Sunday is. */
		gby: "", dow: [], cats: 0, punch: "",
		/* The two split buttons on the bar: which export the left one runs, and
		   whether either list is open. */
		fmt: "Excel", fmenu: false, gmenu: false,
	},
	/** The rendered report, held while Preview is open — the same document
	    Print, PDF and Word are handed. */
	ddaDoc: "",

	/* Factor HR's Salary Master is one person at a time, like their
	   regularization screen — who is picked is state, not a scroll position.
	   `list` is their List of Employees panel, which is a second way into the
	   same choice rather than a different screen. */
	/* Leave → Leave Balance Report. Factor HR's own form, control for control:
	   the same toolbar the three attendance reports carry, then As On Date,
	   Leave Type and Layout Options under Report Criteria, and Group By under
	   Advance. Photographed 29 Aug 2026.

	   `ason` rather than a range, because a balance is a position on a date and
	   not a total over a period — that is the one way this form differs from the
	   attendance reports it otherwise copies. Empty means today; it is resolved
	   at render so the page does not go stale sitting open overnight. */
	lvb: {
		emp: "", q: "", status: "Active", by: "", tab: "criteria",
		ason: "", ltype: "", layout: { logo: true }, gby: "",
		run: false, msg: "", menu: false, fmt: "Excel", fmenu: false, gmenu: false,
	},
	/** Approved leave applications, read once when the report is first opened.
	    `lvbState` guards the read; `lvbErr` is why it failed, if it did. */
	lvbRows: [],
	lvbState: "",
	lvbErr: "",
	/** The rendered report, held while Preview is open. */
	lvbDoc: "",

	sal: { emp: "", q: "", status: "", menu: false, list: false },

	/* Salary Master → List of Employees, their paged table. See
	   features/employees/EmployeeList.jsx and EMP_LIST_COLS.

	   Its own slice rather than more keys on `sal`, because the panel is a way
	   of *choosing* somebody and `sal` is who was chosen: a filter left on here
	   must survive picking a person and coming back, and a person picked must
	   not reset the filter that found them.

	   `f` is the row of boxes under the headings, keyed by column. `type` and
	   `cat` are their two-step CATEGORY TYPE / CATEGORY pair — the first picks
	   which field is being filtered, the second a value of it. */
	elist: { page: 1, sort: "", dir: 1, f: {}, type: "", cat: "", status: "" },

	/* Salary Master → the form their + opens. `open` is whether it is up, `msg`
	   is the answer a button gave, and `by` holds what has been typed.

	   **Keyed by employee rather than held as one draft**, and that is the whole
	   reason it is in the store at all. What is typed here is only as safe as
	   this object until SAVE writes it, and SAVE needs the proxy started with
	   ERP_WRITE=1 — so on a read-only run this is the only copy. A single draft
	   would be wiped by picking
	   a second person to look at, which is a thing anybody filling one of these
	   in does constantly, and it would be wiped silently. Per-person, both
	   drafts survive and the export is still there to get the work out.

	   `by[employee] = { on, cells: { [wage type]: { amt, basis, man, ref } } }`.
	   Absent means untouched, which is why nothing pre-seeds it.

	   `busy`, `done` and `err` are the save. It writes two drafts onto the site
	   (see api/salary.js), which takes a few seconds and several round trips —
	   so which step it is on is shown rather than a spinner, and the report it
	   comes back with is kept until something else is typed. `later` is what the
	   second button found and did not rewrite. */
	rev: { open: false, by: {}, msg: "", busy: "", done: null, err: "", later: null },

	/* Employee Master → Add New Employee, the three-step wizard on
	   features/employees/CreateEmployee.jsx.

	   Here rather than in the page for the reason `rev` is here: until Create
	   writes it, this object is the only copy of what somebody has typed, and a
	   page that keeps its own state loses all three steps of it to a stray click
	   on the rail. It survives leaving the screen deliberately — coming back to a
	   half-filled form is the behaviour somebody interrupted mid-hire needs.

	   `step` is the index into NEW_EMP_STEPS, `f` is field-name → typed value,
	   and `err` / `busy` / `done` are the write. `done` holds the created record
	   so the page can link to it on the site rather than only saying "saved".

	   Built by NEW_EMP_BLANK rather than written out here, because "an empty
	   form" is a thing the page also has to be able to go back to, and two
	   spellings of it would drift. */
	newemp: NEW_EMP_BLANK(),

	/* Payroll → Salary Process, photographed 29 Aug 2026. Their year, their
	   payroll type, their PROCESS FOR, and which of the twelve month chips is
	   picked.

	   `year` and `month` empty mean the payroll year and month today falls in,
	   resolved at render for the same reason `psl.year` is: a default computed at
	   module load is a default that goes stale under somebody who left the tab
	   open across a month end — and this is the one screen where the month
	   decides what everybody is paid. */
	sp: {
		year: "", month: "", ptype: "Monthly", pfor: "All Employees",
		remarks: "", gear: false, more: false,
	},
	/** `relieving_date`, read once when this screen is first opened. A probe
	    rather than a field on EMP_FIELDS, on the same terms as the payslip's
	    address read: a field this site does not carry would fail the load that
	    draws the whole dashboard, and their −13 tile is exactly the question
	    of whether it is carried. "absent" means the read was refused, which is a
	    different finding from nobody having left. */
	spLeft: null,
	spLeftState: "",

	/* Payroll → Salary Payslip. Factor HR's own form, photographed 29 Aug 2026:
	   the report chrome the attendance and leave reports carry, plus PERIOD TYPE
	   which none of them has, and then BASIC / ADVANCE rather than Report
	   Criteria / Advance.

	   `year` empty means the payroll year today falls in, resolved at render for
	   the same reason `lvb.ason` is — a form left open across 31 March would
	   otherwise still be offering last year's months.

	   The three checkboxes start in the states their capture had them in, not in
	   the states that would be convenient here. See PSL_FLAGS. */
	psl: {
		emp: "", q: "", status: "", by: "", period: "Single Period",
		tab: "basic", ptype: "Monthly", year: "", month: "", output: "PDF",
		format: "Format 7", noemail: false, zero: true, itstat: false,
		run: false, msg: "", menu: false, gmenu: false,
	},
	/** The address fields, read once when Generate is first pressed — a probe,
	    not part of the page load, because whether `Employee` even carries them
	    on this site is one of the answers this screen is after. "absent" is an
	    answer; it means the read was refused, which is different from everybody
	    having no address. */
	pslMail: null,
	pslMailState: "",
	/** The rendered payslips, held while Preview is open — the same document
	    Print, PDF and Word are handed. */
	pslDoc: "",

	/* Payroll → Salary Register, photographed 29 Aug 2026. Their payslip form's
	   near-twin: the same report chrome, the same Payroll Type / Year / Month,
	   and then two of its own — Output Currency and Group By — with the three
	   checkboxes replaced by one chip box, OTHER OPTIONS.

	   `year` empty means the payroll year today falls in, resolved at render for
	   the same reason `psl.year` is. `month` empty is deliberate and is theirs:
	   their MONTH box was empty in the capture, and a register with no month on
	   it is the whole financial year — which is a different report and is said
	   to be one on the form.

	   `opts` starts with all five ticked because all five were ticked in the
	   capture. Three of them cannot do anything here; they are still drawn and
	   still removable, and each says which kind of nothing it does. */
	sreg: {
		emp: "", q: "", status: "", by: "", tab: "basic",
		ptype: "Monthly", year: "", month: "", currency: "Default", gby: "",
		opts: { master: true, oldcode: true, zerocols: true, zeroemps: true, bank: true },
		run: false, msg: "", menu: false, gmenu: false,
	},

	/* Payroll → Final Settlement. Their screen is three numbered stages over one
	   list, and two toolbars over that; `tab` is which stage, and the rest is
	   the two bars, control for control.

	   `range` is their radio pair — a date of leaving, or a settlement date.
	   Only one of the two can be answered on this site, and the other is kept
	   rather than dropped because *which one somebody reached for* is the
	   finding: a settlement date is a date no doctype here holds.

	   `sel` is an array rather than a Set because the whole of it is written on
	   every tick anyway, and an array survives being spread into the store
	   without a caller having to remember it is a Set. */
	fnf: {
		tab: "settlement", scope: "n:50", range: "dol", year: "", status: "notdone",
		dot: "", q: "", find: "", from: "", till: "", sel: [], menu: false,
	},
	/** The exit fields off `Employee`, read the first time somebody opens Final
	    Settlement. `sepState` is "", "loading", "ok" or the reason it failed —
	    an empty queue and a queue that could not be read are opposite findings
	    on this page, and it is the one that decides whether anybody is owed
	    money. */
	seps: [], sepState: "",

	/* Payroll → Bank Transfer, both tabs, off the capture of 29 August 2026.

	   `tab` is their two; `open` is which of the three filter groups is
	   expanded. All three start shut because all three are shut in the capture,
	   and that is worth copying rather than improving on: their screen opens as
	   a preview panel with nothing in it, which is what makes Preview the thing
	   somebody presses first.

	   `year`, `month` and `paydate` are empty and resolved at render, the same
	   way the payslip's and the register's are — a payment date seeded at module
	   load is a value date that goes stale overnight, and this is the one form
	   where that field is the day money leaves an account.

	   `amounts` is their Show Amounts, off to start. `run` is Preview: nothing
	   is listed until it is pressed, and touching a filter puts the last run
	   away rather than leaving one list under another list's criteria. */
	bt: {
		tab: "regular", open: [], find: "",
		ptype: "Monthly", year: "", month: "", paydate: "",
		status: "Active", q: "", by: "",
		mode: "All", bankname: "", format: "",
		amounts: false, run: false, msg: "",
	},
	/** The bank half of `Employee`, read the first time somebody opens this
	    screen — a probe, on the same terms as Final Settlement's and the
	    payslip's. Not four more fields on the load every page pays for: a field
	    this site does not carry fails the whole read, and *whether these are
	    carried and filled* is most of what this screen is for.

	    "absent" means the read was refused, which is a different finding from
	    nobody having an account number — and on this page the difference is
	    whether anybody could be paid at all. */
	btBank: null, btBankState: "",

	/* Payroll → Adhoc Payments/Deductions. Their screen draws its component table
	   whether or not anybody is picked, so `emp` is not a gate here the way it is
	   on Salary Master — it only says whose row an amount would be typed against,
	   and nothing on this side can type one. `find` is the magnifier in their
	   title bar, which is a search over the descriptions rather than over people:
	   the bar already has an employee search on it. */
	adhoc: {
		emp: "", q: "", status: "", menu: false,
		year: "", process: "Salary", ptype: "", day: "",
		find: "", search: false,
	},

	/* Payroll → Prof. Tax Statement, control for control off the capture of
	   29 Aug 2026. Their defaults are kept as their defaults — Salary, Detail,
	   Monthly, All, Excel, With Logo ticked and the other two clear — because a
	   form redrawn with somebody else’s defaults is a form that answers a
	   different question on open.

	   `year` empty means the fiscal year today falls in, resolved at render
	   rather than seeded here, so a tab left open across an April does not sit
	   on last year’s return. `status` is a list because theirs is: it read
	   "Active, Inactive, Suspended", three ticks rather than one choice. */
	pt: {
		process: "Salary", type: "Detail", year: "", ptype: "Monthly",
		from: "", till: "", state: "All", status: ["Active", "Inactive", "Suspended"],
		emp: "", pick: false, by: "", gby: "", output: "Excel",
		logo: true, split: false, zero: false,
	},
	ptRun: false, ptMsg: "",

	/* Payroll → IT Declarations, photographed 29 Aug 2026. Their screen is one
	   person at a time — the same model as Salary Master and Adhoc — and the
	   history under it is one row per financial year. `opt` is the Select
	   Options list beside the search: never opened, so it holds nothing here
	   either.

	   `itdPan` is on none of their screen. It is here because the finding that
	   decides this page is a PAN count, and that costs a read — so it is guarded
	   by `itdPanState` and happens once, when somebody asks for it rather than
	   on open. "" is unasked, then "loading", "ok", or "absent" when the field
	   is not on this site at all, which is an answer rather than an error. */
	itd: { emp: "", q: "", status: "", menu: false, opt: "" },
	itdPan: null, itdPanState: "",

	/* Payroll → Bonus Working Report, control for control off the capture of
	   29 Aug 2026, and their defaults kept as theirs: Active and Suspended
	   ticked, Default currency, Excel, With Logo clear.

	   `from` and `till` are months rather than dates because theirs are — Apr-23
	   to Mar-27 in the capture — and empty means the accounting year today falls
	   in, resolved at render for the same reason `pt.year` is: a tab left open
	   across an April must not still be working last year's bonus. */
	bon: {
		from: "", till: "", status: ["Active", "Suspended"], emp: "", pick: false,
		by: "", currency: "Default", output: "Excel", logo: false,
	},
	bonRun: false, bonMsg: "",

	/* Loans → Loan Register, control for control off the criteria panel captured
	   29 Aug 2026, and their defaults kept as theirs: three statuses ticked, both
	   loan types ticked, Month Wise Recovery, Exclude Zero Balance Loans clear.

	   `from` and `till` are empty here and resolved at render, the way `pt.year`
	   is. Their capture read 01-Apr-2025 to 31-Aug-2026 — the start of the fiscal
	   year before last, to the end of the current month — and that reading is
	   what the empty values mean, so a tab left open overnight does not sit on
	   yesterday's range. */
	lreg: {
		status: ["Active", "Inactive", "Suspended"], emp: "", pick: false, from: "", till: "",
		types: ["Salary Advance", "Tour Advance"], by: "", gby: "",
		type: "Month Wise Recovery", zero: false,
	},
	lregRun: false, lregMsg: "",
	/** The rendered report, held while Preview is open — the same document Print,
	    PDF and Word are handed. */
	bonDoc: "",

	/* Loans → Loan Projection, control for control off the capture of 29 Aug
	   2026 — the first Loans screen anybody has seen past the menu.

	   Their defaults are kept as theirs, with two exceptions that are said out
	   loud on the form. `status` drops the fourth value in their box, which is
	   clipped at the control's edge at "Tempo" and has no counterpart on
	   `Employee.status`. `from` and `till` are empty rather than their literal
	   01-Apr-2025 / 31-Aug-2026: a date typed into a page in August 2026 is a
	   stale default by October. Empty resolves at render to the payroll year's
	   April and the end of this month — still a window that opens in the past,
	   which is the finding their dates carry.

	   `types` starts with both of theirs ticked because both were ticked, and
	   the two names are the best evidence anybody here holds about whether Manna
	   lends or only advances. */
	lp: {
		status: ["Active", "Inactive", "Suspended"], emp: "", q: "", pick: false,
		from: "", till: "", types: ["Salary Advance", "Tour Advance"], by: "",
		principal: true, interest: false,
		run: false, msg: "",
	},

	/* Loans → Loan Application, control for control off the capture of 29 Aug
	   2026. Every field on their form is here and every one starts empty, the
	   way a new record does over there — including the four they shade yellow,
	   which is how that form marks a mandatory field.

	   The last four keys are **ours and not on their form**, and they are kept
	   apart on the screen for that reason. A schedule needs a rate and a term,
	   and neither is on this form: over there they come off the Loan Type
	   master, which is also where ERPNext keeps them. `perk` is the State Bank
	   rate the perquisite is valued at — a notification, like the minimum wage
	   the bonus working needs, and held nowhere on this site either. */
	la: {
		no: "", emp: "", q: "", pick: false, type: "", requested: "", sanctioned: "",
		purpose: "", date: "", start: "", pay: "", required: "", status: "", account: "",
		done: false, noauto: false, doneOn: "",
		interest: "free", rate: "", months: "", perk: "",
		tab: "application", run: false, msg: "",
	},

	/* The master's own view state. Filters live here rather than in the DOM so
	   that switching to a card and back does not silently drop them. */
	empview: "grid",
	empstatus: "",
	empdept: "",
	empdesig: "",
	empdev: "",
	empfilters: false,
	empmenu: false,
	/* The caret on Add New Employee, which is Factor HR's own split button —
	   File Import, Week-Off Import, Picture Import. Its own key rather than a
	   second use of `empmenu`: that one is the status filter's dot, and two
	   menus on one bar sharing a flag means opening either closes the other
	   and neither can be reasoned about on its own. */
	empnew: false,

	/* Manage Shift's own toolbar. Search and Show act on their table — those rows
	   are Factor HR's, read off a photograph, so there is nothing to fetch and
	   nothing to page through on the site.

	   `shMaster` is the selector in the middle of that bar, and it is the whole
	   reason the screen's title has an "&" in it: one screen, two masters. Their
	   Work Pattern has never been opened, so what is drawn under it is ours — the
	   Shift Assignment rows, which are the same question asked our way: who is
	   measured against which shift, and between which dates. */
	shq: "", shper: 20, shMaster: "shift",
	/** Shift Assignment, read the first time somebody opens Work Pattern rather
	    than on every page load — the site has a daily compute limit and most
	    visits never come here. `shAssignState` is "", "loading", "ok" or an error
	    string, because "nothing is assigned" and "the read failed" are opposite
	    findings on this page. */
	shAssign: [], shAssignState: "",

	/** Category Type opens one value list at a time, the way that screen
	    navigates — View Category replaces the list rather than stacking. */
	catopen: "",
	/** Their search box, which filters the five rows that have been photographed.
	    It cannot reach the three that have not — see the pager. */
	catq: "",
	/* The screen behind View Category has a search and a pager of its own, and
	   both are real there because the rows are ours. Reset on the way in, so a
	   filter left on Department does not hide every Designation. */
	catfind: "", catpage: 1,

	/* Employee Detail is a report screen in Factor HR, so it has a form's worth
	   of state. `edStatus` is null until the form is first drawn, then the
	   ticked statuses. */
	edStatus: null,
	edSections: ["category"],
	edJoinA: "", edJoinB: "", edSepA: "", edSepB: "", edDobA: "", edDobB: "",
	edAgeA: "", edAgeB: "", edAgeOn: todayIso(), edMgr: "",
	edReport: null,
	edBusy: false,
	edMsg: "",
	edBad: false,

	/* Monthly Basic Attendance. Both layout chips start on because both are on
	   in Factor HR's own screen. */
	mb: {
		emp: "", status: "Active", tab: "criteria", from: "", till: "", by: "",
		logo: true, shift: true, weekoff: false, when: "", count: 0, busy: false, err: "",
		/* The Advance tab, and the two split buttons on the bar. Same two Advance
		   controls as the other two attendance reports — see MonthlyBasic.jsx,
		   where the one thing not carried across is the claim to have seen them
		   on this report's own tab. */
		gby: "", cats: 0, fmt: "Excel", fmenu: false, gmenu: false,
	},
	/** The rendered grid, held while Preview is open — the same document Print,
	    PDF and Word are handed. */
	mbDoc: "",
	/** The generated grid, keyed `employee|YYYY-MM-DD` to the Attendance status
	    that day carries. The status, not the row: the grid draws one letter per
	    cell, and holding the whole document would invite a second opinion about
	    what the day was worth. */
	mbRows: {},

	/* The CTC / Earnings report form. Factor HR generates on demand rather than
	   on open, and that is copied. */
	ctc: {
		by: "", status: "All", from: "", till: "", emp: "", wef: "",
		unit: "Yearly", attdays: false, hidegroup: false, incr: false,
		/* The five under More options, photographed expanded on 31 August 2026.
		   See CTC_MORE — none can be honoured and each says why when ticked. */
		catcode: false, grouptotal: false, qual: false, exp: false, rating: false,
	},
	/* `ctcMenu` is their CTC Rating Data Import dropdown, which is two items
	   rather than the one button this page used to draw. */
	ctcRun: false, ctcMsg: "", ctcPick: false, ctcMenu: false,

	/* The In / Out Activity report. Its date range is the one control on this
	   page that has to reach the site — everything else filters what came back
	   — so nothing is fetched until Generate is pressed. */
	io: {
		emp: "", status: "Active", by: "", period: "Date Wise", from: "", till: "",
		t1: "00:00", t2: "23:59", selfie: true, logo: true, logtype: "", stream: "",
		tab: "criteria", more: false, menu: false,
		/* The Advance tab. Two controls here, not Daily Detail's four: this
		   report's rows are punches, and a day-of-week or punch-type filter on a
		   punch list is what the criteria tab's own filters already do. */
		gby: "", cats: 0,
		/* Which export the split button runs, and whether its list is open. The
		   chosen format sticks, the way it does on their screen: somebody who
		   prints this report prints it every week. */
		fmt: "Excel", fmenu: false,
	},
	ioRows: null, ioState: "", ioMsg: "", ioRan: "",
	/** The rendered report, held while Preview is open. It is the same document
	    Print, PDF and Word are handed — a preview showing anything else would be
	    a preview of nothing. */
	ioDoc: "",

	/* The statutory report form. Its Report Type list is ours, not theirs:
	   their dropdown has never been opened, so what it offers is still unknown
	   and nothing is invented in its place. */
	sr: {
		mode: "month", month: new Date().getMonth(), year: new Date().getFullYear(),
		from: "", till: "", type: "", status: "Active", emp: "", by: "",
		output: "Excel", code: false, hidehdr: false, pick: false,
	},
	srRun: false, srMsg: "",
	/** Keyed by employee name — the two statutory identifiers, once probed. */
	srExtra: null,
	srExtraState: "",

	/* Apply Leave. Factor HR opens this page as an empty form and keeps nothing
	   until Apply is pressed, so none of it is seeded — except the dates, which
	   are seeded once below for the same reason the calendar month is. */
	/* Apply Leave, in the shape their form asks for it. `fromval` / `tillval`
	   are the two LEAVE VALUE dropdowns, one against each date; `month` is the
	   calendar beside them, which follows the From date unless it is walked. */
	apply: {
		emp: "", q: "", status: "Active", menu: false,
		type: "", from: "", till: "", fromval: "1", tillval: "1",
		remarks: "", file: "", notify: "", notifyq: "", notifymenu: false,
		month: "", busy: false, msg: "", err: "",
	},
	/** Every Leave Application for the chosen person, any status — read when
	    they are picked. The globally-loaded list holds only Open ones, because
	    that is what the approval queue is; a history that showed only what is
	    still open would read as somebody who has never taken leave. */
	applyHist: [],
	/** That person's Attendance for the month on screen, keyed `YYYY-MM-DD` to
	    its status, for the calendar's Absent colour. */
	applyAtt: {},

	/* The queue toolbar's own state. */
	apptab: "attendance",
	appq: "",
	appscope: "n:50",
	appgroup: "employee",
	appsel: new Set(),
	appshown: [],
	appmsg: "",
	appdialog: "",
	dlgmsg: "",

	/* The Other queue is a grid with its own filters and its own staged
	   decisions; none of it belongs to the card queues. */
	othf: {}, othtype: "", othact: {}, othmsg: "", othlog: [],

	/* On Board's own reads, fetched after the dashboard rather than with it:
	   Asset and the Employee document fields are the only calls on this page
	   that may not answer, and a module nobody has opened yet must not be able
	   to hold up the load everybody does open. */
	onboardRead: false,
	onboardBusy: false,
	docs: [],
	docTier: "",
	docErr: "",
	assets: [],
	assetMoves: [],
	assetErr: "",

	/** The letter being merged on On Board → Create Letter / Form. */
	letterType: "",
	letterEmp: "",
};

/* Seed the month pickers from the current month here rather than in a render.
   A default computed while rendering is a default that changes at midnight
   under somebody who left the tab open. */
initial.cal.month = thisMonth();
initial.apply.from = initial.apply.to = todayIso();

let state = initial;
const listeners = new Set();

function emit() {
	listeners.forEach((l) => l());
}

/** Read the store outside React — loaders and CSV exports need it. */
export const getState = () => state;

/** Shallow-merge a patch. Anything nested is replaced, never merged, so a
    caller has to say what it means: `set({cal: {...s.cal, month}})`. */
export function set(patch) {
	state = { ...state, ...patch };
	emit();
}

/** Patch one of the nested form objects without spelling out the spread. */
export function patch(key, part) {
	state = { ...state, [key]: { ...state[key], ...part } };
	emit();
}

/** For the handful of places that need the previous value to compute the next. */
export function update(fn) {
	set(fn(state));
}

function subscribe(l) {
	listeners.add(l);
	return () => listeners.delete(l);
}

/** Subscribe to one slice. The selector must return something stable by
    identity between renders, or React re-renders forever — so select values
    and arrays that already live in the store, never fresh objects. */
export function useStore(selector) {
	return useSyncExternalStore(
		subscribe,
		() => selector(state),
		() => selector(initial),
	);
}

/** The whole store. Every screen here re-reads all of it on any change, which
    is exactly what the page it replaces did on every keystroke — at this size
    it is cheap, and it is why the selected count, the checkboxes and the
    "N of M shown" line can never disagree. */
export const useApp = () => useStore((s) => s);
