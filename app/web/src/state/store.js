import { useSyncExternalStore } from "react";
import { thisMonth, todayIso } from "@/lib/format";

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
	/** Which of the two correction doctypes answered — it decides where a
	    decision would later be written. See pendingRegularizations. */
	regDoctype: "Attendance Regularization",

	/* ---- connection ---- */
	conn: "connecting…",
	connState: "",

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

	/** Category Type opens one value list at a time, the way that screen
	    navigates — View Category replaces the list rather than stacking. */
	catopen: "",

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
		emp: "", status: "Active", tab: "criteria", from: "", till: "",
		logo: true, shift: true, weekoff: false, when: "", count: 0, busy: false, err: "",
	},
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
	},
	ctcRun: false, ctcMsg: "", ctcPick: false,

	/* The In / Out Activity report. Its date range is the one control on this
	   page that has to reach the site — everything else filters what came back
	   — so nothing is fetched until Generate is pressed. */
	io: {
		emp: "", status: "Active", by: "", period: "Date Wise", from: "", till: "",
		t1: "00:00", t2: "23:59", selfie: true, logo: true, logtype: "", stream: "",
		tab: "criteria", more: false, menu: false,
	},
	ioRows: null, ioState: "", ioMsg: "", ioRan: "",

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
