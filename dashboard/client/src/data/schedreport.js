import { ED_STATUSES } from "@/data/employees";

/* ---------------------------------------------------------------------------
   **SCHEDULE REPORT** — the wizard behind Create Schedule Report in the Generate
   menu on the In / Out Activity and Daily Detail Attendance criteria forms,
   photographed 4 September 2026 and drawn in
   features/attendance/ScheduleReport.jsx.

   One wizard, two reports. What differs between them is a name and a line of
   criteria, and both live in SREP_REPORTS below; everything else on the form is
   the same form.

   This is *not* the same dialog as Employee Detail's Auto Report Scheduler
   (data/schedule.js). It is Factor HR's newer chrome for the same job: two
   numbered steps across the top — **Report Detail**, then **Scheduling
   Detail** — with Next / Cancel at the foot instead of one long form and five
   buttons. Both are kept, drawn as each screen actually draws them, because a
   copy that unified them would be describing a product neither half of Factor
   HR ships.

   ## What is photographed and what is not

   The capture is step 1, twice — the head of it, and the foot with CC To, BCC
   To, Message and the buttons. **Step 2 has never been opened.** So nothing
   here invents Factor HR's second step: it is assembled from the controls the
   older scheduler's capture already documents, in `data/schedule.js`, which are
   the scheduling half of that form — Report Output, the date-range group, Job
   Scheduler Type and the day / hour / minute under it. The lists themselves are
   imported from there rather than retyped, so the two dialogs cannot drift into
   offering different frequencies for the same site.

   ## What backs it — and it is still `Auto Email Report`

   Everything data/schedule.js says about the gap holds here word for word:
   ERPNext schedules a *day* and Factor HR schedules a *minute*, and nothing on
   this dashboard runs when nobody is watching, so Create Schedule opens
   ERPNext's own `Auto Email Report` with this form already filled in.

   ## The three Send To ticks, which are new here

   Employee Detail's scheduler has one address box. This one has three
   checkboxes above it that name an *audience* rather than an address — active
   employees, their managers, active employees with nobody under them — and
   that is a different kind of thing to a list of addresses:

     **a rule is evaluated when it runs; a list is fixed when it is saved.**

   `Auto Email Report.email_to` is a list. So a tick here is resolved *now*,
   against the employee master this dashboard already has loaded, into the
   addresses it names — and the dialog says how many and shows them before
   anything opens, because a schedule that quietly mailed last quarter's joiners
   and none of this quarter's would be worse than one that never sent.
   --------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   The reports this wizard can be opened from.

   Five, and **not all of them open the same dialog** — which is the reason this
   is one registry rather than one per screen.

   Factor HR ships two schedulers. Three attendance reports open the newer
   two-step wizard (features/attendance/ScheduleReport.jsx); Employee Detail and
   Attendance Statutory open the older single form with five buttons along the
   bottom (features/employees/ScheduleReport.jsx). Both are photographed, both
   are drawn as photographed, and both need the same two facts about whichever
   report they were opened from. So the facts live here, once, and each dialog
   reads them:

     io    In / Out Activity            wizard
     dda   Daily Detail Attendance      wizard
     mb    Monthly Basic Attendance     wizard
     ed    Employee Detail              single form
     stat  Attendance Statutory         single form

   Which chrome a report gets is not recorded here on purpose: it is decided by
   the page that opens the dialog, because that is where it is actually known —
   and a flag here saying "wizard" would be a second place for the two to
   disagree about a screen that has already been photographed.

   **No date range in any of these lines, on purpose.** All three criteria forms
   carry one, and none of them belongs in a schedule: what a *run* covers is
   Date Range Type on step 2 — `Auto Email Report.dynamic_date_period` — which
   is a window relative to the day it runs. Copying the range that happens to be
   on screen into the schedule's summary would describe last week for ever.

   Each entry is the two things that actually differ between them:

     `report`    the name that heads the dialog and goes to the site as
                 `Auto Email Report.report`. It is fixed per screen, because the
                 dialog belongs to that report's criteria form — picking a
                 different report from inside one would be a different screen.

     `criteria`  how *that* form's filters read as one line. Off the criteria
                 form behind the dialog rather than off anything typed in it: a
                 schedule describing different criteria from the screen it was
                 opened from is a schedule nobody could check.

   The key is the store slice each form lives in — `io` and `dda` — so there is
   no third name to keep in step with the two that already exist. */
