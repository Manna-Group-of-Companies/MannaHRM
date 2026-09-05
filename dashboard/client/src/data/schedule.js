/* ---------------------------------------------------------------------------
   **Auto Report Scheduler** — the dialog behind ⏰ Schedule Report on Employee
   Detail and on Attendance Statutory, photographed on each of them and drawn in
   features/employees/ScheduleReport.jsx.

   Their form is fifteen controls and five buttons, and the interesting thing
   about it is how little of it ERPNext has anywhere to put.

   ## Two reports, and a second scheduler elsewhere

   Factor HR ships two schedulers, not one. This is the older single form; the
   three attendance reports open a newer two-step wizard instead
   (features/attendance/ScheduleReport.jsx). Both are photographed and both are
   drawn as photographed, because a copy that unified them would be describing a
   product neither half of Factor HR ships.

   Which report either dialog is for comes from `SREP_REPORTS` in
   data/schedreport.js — one registry, five reports, read by both. `SCHED_FOR`
   below is the two of them that land here.

   The Attendance Statutory capture also settled something the Employee Detail
   one left open: **the three Send To ticks are on this form too**, under Email
   To. They are drawn from `SREP_AUDIENCE` and resolved by `lib/audience.js`,
   the same as the wizard's — one definition of who "every active employee" is,
   for both dialogs.

   ## What backs it

   ERPNext's own scheduler is **`Auto Email Report`**: a report, a frequency, a
   list of addresses and a format, run by the bench's cron. It is a real answer
   to the same question and it is a *coarser* one, and the difference is the
   finding this screen exists to make visible:

     **Factor HR schedules the minute. ERPNext schedules the day.**

   Their Job Scheduler Type is "Monthly On Day And Hour And Minute", with three
   boxes under it for the day, the hour and the minute. `Auto Email Report` has
   `frequency` — Daily, Weekdays, Weekly, Monthly — and `day_of_week`, and the
   time of day is whenever the site's scheduler gets to it. So six of their
   controls have a field on the site and seven do not, and the seven are not a
   backlog: they are a different product's answer to scheduling.

   ## And nothing here schedules anything

   This dashboard is a browser tab. A schedule needs something running when
   nobody is watching, which is the same sentence the ⌛ Generate In Background
   button on the form behind this dialog already carries, and the same reason
   Send Bulk Email to Employee cannot send.

   So **Create/Update Schedule opens ERPNext's Auto Email Report with this form
   already filled in** — `deskNewWith`, the same hand-off Create Letter and the
   asset forms make. The schedule is created on the site, under the site's
   validation, by whoever is logged in there. What this form buys is that the
   questions are Factor HR's and the typing happens once.
   --------------------------------------------------------------------------- */

/** Which reports open *this* dialog rather than the newer two-step wizard —
    keys of `SREP_REPORTS` in data/schedreport.js, where every report's name and
    criteria line lives.

    Two, and they were photographed a fortnight apart on two different screens:
    Employee Detail's on 4 September 2026, and Attendance Statutory's later, the
    same form down to the five buttons. Which report a copy is for is fixed once
    it is open — the dialog belongs to that report's criteria form, and a
    scheduler that let you pick a different report from inside one would be a
    different screen. */
export const SCHED_FOR = ["ed", "stat"];

/* Their selects, in their words. Only the first option of each is legible in
   the capture — the lists are closed — so what is offered here is *this site's*
   answer to the heading rather than a copy of theirs, and each says which of
   its options ERPNext can actually honour. */

/** Report Output. Their default is PDF, and **PDF is the one ERPNext has not
    got**: `Auto Email Report.format` is HTML, XLSX or CSV. Offered anyway,
    because it is their default and a copy that quietly dropped it would hide
    the finding — picking it says so on the form. */
export const SCHED_FORMATS = [
	["PDF", "Not a format ERPNext's Auto Email Report offers. Its `format` is HTML, XLSX or CSV; a PDF "
		+ "would have to be rendered by something else. Left on the list because it is Factor HR's own "
		+ "default and dropping it would hide the difference."],
	["HTML", "ERPNext's default — the report as a table in the body of the mail."],
	["XLSX", "A spreadsheet attachment. The usual choice for a report somebody is going to sort."],
	["CSV", "A plain attachment. What this dashboard's own exports write."],
];

/** Dispatch Type. One option, and it is not a stub: ERPNext's scheduler mails
    and does nothing else. Anything Factor HR offers beyond it — a share, an
    FTP drop — would need somewhere to put the file that this site has not got. */
export const SCHED_DISPATCH = ["Email"];

/** Date Range Type — `Auto Email Report.dynamic_date_period`, whose own list
    this is. The one control on their form that maps across without an argument. */
export const SCHED_PERIODS = ["Daily", "Weekly", "Monthly", "Quarterly", "Half Yearly", "Yearly"];

