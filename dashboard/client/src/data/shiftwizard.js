/* ---------------------------------------------------------------------------
   **The shift wizard** — behind the ✎ on every row of SHIFT & WORK PATTERN,
   photographed 4 September 2026 and drawn in
   features/attendance/ShiftWizard.jsx.

   Three steps, and no numbered strip across the top: theirs says which choice
   you are inside — `CURRENT SELECTION : TIME BASED` — and gives you Previous,
   Next and Cancel. Drawn that way rather than with the stepper the Schedule
   Report wizard has, because that stepper is on that dialog and not on this
   one.

     1  a name, IS DEFAULT, and four kinds of shift as radio buttons
     2  the break tick, the shift window, and the two tolerances either side
     3  Grace timings — one grace for the shift, or grace by category

   ## What backs it

   ERPNext's `Shift Type`, and this is the one master on the dashboard where the
   two products very nearly agree. Eight of their controls have a field:

     SHIFT START / END              start_time / end_time
     BUT EMPLOYEE CAN COME EARLY BY begin_check_in_before_shift_start_time
     BUT EMPLOYEE CAN GO LATE BY    allow_check_out_after_shift_end_time
     GRACE START                    late_entry_grace_period
     GRACE END                      early_exit_grace_period

   And the disagreement is in one place — **what a shift fundamentally is.**
   ERPNext has exactly one kind: a window, with tolerances and grace either
   side. Factor HR's step 1 offers four, and three of them are a different
   answer to the question rather than a setting on the same one. That is the
   finding this dialog exists to make visible, and it is on the radio buttons
   themselves.

   ## Nothing here writes

   `Shift Type` is `creatable: false` on this API — see
   server/src/doctypes/registry.ts, and the standing rule that this dashboard
   reads. So Save hands off to the site, and *which* hand-off depends on
   something worth saying out loud:

     · a shift this site does not hold yet opens as a **new** Shift Type with
       everything typed here already in it, through Frappe's `new` route;
     · a shift it does hold opens as **that document**, and the answers cannot
       ride along — Frappe takes query-string defaults on a new document and not
       on an existing one.

   The dialog says which of the two it is about to do, before it does it.
   --------------------------------------------------------------------------- */

/** Their three steps. The label is the heading their step draws — step 3 is the
    only one that draws one, so the first two are named here for the buttons and
    for a reader, not for the screen. */
export const SHW_STEPS = [
	["kind", "Shift type"],
	["timing", "Shift timing"],
	["grace", "Grace timings"],
];

/* ---------------------------------------------------------------------------
   Step 1 — the four kinds.

   `blurb` is their italic line under each, word for word, question mark
   included. `why` is behind the ⓘ they put beside it, and is this repo's
   answer rather than theirs: what ERPNext would do with that choice.

   `state` is the usual three-value question:

     live   `Shift Type` is this, and the fields on step 2 mean what they say.
     part   ERPNext can be made to behave this way through fields that exist,
            but it is a configuration rather than a kind of shift.
     build  a different answer to "what is a shift" than ERPNext has, and no
            arrangement of its fields produces it.
   --------------------------------------------------------------------------- */
export const SHW_KINDS = [
	{ key: "time", label: "Time Based", state: "live",
		blurb: "Employee need to come on fix working timings ?",
		why: "This is what ERPNext's Shift Type *is*: a start, an end, and tolerances either side. "
			+ "Everything on the next two steps lands in a field, which is true of this choice and of "
			+ "no other on the list." },

	{ key: "flexi", label: "Flexi Shift", state: "build",
		blurb: "Employee need to complete defined hours (continously) during day but timing is not fixed ?",
		why: "A duration with no window. ERPNext's shift is a window — `start_time` and `end_time` are "
			+ "required for the attendance job to mark anybody against it — so there is nowhere to put "
			+ "\"eight hours, whenever\". Its working-hours thresholds decide half day and absent within "
			+ "a shift; they do not replace the shift." },

	{ key: "capture", label: "Capture Work Hours", state: "part",
		blurb: "Need to record employee's total hours worked during entire day, first punch consider IN "
			+ "punch and second to be considered OUT punch ?",
		why: "The closest of the three to something ERPNext can do, and it is a pair of settings rather "
			+ "than a kind of shift: `determine_check_in_and_check_out` reading alternating entries, and "
			+ "`working_hours_calculation_based_on` set to first check-in and last check-out. Neither is "
			+ "on this site's Shift Type model, so the shift still needs a window here." },

	{ key: "auto", label: "Autoshift", state: "build",
		blurb: "Employee may come to any shift, system to auto decide the shift for the day based on "
			+ "punch timings?",
		why: "The shift is decided by the punch rather than by the roster. ERPNext does the opposite and "
			+ "does it on purpose: a punch is measured against the Shift Assignment that already names "
			+ "the day, which is what makes an absence provable. There is no field for this because it "
			+ "is the other half of a different design." },
];