export const SREP_REPORTS = {
	io: {
		report: "In / Out Activity Report",
		criteria: (s) => {
			const f = s.io;
			const bits = [];
			if (s.company) bits.push(s.company);
			bits.push(f.status ? f.status + " employees" : "every status");
			if (f.emp.trim()) bits.push(`matching "${f.emp.trim()}"`);
			if (f.logtype) bits.push(f.logtype + " punches only");
			if (f.stream) bits.push(f.stream + " punches only");
			if (f.t1 !== "00:00" || f.t2 !== "23:59") bits.push(`between ${f.t1} and ${f.t2}`);
			if (f.by) bits.push("grouped by " + f.by);
			bits.push(f.period);
			return bits.join(", ");
		},
	},

	dda: {
		report: "Daily Detail Attendance Report",
		criteria: (s) => {
			const f = s.dda;
			const bits = [];
			if (s.company) bits.push(s.company);
			bits.push(f.status ? f.status + " employees" : "every status");
			/* Their form has both a picked employee and a search box, and only one
			   of them can be true at a time — the search is how the employee is
			   picked. Named rather than counted, because a summary saying "1
			   employee" is a summary nobody can check against the screen. */
			if (f.emp) bits.push(s.byName?.[f.emp]?.employee_name || f.emp);
			else if (f.q.trim()) bits.push(`matching "${f.q.trim()}"`);
			if (f.punch) bits.push(f.punch);
			/* Weekday numbers as `Date.getDay` gives them, which is the same order
			   this list is written in — see the `dow` note in the store. */
			if (f.dow.length && f.dow.length < 7) {
				const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
				bits.push(f.dow.slice().sort().map((d) => days[d]).join(" / ") + " only");
			}
			if (f.by) bits.push("grouped by " + f.by);
			bits.push(f.period === "month" ? "Month Wise" : "Date Wise");
			return bits.join(", ");
		},
	},

	mb: {
		report: "Monthly Basic Attendance Report",
		criteria: (s) => {
			const f = s.mb;
			const bits = [];
			if (s.company) bits.push(s.company);
			bits.push(f.status ? f.status + " employees" : "every status");
			/* Their Particular Employee is a select of docnames here rather than a
			   search box, so there is always a name to give when one is picked. */
			if (f.emp) bits.push(s.byName?.[f.emp]?.employee_name || f.emp);
			if (f.by) bits.push("grouped by " + f.by);
			/* The two layout ticks that change what is *in* the document. With Logo
			   is deliberately not among them: it is a letterhead, and a schedule
			   summary is about the figures. */
			if (f.shift) bits.push("with shift code");
			if (f.weekoff) bits.push("day status shown on week offs and holidays");
			/* Their Report Period select has one option on this screen. Said anyway,
			   because the other two reports say theirs and a summary that is silent
			   on one screen reads as a summary that missed something. */
			bits.push("Date Wise");
			return bits.join(", ");
		},
	},

	/* The two on the older single form. Neither has the toolbar the three above
	   share; their criteria are the filter set each report is built from. */

	ed: {
		report: "Employee Detail Report",
		/* Employee Detail's filters, which is where this summariser has always
		   lived — lifted here unchanged when the second dialog needed one too. */
		criteria: (s) => {
			const bits = [];
			const statuses = s.edStatus ?? ED_STATUSES;
			if (statuses.length && statuses.length < ED_STATUSES.length) bits.push(statuses.join(" / "));
			if (s.empSel) bits.push(s.byName[s.empSel]?.employee_name || s.empSel);
			if (s.edMgr) bits.push("reporting to " + (s.byName[s.edMgr]?.employee_name || s.edMgr));
			if (s.edJoinA || s.edJoinB) bits.push(`joined ${s.edJoinA || "…"} to ${s.edJoinB || "…"}`);
			if (s.edSepA || s.edSepB) bits.push(`separated ${s.edSepA || "…"} to ${s.edSepB || "…"}`);
			if (s.edDobA || s.edDobB) bits.push(`born ${s.edDobA || "…"} to ${s.edDobB || "…"}`);
			if (s.edAgeA || s.edAgeB) bits.push(`aged ${s.edAgeA || "…"} to ${s.edAgeB || "…"}`);
			return bits.length ? bits.join(", ") : "everybody, no filters set";
		},
	},

	stat: {
		report: "Attendance Statutory Report",
		criteria: (s) => {
			const f = s.sr;
			const bits = [];
			if (s.company) bits.push(s.company);
			bits.push(f.status ? f.status + " employees" : "every status");
			if (f.emp) bits.push(s.byName?.[f.emp]?.employee_name || f.emp);
			/* Their Report Type list has never been seen open, so this site's own
			   is what the form offers — and an unset one is said as unset rather
			   than as a default nobody chose. */
			bits.push(f.type ? f.type : "no report type chosen");
			if (f.by) bits.push("grouped by " + f.by);
			if (f.code) bits.push("with employee code");
			if (f.hidehdr) bits.push("header hidden");
			/* The one criteria line of the five that carries a period, because on
			   this form the period is not a date range — it is which of two shapes
			   the report is, and the schedule cannot infer it. */
			bits.push(f.mode === "month" ? "Month wise" : "Date wise");
			return bits.join(", ");
		},
	},
};