/** Job Scheduler Type. Theirs reads "Monthly On Day And Hour And Minute", which
    is a sentence describing three boxes; ERPNext's `frequency` is a word.

    Their spelling is kept as the first option so the two can be held against
    each other, and the four ERPNext actually runs follow it. Picking theirs is
    allowed and says what the site will do with it — which is round it to
    Monthly and choose its own hour. */
export const SCHED_JOBS = [
	["Monthly On Day And Hour And Minute", "Monthly",
		"Factor HR's own, and the shape of the difference: it schedules a day, an hour and a minute. "
		+ "ERPNext's Auto Email Report schedules Monthly and the site's own scheduler decides when in "
		+ "the day it runs. The day, hour and minute below are carried into Remarks rather than into "
		+ "fields, because there are none."],
	["Daily", "Daily", "Every day, at whatever hour the site's scheduler reaches it."],
	["Weekdays", "Weekdays", "Monday to Friday. ERPNext's own option, with no equivalent on their list."],
	["Weekly", "Weekly", "Once a week. ERPNext takes the day of the week; it does not take the hour."],
	["Monthly", "Monthly", "Once a month, on a day the site's scheduler decides."],
];

export const SCHED_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
	"Saturday", "Sunday"];

/** Every control on their form, in their order and their words.

    `where` is the block it sits in — their layout is a two-column head (the
    identity of the schedule on the left, the date-range fieldset on the right)
    and then a single stack down to Remarks.

    `state` is the whole point of the table:

      live   there is a field on `Auto Email Report` for it, named in `field`,
             and Create/Update Schedule carries it over.
      build  their control, and no field of any name on this site. Drawn where
             they draw it and answered — not left out, because a control quietly
             dropped is a difference nobody remembers to ask about, and not
             wired to nothing either, because several of these are carried into
             `description` where they can at least be read by a person.

    `why` is on the label, as a tooltip, rather than printed under every box —
    the same choice the Create Employee wizard made after printing its hints
    turned a form into a page of grey reading. */
export const SCHED_FORM = [
	{ key: "report", label: "Report Name", kind: "fixed", where: "left", state: "live",
		field: "report",
		why: "The report this schedule sends. Fixed, because this dialog belongs to that report's "
			+ "criteria form — picking a different one from inside it would be a different screen. "
			+ "Which report it is comes from the screen that opened the dialog; see SCHED_FOR." },

	{ key: "name", label: "Name", kind: "text", where: "left", state: "build",
		why: "Their schedules carry a name of their own. ERPNext's Auto Email Report has no such box: "
			+ "the record is named by the site after the report it sends, so a site holds one schedule "
			+ "per report rather than several under different names. Carried into Remarks so the name "
			+ "somebody chose is at least readable on the record." },

	{ key: "format", label: "Report Output", kind: "select", where: "left", state: "live",
		field: "format",
		why: "`Auto Email Report.format`. Three of the four offered here are its own; see SCHED_FORMATS "
			+ "for the fourth." },

	{ key: "dispatch", label: "Dispatch Type", kind: "select", where: "left", state: "live",
		why: "ERPNext's scheduler mails and does nothing else, so this has one option. It is not a stub — "
			+ "anything else would need somewhere to put the file that this site has not got." },

	{ key: "period", label: "Date Range Type", kind: "select", where: "right", state: "live",
		field: "dynamic_date_period",
		why: "`Auto Email Report.dynamic_date_period` — the window of data each run covers, relative to "
			+ "the day it runs. The one control on this form that maps across without an argument." },

	{ key: "offset", label: "From Add / Less", kind: "number", where: "right", state: "build",
		why: "Shifts the window backwards or forwards by that many periods — last month rather than this "
			+ "one. ERPNext has no offset: `dynamic_date_period` is always the period ending now. Carried "
			+ "into Remarks, because a schedule that silently reported the wrong month would be worse "
			+ "than one that says a person has to check." },

	{ key: "disabled", label: "Disable Schedule", kind: "check", where: "right", state: "live",
		field: "enabled",
		why: "`Auto Email Report.enabled`, inverted — theirs asks whether it is off and ERPNext's asks "
			+ "whether it is on. The inversion is done on the way over rather than left to whoever reads "
			+ "the two forms side by side." },

	{ key: "to", label: "Email To", kind: "text", where: "wide", state: "live", field: "email_to",
		why: "`Auto Email Report.email_to`. Several addresses, comma separated." },

	{ key: "cc", label: "CC To", kind: "text", where: "wide", state: "build",
		why: "No CC on ERPNext's Auto Email Report — it has one address list and sends to it. Not merged "
			+ "into Email To on the way over: a person copied in and a person sent to are different "
			+ "things, and a form that quietly promoted one to the other would be lying about who the "
			+ "report went to." },

	{ key: "bcc", label: "BCC To", kind: "text", where: "wide", state: "build",
		why: "The same as CC, and more so: a blind copy silently promoted to a visible recipient is a "
			+ "confidence broken rather than a field lost." },

	{ key: "subject", label: "Subject", kind: "text", where: "wide", state: "build",
		why: "Frappe writes the subject itself, from the report's name and the period. There is no field "
			+ "to override it, so what is typed here is carried into Remarks rather than into the mail." },

	{ key: "message", label: "Message", kind: "textarea", where: "wide", state: "live",
		field: "description",
		why: "`Auto Email Report.description`, which Frappe puts in the body above the report. The one "
			+ "field on this half of the form that goes where it looks like it goes." },

	{ key: "job", label: "Job Scheduler Type", kind: "select", where: "wide", state: "live",
		field: "frequency",
		why: "`Auto Email Report.frequency`. Their first option describes three boxes and ERPNext's "
			+ "answer is a word — see SCHED_JOBS, which is where that difference is written down." },

	{ key: "day", label: "Day Number Of Month", kind: "number", where: "wide", state: "build",
		why: "ERPNext has `day_of_week` for a weekly schedule and nothing for a day of the month: a "
			+ "Monthly report goes out on a day its scheduler picks. Carried into Remarks." },

	{ key: "hour", label: "Hour", kind: "number", where: "wide", state: "build", suffix: "(in 24 hrs)",
		why: "There is no hour on ERPNext's Auto Email Report. The bench's scheduler runs the queue and "
			+ "the report goes when it is reached, which is the whole of the difference between the two "
			+ "products here: theirs schedules a minute, ERPNext's schedules a day." },

	{ key: "minute", label: "Minute", kind: "number", where: "wide", state: "build",
		why: "The same as Hour. Drawn because theirs is, and answered rather than left blank." },

	{ key: "remarks", label: "Remarks", kind: "text", where: "wide", state: "build",
		why: "No remarks field on ERPNext's Auto Email Report either — but `description` is free text and "
			+ "is where everything on this form with nowhere else to go ends up, this included. What goes "
			+ "there is shown before anything is opened." },
];

