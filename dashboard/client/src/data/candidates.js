/* ---------------------------------------------------------------------------
   Import employee(s) from onboarding — Factor HR's own screen, reached from
   Employee Master's ⋯ menu and drawn in
   features/employees/ImportOnboarding.jsx.

   **Their screen is a card list, not a table**, and that is the one thing about
   it worth copying deliberately. Eight labelled cells per person, laid out in a
   row under a name line that carries the actions — which is a shape a table
   cannot make, because six of the eight cells are empty on a typical row and
   six empty columns read as a broken query rather than as a candidate nobody
   has filled in yet. A label sitting over a dash says "nothing here"; a column
   of dashes says "nothing came back".

   What backs it is `Employee Onboarding`, added to this site on 4 Sep 2026 —
   see server/src/doctypes/onboard.ts, which says field by field which half of
   the record is ERPNext's own and which half is ours. Before that this menu
   item opened the ERPNext desk, which is the right answer for a write and the
   wrong one for a list: what somebody wants when they press *Import From
   Onboarding* is to see who is waiting.
   --------------------------------------------------------------------------- */

/** Their eight columns, in their order, under the labels their screen uses.

    `key` is the field on `Employee Onboarding`; `kind` decides how the cell is
    drawn — a date is `dmy`, a stamp is date and time, everything else is text.

    `link` is the colour, and it is copied rather than chosen: on their screen
    the six cells that belong to *the candidate* are in the accent colour when
    they hold anything, and the two that record who last touched the row are in
    body text. That is a real distinction and worth keeping — the first six are
    what somebody reads to decide whether this person can be pulled, and the
    last two are provenance.

    `late` marks the four that only exist because this doctype is ours. A site
    carrying stock ERPNext refuses the long read, `load.js` falls back, and
    these four say "not read" rather than showing a dash — an empty cell and an
    unasked question look identical and mean opposite things.

    EMPCODE is first and is empty on nearly every row, which is the finding
    rather than a fault: a code is issued when somebody is *created*, so a
    candidate carrying one already has been pulled. Factor HR's own capture
    shows a dash there on both of its rows. */
export const ONB_CELLS = [
	{ key: "employee_number", label: "Empcode", kind: "text", link: true, late: true },
	{ key: "employee_code_series", label: "Employee Code Series", kind: "series", link: true, late: true },
	{ key: "date_of_birth", label: "Date Of Birth", kind: "date", link: true, late: true },
	{ key: "date_of_joining", label: "Date Of Joining", kind: "date", link: true },
	{ key: "cell_number", label: "Mobile No", kind: "text", link: true, late: true },
	{ key: "personal_email", label: "Personal Email", kind: "text", link: true, late: true },
	{ key: "modified_by", label: "Last Action By", kind: "text" },
	{ key: "modified", label: "Last Action On", kind: "stamp" },
];

/** What a cell of a column the read did not carry says, on the cell itself. */
export const NOT_READ = "This column is not on ERPNext's own Employee Onboarding — it is one of the four "
	+ "this site adds. The site refused the longer field list, so nothing is claimed here: an empty cell "
	+ "would be indistinguishable from a candidate nobody has filled in.";

/** What EMPLOYEE CODE SERIES means here, on the label rather than on the page.

    Factor HR's own two rows both read "Manual Entry", and so does every row
    here — because it is the only honest value on this site. A series name in
    that cell would mean the site hands the code out when the record is created,
    and nothing here does: `Employee` is named `HR-EMP-nnnnn` by the naming
    series, and `employee_number` — the code people actually quote — is typed.
    So the pull asks for it rather than inventing one. */
export const SERIES_WHY = "Manual Entry means the employee code is typed when the record is created rather "
	+ "than handed out by a series. It is the only value this site can honestly show: nothing here "
	+ "allocates an employee code, so Pull Candidate asks for one.";