/** The default, and the only one anything falls back to. A dialog opened
    without a report is a bug rather than a state, but it must not be a blank
    screen while somebody finds out. */
export const SREP_DEFAULT = "io";

/** The stepper across the top. Two steps, and their labels. */
export const SREP_STEPS = [
	["detail", "Report Detail"],
	["sched", "Scheduling Detail"],
];

/** Dispatch Type. One option, and see data/schedule.js — ERPNext's scheduler
    mails and does nothing else, so this is a full list rather than a stub. */
export const SREP_DISPATCH = ["Email"];

/* ---------------------------------------------------------------------------
   Step 1 — Report Detail.

   `where` is the cell of their two-column head: `l` is the left column, `r` the
   right, `wide` spans both. `need` marks the three boxes their form fills pale
   yellow, which is Factor HR's mark for an answer it wants before Next.

   `state` is the same three-value question the other scheduler's table asks —
   `live` means there is a field of that name on `Auto Email Report` and Create
   Schedule carries it over; `build` means their control, and no field of any
   name on this site.
   --------------------------------------------------------------------------- */
export const SREP_STEP1 = [
	{ key: "report", label: "Report Name", kind: "fixed", where: "l", state: "live", field: "report",
		why: "The report this schedule sends. Drawn as text rather than as a box because their form "
			+ "draws it as text — the dialog belongs to the criteria form behind it." },

	{ key: "disabled", label: "Is Disabled", kind: "check", where: "r", state: "live", field: "enabled",
		why: "`Auto Email Report.enabled`, inverted — theirs asks whether it is off and ERPNext's asks "
			+ "whether it is on. The inversion happens on the way over rather than being left to whoever "
			+ "reads the two forms side by side." },

	{ key: "name", label: "Name", kind: "text", where: "l", need: true, state: "build",
		why: "Their schedules carry a name of their own. `Auto Email Report` has no such box: the record "
			+ "is named by the site after the report it sends, so a site holds one schedule per report "
			+ "rather than several under different names. Carried into the description, so the name "
			+ "somebody chose is at least readable on the record." },

	{ key: "dispatch", label: "Dispatch Type", kind: "select", where: "r", state: "live",
		why: "One option, and it is not a stub — anything beyond mail would need somewhere to put the "
			+ "file that this site has not got." },

	{ key: "subject", label: "Subject", kind: "text", where: "l", need: true, state: "build",
		why: "Frappe writes the subject itself, from the report's name and the period, and there is no "
			+ "field to override it. What is typed here goes into the description instead — visible on "
			+ "the record, not on the mail." },

	{ key: "to", label: "Email To", kind: "text", where: "r", need: true, state: "live", field: "email_to",
		why: "`Auto Email Report.email_to`. Several addresses, comma separated. The three ticks below "
			+ "resolve into this box rather than into a rule the site could re-evaluate — see "
			+ "SREP_AUDIENCE." },

	{ key: "cc", label: "CC To", kind: "text", where: "l", state: "build",
		why: "No CC on ERPNext's Auto Email Report — it has one address list and sends to it. Deliberately "
			+ "not merged into Email To on the way over: a person copied in and a person sent to are "
			+ "different things, and a form that quietly promoted one to the other would be lying about "
			+ "who the report went to." },

	{ key: "bcc", label: "BCC To", kind: "text", where: "r", state: "build",
		why: "The same as CC, and more so: a blind copy silently promoted to a visible recipient is a "
			+ "confidence broken rather than a field lost." },

	{ key: "message", label: "Message", kind: "textarea", where: "wide", state: "live", field: "description",
		why: "`Auto Email Report.description`, which Frappe puts in the body above the report. The one "
			+ "field on this step that goes where it looks like it goes." },
];