/** Step 2's controls, in their order and their words.

    `field` is the Shift Type field it lands in — and the two tolerances are
    minutes on both sides, which is the one thing about this step that could
    quietly go wrong. Factor HR labels them in no unit at all; ERPNext's are
    minutes; so the form says minutes on the control. */
export const SHW_TIMING = [
	{ key: "hasbreak", label: "This shift contains break", kind: "check", state: "build",
		blurb: "(if this shift does have defined break like lunch break then this option needs to be checked)",
		why: "No break on ERPNext's Shift Type — not a field, not a child table. A lunch hour is "
			+ "deducted, if it is deducted at all, by whatever computes working hours, and this site does "
			+ "not compute them. Ticking it is carried into the new document's remarks rather than "
			+ "silently dropped." },

	{ key: "start", label: "Shift start (24 hrs)", kind: "time", state: "live", field: "start_time",
		why: "`Shift Type.start_time`. Held as `HH:MM:SS` rather than an instant — a shift starts at "
			+ "half past eight wherever the reader is." },

	{ key: "end", label: "Shift end (24 hrs)", kind: "time", state: "live", field: "end_time",
		why: "`Shift Type.end_time`. A shift ending before it starts is an overnight shift, which this "
			+ "form allows and says it is allowing." },

	{ key: "early", label: "But employee can come early by", kind: "mins", state: "live",
		field: "begin_check_in_before_shift_start_time",
		why: "`begin_check_in_before_shift_start_time` — how long before the start a punch still counts "
			+ "as this shift's. Minutes. ERPNext defaults it to 60; Factor HR's form opens on 0, and "
			+ "theirs is what is drawn." },

	{ key: "late", label: "But employee can go late by", kind: "mins", state: "live",
		field: "allow_check_out_after_shift_end_time",
		why: "`allow_check_out_after_shift_end_time`, the same thing at the other end. Minutes, and the "
			+ "same default difference." },
];

/** Step 3. Their radio picks between one grace for everybody on the shift and
    grace per category — and only the first has anywhere to go. */
export const SHW_GRACE = [
	{ key: "gstart", label: "Grace start", state: "live", field: "late_entry_grace_period",
		blurb: "(Late coming will not be calculated until given minutes in field is exceed)",
		why: "`Shift Type.late_entry_grace_period`. Minutes after the start before a late mark is "
			+ "earned. ERPNext pairs it with `enable_entry_grace_period`, which this site's model has "
			+ "not got — so a grace of 0 and no grace at all are the same thing here." },

	{ key: "gend", label: "Grace end", state: "live", field: "early_exit_grace_period",
		blurb: "(Early going will not be calculated until given minutes in field is exceed)",
		why: "`Shift Type.early_exit_grace_period`, the same at the other end." },
];

/** Their two grace modes. The second is the finding on this step. */
export const SHW_GRACE_MODES = [
	{ key: "all", label: "If grace time applicable to all employee which are falling under this shift",
		state: "live",
		why: "One grace for the shift, which is what ERPNext holds: the two grace fields are on the "
			+ "Shift Type and apply to everybody assigned to it." },

	{ key: "cat", label: "If grace time applicable by category", state: "build",
		why: "Grace that differs by category — the same category master the shift list's own CATEGORY "
			+ "COUNT column counts. ERPNext has one grace per shift and no way to vary it per person or "
			+ "per group, so this choice has nowhere to land. It is offered because it is theirs, and "
			+ "picking it says on the form what the site will actually do: apply the numbers above to "
			+ "everybody, or nothing at all if they are left blank." },
];

/** An untouched wizard, and the only definition of one.

    `name` is seeded by the row the ✎ was clicked on, and the rest are the
    values their own capture opens with — 08:30 to 17:30, everything else zero,
    Time Based and grace-for-all selected. `doc` is what the site holds for this
    shift once it has been read, or null; `state` walks the read. */
export const SHW_BLANK = (name = "") => ({
	open: false,
	step: "kind",
	/* The row the wizard was opened from, which is not the same as the name in
	   the box: somebody may rename it, and Save has to know which document it
	   was meant to be about. */
	row: name,
	/** Whether this site holds a Shift Type of that name — set by the read, and
	    what decides which hand-off Save makes. `null` until it is known. */
	ours: null,
	state: "",
	err: "",
	f: {
		name,
		isdefault: false,
		kind: "time",
		hasbreak: false,
		start: "08:30",
		end: "17:30",
		early: "0",
		late: "0",
		gmode: "all",
		gstart: "0",
		gend: "0",
	},
	msg: "",
	bad: false,
});