/** Their five buttons, and what each can honestly do here.

    `kind` is which of the three kinds of control it is: an act on this page,
    a hand-off to the desk, or dead. The dead one is dead for a reason that is
    about this API rather than about the site — see `why`. */
export const SCHED_ACTS = {
	fetch: "Re-read the criteria on the report form behind this dialog and restate the schedule from "
		+ "them — the subject, the message and the filter summary the schedule would carry. Their button "
		+ "refreshes a schedule's data; this is the same act against the only source of criteria there is "
		+ "here, which is the form this dialog was opened from.",
	create: "Opens ERPNext's Auto Email Report on the site with this form already filled in. The schedule "
		+ "is created there, by whoever is logged in there, under the site's own validation — nothing on "
		+ "this dashboard schedules anything, because a schedule needs something running when nobody is "
		+ "watching and this is a browser tab.",
	list: "The schedules that already exist, on the site. `Auto Email Report` is not on this server's "
		+ "allowlist, so they cannot be listed here — and adding a doctype to the allowlist of a process "
		+ "holding a System Manager token is a decision for whoever owns that key.",
	remove: "Nothing here can delete a schedule. This API refuses DELETE on every doctype but two, by "
		+ "name, in server/src/doctypes/registry.ts — and it could not name the right schedule anyway, "
		+ "because it cannot read the list. Delete it from List, on the site.",
};

/** An untouched scheduler, and the only definition of one.

    A function rather than an object for the reason `NEW_EMP_BLANK` is one: two
    callers sharing a mutable literal is how a dialog reopened comes back
    holding somebody else's address list.

    The three seeded values are the three their own capture shows filled in, and
    each is the answer that is true of every schedule this form will ever make
    rather than a guess: the report is fixed, Email is the only dispatch there
    is, and PDF is what their form opens on. */
export const SCHED_BLANK = (key = "ed") => ({
	open: false,
	/** Which report it was opened for — a key of SREP_REPORTS, and one of
	    SCHED_FOR. Held for the reason the wizard holds one: opening this dialog
	    from the other report must not show it the answers somebody typed for
	    this one, under the other one's name. */
	for: key,
	f: {
		name: "",
		format: "PDF",
		dispatch: "Email",
		period: "Monthly",
		offset: "0",
		disabled: false,
		to: "", cc: "", bcc: "", subject: "", message: "",
		/* Their three Send To ticks, which the Attendance Statutory capture shows
		   on this form too — between Email To and CC To, exactly where the wizard
		   puts them. What each resolves to is SREP_AUDIENCE, in
		   data/schedreport.js: one definition for both dialogs, because two
		   schedulers disagreeing about who "every active employee" is would be
		   worse than either of them being wrong on its own. */
		emps: false, mgrs: false, nosub: false,
		job: "Monthly On Day And Hour And Minute",
		weekday: "Monday",
		day: "", hour: "", minute: "", remarks: "",
	},
	msg: "",
});