/** The three Send To ticks, between Email To and CC To on their form.

    `pick` is how each is resolved against the employee master this dashboard
    has loaded — the whole argument for doing it that way is in the header
    above. `why` says what it means and what it costs.

    Scoped by the company on the top bar, like every other count on this
    dashboard: an audience that ignored the picker would mail a company nobody
    on screen was looking at. */
export const SREP_AUDIENCE = [
	{ key: "emps", label: "Send To Active Employees",
		pick: (rows) => rows.filter((e) => e.status === "Active"),
		why: "Everybody Active in the company on the top bar, at the address the site holds for them. "
			+ "Resolved now, into a list — ERPNext's Auto Email Report takes addresses, not a rule, so a "
			+ "joiner next month is not on this schedule until somebody edits it." },

	{ key: "mgrs", label: "Send To Manager Of Active Employees",
		pick: (rows) => {
			const mgr = new Set(rows.filter((e) => e.status === "Active").map((e) => e.reports_to).filter(Boolean));
			return rows.filter((e) => mgr.has(e.name));
		},
		why: "The distinct `reports_to` of everybody Active — the managers, once each, however many people "
			+ "report to them. A manager who has left is still somebody's reporting manager on the record, "
			+ "so this can name an inactive employee; it is left in rather than filtered, because the "
			+ "stale link is the finding." },

	{ key: "nosub", label: "Send To Active Employees Without Their Sub-ordinates",
		pick: (rows) => {
			const mgr = new Set(rows.map((e) => e.reports_to).filter(Boolean));
			return rows.filter((e) => e.status === "Active" && !mgr.has(e.name));
		},
		why: "Active employees who are nobody's reporting manager — the individual contributors, the "
			+ "complement of the tick above. Their wording is ambiguous and this is the reading that makes "
			+ "the pair of ticks add up to everybody; the other reading, 'send to each employee a copy "
			+ "covering only themselves', would need a per-person report and this schedule sends one file." },
];

/* ---------------------------------------------------------------------------
   Step 2 — Scheduling Detail.

   Not photographed. Every control here is one the older scheduler's own capture
   shows, moved to the step its heading says it belongs on, and its `why` is the
   argument already made in data/schedule.js rather than a new claim about a
   screen nobody has opened. Said out loud on the dialog too, under the step
   heading — a step assembled from a sister dialog and a step copied off a
   photograph must not read the same.
   --------------------------------------------------------------------------- */