/** The status chip on a card, as `[label, class]`. Keyed by `boarding_status`,
    with the pulled state overriding all three — a candidate who has become an
    employee is done whatever their checklist says. */
export const ONB_STATE = {
	Pending: ["Pending", "off"],
	"In Process": ["In Process", "part"],
	Completed: ["Completed", "live"],
};

/** Why a card's Pull Candidate is dead, by the thing that is missing.

    Checked in this order and only the first is said, because a candidate with
    no name and no joining date has one problem — nobody has finished entering
    them — and listing both would make it look like two.

    These are the site's own refusals, said before the request rather than
    after: `Employee` will not take a document without a joining date, a company
    or a status, and finding that out from a refusal at the end is the cruel way
    to learn it. That is the same bargain `lib/newemp.js` makes for the Create
    Employee wizard, and this list is deliberately the shorter one — a candidate
    is not a finished employee record and the form that opens is where the rest
    is filled in. */
export const PULL_BLOCKS = [
	["employee_name", "This candidate has no name on the record, so there is nothing to create."],
	["date_of_joining", "No date of joining. The site refuses an Employee without one, so this has to be "
		+ "entered on the candidate before they can be pulled."],
	["company", "No company on the candidate. The site refuses an Employee without one."],
];

/** The glyphs this screen draws, as path data. Kept here beside the columns for
    the reason every other icon table in `src/data/` is where it is: a stroke
    path is not a decision a component should be carrying. */
export const ONB_ICON = {
	/* No glyph for Pull Candidate: theirs is a worded button and so is this. A
	   row already carrying two icon actions gains nothing from a third mark in
	   front of the words that say what the control does. */
	pencil: "M4 20h4L20 8l-4-4L4 16Z",
	/* Their box-and-arrow: open this record where it is maintained. */
	out: "M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
	search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
	refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4",
	/* The bulk glyph: several people, one arrow. */
	bulk: "M9 11a3.4 3.4 0 1 0 0-6.8A3.4 3.4 0 0 0 9 11M2 20v-1.4A4.6 4.6 0 0 1 6.6 14h4.8"
		+ "M16 14v6M13 17l3 3 3-3",
};

/** What Bulk Import does, in the words the button needs to carry.

    It is the same act as Pull Candidate, run down a list, and saying so on the
    control matters: an *import* on every other screen in this app means a
    spreadsheet, and this one takes no file. The rows it works on are the ones
    ticked here. */
export const BULK_WHY = "Pull every ticked candidate — one Employee created per row, each under the site's "
	+ "own validation, and each candidate marked as taken once their record exists. It reads no file: the "
	+ "rows are the ones ticked on this page.";

/** The one thing this screen cannot do, said where somebody would look for it.

    Their pencil edits the candidate. Nothing here does: `Employee Onboarding`
    is on this API's read list and its PUT allowlist holds two fields — the
    employee a pull created and the state that follows from it. A candidate's
    details are corrected where they were entered, which is what the desk link
    beside it opens. */
export const EDIT_WHY = "Their pencil edits the candidate here. This dashboard writes two fields on an "
	+ "onboarding record — the employee a pull created, and the state that follows from it — and nothing "
	+ "else, so a candidate's details are corrected on the site. This opens them there.";

/** An untouched Import from onboarding screen, and the only definition of one.

    A function rather than an object for the reason `NEW_EMP_BLANK` is one: two
    callers sharing a mutable literal is how a cleared screen comes back holding
    the last run's ticks. `store/initialState.js` opens with a copy of this and
    Employee Master's ⋯ resets to another on the way in — a log naming
    candidates that have since been created is worse than no log.

    Here rather than in the component so nothing has to import a page to clear
    it: `registry.jsx` imports every page, and a page importing another page
    back is a cycle nobody wants to reason about at module-evaluation time. */
export const ONB_BLANK = () => ({
	q: "", sel: [], code: {}, ask: "", bulk: false, busy: "", msg: "", log: [],
});