export const SREP_STEP2 = [
	{ key: "format", label: "Report Output", kind: "select", where: "l", state: "live", field: "format",
		why: "`Auto Email Report.format` — HTML, XLSX or CSV. PDF is on the list because it is Factor HR's "
			+ "own default, and picking it says on the form that the site will send HTML instead." },

	{ key: "period", label: "Date Range Type", kind: "select", where: "r", state: "live",
		field: "dynamic_date_period",
		why: "`Auto Email Report.dynamic_date_period` — the window of punches each run covers, relative to "
			+ "the day it runs. The one control on either step that maps across without an argument." },

	{ key: "offset", label: "From Add / Less", kind: "number", where: "l", state: "build",
		why: "Shifts that window by whole periods — last month rather than this one. ERPNext has no "
			+ "offset: `dynamic_date_period` is always the period ending now. Carried into the description, "
			+ "because a schedule that silently reported the wrong month is worse than one that says a "
			+ "person has to check." },

	{ key: "job", label: "Job Scheduler Type", kind: "select", where: "wide", state: "live",
		field: "frequency",
		why: "`Auto Email Report.frequency`. Their first option is a sentence describing three boxes and "
			+ "ERPNext's answer is a word — see SCHED_JOBS in data/schedule.js, which is where that "
			+ "difference is written down." },

	{ key: "day", label: "Day Number Of Month", kind: "number", where: "l", state: "build",
		why: "ERPNext has `day_of_week` for a weekly schedule and nothing for a day of the month: a monthly "
			+ "report goes out on a day its scheduler picks. Carried into the description." },

	{ key: "hour", label: "Hour", kind: "number", where: "r", state: "build", suffix: "(in 24 hrs)",
		why: "There is no hour on ERPNext's Auto Email Report. The bench's scheduler runs the queue and the "
			+ "report goes when it is reached — the whole of the difference between the two products is "
			+ "this box." },

	{ key: "minute", label: "Minute", kind: "number", where: "l", state: "build",
		why: "The same as Hour. Drawn because theirs is, and answered rather than left blank." },

	{ key: "remarks", label: "Remarks", kind: "text", where: "wide", state: "build",
		why: "No remarks field either — but `description` is free text and is where everything on this "
			+ "wizard with nowhere else to go ends up, this included. What goes there is shown in full "
			+ "before anything is opened." },
];

/** What the wizard's own buttons can honestly do. */
export const SREP_ACTS = {
	next: "The three yellow boxes are the ones their form wants before it will move on — a name for the "
		+ "schedule, a subject, and somebody to send it to. A Send To tick counts as the third: it resolves "
		+ "into the address box, so a schedule is never saved with nowhere to go.",
	back: "Back to Report Detail. Nothing is lost either way — the wizard is one form drawn two steps at a "
		+ "time, not two forms.",
	create: "Opens ERPNext's Auto Email Report on the site with this wizard already filled in. The schedule "
		+ "is created there, by whoever is logged in there, under the site's own validation — nothing on "
		+ "this dashboard schedules anything, because a schedule needs something running when nobody is "
		+ "watching and this is a browser tab.",
	list: "The schedules that already exist, on the site. `Auto Email Report` is not on this server's "
		+ "allowlist, so they cannot be listed here — and adding a doctype to the allowlist of a process "
		+ "holding a System Manager token is a decision for whoever owns that key.",
};

/** An untouched wizard, and the only definition of one.

    A function rather than an object for the reason SCHED_BLANK is one: two
    callers sharing a mutable literal is how a dialog reopened comes back
    holding somebody else's address list.

    The seeded values are the ones true of every schedule this form will make
    rather than guesses — the report is fixed, Email is the only dispatch there
    is, and PDF and Monthly are what their forms open on. */
export const SREP_BLANK = (key = SREP_DEFAULT) => ({
	open: false,
	/** Which report it was opened for — a key of SREP_REPORTS. Held so that
	    opening the wizard from the other report cannot show it the answers
	    somebody typed for this one under the wrong Report Name. */
	for: key,
	step: "detail",
	f: {
		report: (SREP_REPORTS[key] || SREP_REPORTS[SREP_DEFAULT]).report,
		disabled: false,
		name: "",
		dispatch: "Email",
		subject: "",
		to: "",
		emps: false, mgrs: false, nosub: false,
		cc: "", bcc: "", message: "",
		format: "PDF",
		period: "Monthly",
		offset: "0",
		job: "Monthly On Day And Hour And Minute",
		weekday: "Monday",
		day: "", hour: "", minute: "", remarks: "",
	},
	msg: "",
	bad: false,
});

/* ---------------------------------------------------------------------------
   **SCHEDULE REPORT LIST** — behind View Scheduled Reports in the same menu,
   and behind ▤ List inside the wizard. Photographed 4 September 2026, empty:
   their DataTables chrome — Show N entries, a search box, six sortable columns,
   "Showing 0 to 0 of 0 entries" and Previous / Next.

   ## It is drawn, and it will almost certainly be empty

   The rows would come from `Auto Email Report`, and this server does not carry
   that doctype: `server/src/doctypes/registry.ts` is a list of models and it is
   not on it, so the read comes back 417 UnknownDoctype with the reason on it.

   That is *not* the same thing as having no schedules, and the whole design of
   this dialog is that the two never look alike. An empty table says which of
   them it is, in the words the server used, with the way to go and look on the
   site underneath it. A list that quietly drew "No data available in table"
   over a refused read would be telling somebody their schedules do not exist.

   And the read is really made, every time it opens. If whoever owns the site's
   token ever adds the doctype, this list fills in on its own — nothing here is
   hard-coded to be empty.
   --------------------------------------------------------------------------- */

/** The page sizes in their Show N entries select. DataTables' own default set,
    which is what their capture shows the first of. */
export const SREP_PAGES = [10, 20, 50, 100];

/** Their six columns, in their order and their spelling — EMAILTO is one word
    on their header and is left that way.

    `field` is what the row is read out of; `state` is the same question the two
    form tables ask, and two of the six answer `build`:

      **CC and BCC are columns for fields that do not exist.** `Auto Email
      Report` has one address list. Their list has a column for each, so each is
      drawn and each says so on the cell rather than being dropped — a column
      quietly missing from a copy is a difference nobody remembers to ask about,
      and these two are the same difference the wizard's own CC / BCC boxes
      carry. */
export const SREP_LIST_COLS = [
	{ key: "name", label: "Name", field: "name", state: "live",
		why: "The document's own name on the site. `Auto Email Report` is named after the report it "
			+ "sends, which is why a site holds one schedule per report rather than several — the Name "
			+ "box on the wizard has nowhere to go for exactly that reason." },

	{ key: "to", label: "EmailTo", field: "email_to", state: "live",
		why: "`Auto Email Report.email_to` — everybody the run is mailed to, as one comma-separated list." },

	{ key: "cc", label: "CC", state: "build",
		why: "No CC on `Auto Email Report`: it has one address list and sends to it. The column is theirs "
			+ "and is drawn; what would fill it does not exist on this site." },

	{ key: "bcc", label: "BCC", state: "build",
		why: "The same as CC. A blind copy is not a thing this doctype can hold." },

	{ key: "off", label: "Is Disable", field: "enabled", state: "live",
		why: "`Auto Email Report.enabled`, inverted — theirs asks whether it is off and ERPNext's asks "
			+ "whether it is on. Read the same way round it is written on the wizard." },

	{ key: "act", label: "Action", state: "part",
		why: "Edit opens the schedule on the site, which is the only place it can be changed. Delete is "
			+ "drawn and dead: this API refuses DELETE on every doctype but two, by name, in "
			+ "server/src/doctypes/registry.ts." },
];

/** An unopened list. `rows` is `null` until something has been asked, which is
    a different state from `[]` — nothing asked yet and nothing there are the
    two things this dialog exists to keep apart. */
export const SREP_LIST_BLANK = (key = SREP_DEFAULT) => ({
	open: false,
	/** Which report's schedules are being listed — a key of SREP_REPORTS. The
	    rows are held to it, because the list is reached from one report's own
	    menu and a screen titled for that report showing every schedule on the
	    site would be a different screen. */
	for: key,
	rows: null,
	state: "",
	err: "",
	/* The HTTP status of the last refusal. 417 is "this site does not carry that
	   doctype" and anything else is "the site did not answer", and the dialog
	   says which — they read alike and are fixed by different people. */
	status: 0,
	q: "",
	size: 20,
	page: 0,
	sort: "name",
	dir: 1,
});
