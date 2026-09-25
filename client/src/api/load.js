import { api, apiDelete, deskBase, listAll, whoami } from "./client";
import { getState, patch, set, NO_APPROVALS } from "@/store";
import { DOC_BACKFILL } from "@/data/onboard";
import { loadCategoryTypes } from "@/api/categorytype";
import { readShiftTypes } from "@/api/shifttype";
import { lastOfMonth, todayIso } from "@/lib/format";
import { LEAVE_TYPE_NAME } from "@/lib/monthlyleave";

export const EMP_FIELDS_MIN = [
	"name", "employee_name", "employee_number", "company", "department", "designation",
	"attendance_device_id", "reports_to", "date_of_joining", "status", "default_shift",
];
export const EMP_FIELDS = EMP_FIELDS_MIN.concat([
	"salutation", "grade", "branch", "employment_type", "holiday_list", "ctc",
	/* Contact, for Factor HR's List of Employees — see EmployeeList.jsx. All
	   four were read off the live Employee doctype on 31 August 2026 before being
	   asked for, because one field this site does not have sends the whole read to
	   the EMP_FIELDS_MIN fallback below — which would quietly drop the pay figure
	   and empty Salary Master. */
	"cell_number", "prefered_email", "company_email", "personal_email",
	/* The photograph's URL, for the cards on Employee Master. Stock on ERPNext's
	   Employee — it is the doctype's `image_field` — so it cannot be the field
	   that sends this read to the fallback. The bytes are not read here; the
	   browser fetches each one as its card scrolls into view. */
	"image",
	/* The login, for Apply Leave's Leave Approver list — hrms takes a User
	   there, not an Employee. Stock on Employee. */
	"user_id",
]);

/* The Create Letters register — see features/onboard/CreateLetters.jsx, which
   draws Factor HR's own list of issued letters column for column.

   Split the same way the Employee list is, and for the same reason: three of
   the seven columns were added to `Employee Letter` after this dashboard first
   read one, and asking a site for a field it has not got refuses the whole
   read — Frappe answers 417 and returns nothing, rather than quietly dropping
   the column it did not recognise. Falling back to the short list draws
   the four columns that are certainly there and leaves the other three saying
   the site could not answer — which beats an empty register on a site that has
   letters in it. */
export const LETTER_FIELDS_MIN = [
	"name", "employee", "employee_name", "letter_type", "letter_date",
];
export const LETTER_FIELDS = LETTER_FIELDS_MIN.concat([
	"letter_number", "reference_number", "remarks",
]);

export const CHECKIN_FIELDS_MIN = ["name", "employee", "time", "log_type"];
export const CHECKIN_FIELDS = CHECKIN_FIELDS_MIN.concat(["device_id", "latitude", "longitude"]);

/* The correction queue.

   **The short name on this site is taken, and it is not ours.** The sales
   system next door (C:\SALES_DASHBOARD) owns `Attendance Regularization` —
   module Selling, keyed to `Sales Person`, carrying live rows, and using
   `Initiated` where this one uses `Pending Approval`. Writing to it would put
   an HR correction into a sales queue nobody here reads.

   So this app's doctype is `Employee Attendance Regularization`, under that
   name in the repo as well as on the site — there is no longer a short name to
   try first and no guess about which one answered. `regDoctype` stays in the
   store because the desk links and the approval queue read it, and because a site
   that has neither should say so rather than silently write somewhere.

   A read that fails is not fatal: an empty queue must not blank the rest of the
   dashboard. */
export const REG_DOCTYPE = "Employee Attendance Regularization";

const REG_FIELDS = [
	"name", "employee", "employee_name", "company", "attendance_date", "requested_in", "requested_out",
	"reason", "status", "approver_type", "decided_by", "decided_on", "decision_note",
	"creation", "owner", "modified", "modified_by",
];

/* What the queue falls back to when the site refuses REG_FIELDS. The site holds
   this doctype as `custom: 1`, built by hand, and one field it lacks — say
   `decision_note` — is a 417 on the whole read. Without this, every request a
   company login raised was saved and then invisible to the approver, which
   reads as "the request never arrived" (17 September 2026). */
const REG_MIN = ["name", "employee", "attendance_date", "requested_in", "requested_out",
	"reason", "status", "creation", "owner"];

export async function pendingRegularizations() {
	/* A refused read is `null` and an empty queue is `[]`, and those are opposite
	   findings — a site with this doctype and no open corrections is the normal
	   state. The site's own reason is kept, so the page can say it rather than
	   guess at permissions. */
	const open = [["status", "=", "Pending Approval"]];
	let why = "";
	const rows = await listAll(REG_DOCTYPE, REG_FIELDS, open)
		.catch(() => listAll(REG_DOCTYPE, REG_MIN, open))
		.catch((e) => { why = (e && e.message) || String(e); return null; });

	set({ regDoctype: rows ? REG_DOCTYPE : "", regQueueErr: why });
	return rows || [];
}

/* Holiday dates come one document at a time: the list endpoint returns names,
   and the dates are a child table. Fetched after the first paint so a slow
   holiday list never holds up the page, and each one guarded on its own so a
   list that cannot be read leaves the others readable. */
export async function loadHolidayDates() {
	for (const h of getState().holidayLists) {
		const doc = await api("/api/resource/Holiday List/" + encodeURIComponent(h.name))
			.then((r) => r.data).catch(() => null);
		if (doc) set({ holidays: { ...getState().holidays, [h.name]: doc.holidays || [] } });
	}
}

/* What the status line in the top bar says when a load fails.
 *
 * Frappe answers a refused request with its own JSON — `{"exc_type":
 * "AuthenticationError"}` — and putting that straight into the chrome printed a
 * raw object next to "Hi admin". The status line has room for about four words,
 * so it gets four words; the status code rides along because it is the one
 * detail that tells somebody which of these it actually is. */
function connMessage(err) {
	const status = err && err.status;
	const text = String((err && err.message) || err);
	if (status === 401) return "signed out";
	if (status === 403) return "not permitted (403)";
	// The site's own daily compute limit, which reads as a dead site otherwise.
	if (status === 429) return "daily limit reached";
	if (status >= 500) return `site error (${status})`;
	if (/timeout|aborted/i.test(text)) return "timed out";
	if (/network|fetch failed|ECONNREFUSED/i.test(text)) return "no connection";
	// Anything genuinely unexpected still gets shown, just not a whole payload.
	return text.replace(/\s+/g, " ").slice(0, 40);
}

export async function load() {
	set({ connState: "", conn: "loading…" });
	/* The desk the controls that write link out to — this origin in production,
	   where the site serves this page, and `VITE_DESK_URL` in development, where
	   it does not. Fire-and-forget and never fatal: the dashboard reads
	   perfectly well without knowing, and an install that names no desk leaves
	   those controls disabled with the reason on them. */
	void deskBase().then((url) => set({ site: url }));
	try {
		const today = todayIso();
		const [emps, companies, checkins, shifts, holidays, leavetypes, attendance, depts, desigs,
			regs, leaves, ltypes, letters, worklocs] = await Promise.all([
			/* Categories, CTC and Calendar each count a field the directory never
			   needed. Asking for a field a site does not have is a 417 on the whole
			   call, and the whole call is the dashboard — so the richer list is tried
			   and the original one is what it falls back to. */
			listAll("Employee", EMP_FIELDS).catch(() => listAll("Employee", EMP_FIELDS_MIN)),
			/* `default_holiday_list` is what the Calendar screen's "Default Calendar"
			   tick reads. Asked for with the same fallback as the employee list. */
			listAll("Company", ["name", "abbr", "default_holiday_list"])
				.catch(() => listAll("Company", ["name", "abbr"])),
			/* The coordinate is what lets Today's Punches say where a phone punch was
			   made. hrms carries both fields, but a site on an older Employee
			   Checkin would refuse the whole read — and this read is the dashboard
			   — so the four fields every site has are what it falls back to. */
			listAll("Employee Checkin", CHECKIN_FIELDS, [["time", ">=", today + " 00:00:00"]])
				.catch(() => listAll("Employee Checkin", CHECKIN_FIELDS_MIN,
					[["time", ">=", today + " 00:00:00"]])),
			readShiftTypes(),
			listAll("Holiday List", ["name"]),
			/* Whether a type is earned monthly is what Create Employee needs to
			   know before it offers "N a month" of it. Falls back to names like
			   the reads around it: this read is the dashboard. */
			listAll("Leave Type", ["name", "is_earned_leave", "earned_leave_frequency"])
				.catch(() => listAll("Leave Type", ["name"])),
			listAll("Attendance", ["name"]),
			/* `disabled` is the Status column on the screen behind View Category.
			   Department is the only one of these three masters that carries such a
			   field at all, and asking for one a site does not have is a 417 on the
			   whole call — so it falls back like the others. */
			listAll("Department", ["name", "disabled"]).catch(() => listAll("Department", ["name"])),
			listAll("Designation", ["name"]),
			pendingRegularizations(),
			listAll("Leave Application",
				["name", "employee", "employee_name", "company", "leave_type", "from_date", "to_date",
					"half_day", "half_day_date", "total_leave_days", "leave_balance", "leave_approver",
					"leave_approver_name", "posting_date", "status", "description", "creation", "owner",
					"modified", "modified_by"],
				[["status", "=", "Open"]]).catch(() => []),
			listAll("Letter Type", ["name", "category", "is_active", "fields_used"])
				.catch(() => []),
			/* Which of the two lists answered is carried out with the rows, not
			   inferred from them afterwards: a letter with no reference number
			   comes back without the key either way, so the rows cannot tell an
			   unfilled column from an unread one. That is the same distinction
			   `regDoctype` above exists to keep. */
			listAll("Employee Letter", LETTER_FIELDS)
				.then((rows) => ({ rows, full: true }))
				.catch(() => listAll("Employee Letter", LETTER_FIELDS_MIN)
					.then((rows) => ({ rows, full: false })))
				.catch(() => ({ rows: [], full: false })),
			/* The custom doctypes are not installed on every site yet (CLAUDE.md
			   §7), so a site still holding them as `custom: 1` — or not at all —
			   answers this with nothing rather than a 417 that would take the
			   whole load down with it. */
			listAll("Work Location", ["name", "location_name", "is_active"]).catch(() => []),
		]);

		set({
			employees: emps,
			byName: Object.fromEntries(emps.map((e) => [e.name, e])),
			checkins,
			/* The five queues with no doctype behind them stay empty rather than
			   absent — see NO_APPROVALS. Their tabs are field lists, not backlogs. */
			approvals: Object.assign(NO_APPROVALS(), { attendance: regs || [], leave: leaves || [] }),
			letterTypes: (ltypes || []).filter((t) => t.is_active !== 0),
			letters: letters.rows || [],
			letterCols: letters.full,
			companies: companies || [],
			/* A company-locked login (tools/create_company_users.py) gets exactly one
			   Company back, so the picker is set to it rather than left on "All" —
			   which for that login would read the same rows and say the wrong name
			   above them. The lock itself is the site's User Permission. */
			...((companies || []).length === 1 ? { company: companies[0].name } : {}),
			holidayLists: holidays || [],
			/* The names as well as the count: Apply Leave fills its type dropdown
			   from this, and the six in Factor HR are not necessarily the six here. */
			leaveTypes: leavetypes || [],
			shiftTypes: shifts.rows,
			shiftCo: shifts.company,
			departments: depts || [],
			designations: desigs || [],
			// Active only — see initialState.js.
			workLocations: (worklocs || []).filter((l) => l.is_active !== 0),
			counts: {
				companies: companies.length, shift: shifts.length, holiday: holidays.length,
				leavetype: leavetypes.length, attendance: attendance.length,
				departments: depts.length, designations: desigs.length, left: 344,
			},
			connState: "live",
			conn: "live",
		});

		void loadHolidayDates();
		/* Every screen that draws a punch-in says how far it was from the gate,
		   so this is read once for all of them, after the paint. */
		void loadWorkLocations();
		/* After the paint, and never fatal. It is one small read that only the
		   Categories screen wants, and `Custom Field` is System Manager's doctype
		   to read — so an HR User signing in must not have the whole dashboard
		   fail on the way past it. `loadCategoryTypes` swallows its own error and
		   records which kind it was. */
		void loadCategoryTypes();
	} catch (err) {
		set({ connState: "bad", conn: connMessage(err) });

		/* Has the session gone — expired, or signed out on the desk? Asked
		   rather than inferred from the status, because Frappe does not answer a
		   lapsed session with 401. It falls back to Guest and then refuses the
		   read on permissions, so what arrives is **403**, which is the same code
		   as a real employee who may not read `Employee`. Those two need
		   different screens: the sign-in form, or the dashboard saying it is not
		   permitted. One extra request on a path that has already failed is worth
		   not guessing.

		   Checked against the live site on 5 September 2026 — a Guest read of
		   `/api/resource/Employee` answers 403 PermissionError. */
		if (err && (err.status === 401 || err.status === 403)) {
			const who = await whoami().catch(() => "");
			if (who === "Guest") set({ user: "" });
		}
	}
}

/* Work Pattern's one read, on the same terms as On Board's: made the first time
   somebody opens that half of Manage Shift, never fatal, and remembered so a
   re-render cannot ask twice.

   `Shift Assignment` is what answers "who is measured against which shift"
   here — Factor HR carries it down the category instead, which is the finding
   the other half of that screen is about. An empty answer is a real answer: it
   means nothing has been rostered, and nothing can be generated from punches
   until it has. */
/** Apply Leave's own read: one person's whole leave history, and their
    Attendance for the month the calendar is showing.

    Two calls rather than one because they are two doctypes, and both are
    narrow — one employee, and a month. The history is not filtered by status:
    an application that was rejected is the thing somebody is looking for when
    they open this screen.

    Attendance is asked for last and its failure is swallowed. The site has no
    Attendance rows at all yet, and a calendar that refuses to draw because the
    colour nobody can fill could not be fetched would be the tail wagging the
    dog. */
export async function loadLeaveFor(emp, ym) {
	if (!emp) return set({ applyHist: [], applyAtt: {}, applyPunch: {}, applyBal: null });
	void loadLeaveBalance(emp);
	patch("apply", { busy: true, err: "" });
	try {
		const hist = await listAll("Leave Application",
			["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "half_day",
				"half_day_date", "total_leave_days", "leave_balance", "posting_date", "status",
				"description", "creation", "modified", "modified_by"],
			[["employee", "=", emp]]);
		set({ applyHist: hist || [] });
	} catch (err) {
		/* Once more with only the columns the calendar and the table need. The
		   site has answered the full list with a bare 500 — no message, nothing
		   to tell which column it choked on — and a history that cannot be read
		   must not also blank the calendar that reads it. */
		const fewer = await listAll("Leave Application",
			["name", "leave_type", "from_date", "to_date", "half_day", "half_day_date",
				"total_leave_days", "posting_date", "status"],
			[["employee", "=", emp]]).catch(() => null);
		if (fewer) {
			set({ applyHist: fewer });
		} else {
			patch("apply", { err: "Leave history could not be read — " + String(err.message || err).slice(0, 200) });
			set({ applyHist: [] });
		}
	}

	const att = {};
	if (ym) {
		const rows = await listAll("Attendance", ["name", "attendance_date", "status"],
			[["employee", "=", emp], ["attendance_date", ">=", ym + "-01"], ["attendance_date", "<=", lastOfMonth(ym)]])
			.catch(() => []);
		(rows || []).forEach((r) => { att[String(r.attendance_date).slice(0, 10)] = r.status || ""; });
	}
	set({ applyAtt: att });

	/* The punches as well as the Attendance rows. Attendance is only written by
	   hrms's shift job, and until that runs for somebody their month is blank
	   even though the fingerprint machine saw them every morning. The first and
	   last punch of each day are what the calendar shows; they are facts about
	   the machine, not a status, and nothing here turns them into one. */
	const punch = {};
	if (ym) {
		const rows = await listAll("Employee Checkin", ["name", "time"],
			[["employee", "=", emp], ["time", ">=", ym + "-01 00:00:00"], ["time", "<=", lastOfMonth(ym) + " 23:59:59"]])
			.catch(() => []);
		(rows || []).forEach((r) => {
			const t = String(r.time || "");
			const day = t.slice(0, 10);
			const hm = t.slice(11, 16);
			if (!day || !hm) return;
			const d = (punch[day] ||= { first: hm, last: hm, n: 0 });
			if (hm < d.first) d.first = hm;
			if (hm > d.last) d.last = hm;
			d.n += 1;
		});
	}
	set({ applyPunch: punch });
	patch("apply", { busy: false });
}

/** What this person has left of each leave type, today, in hrms's own words.

    `get_leave_details` is the same call the desk's Leave Application form makes
    to fill its balance table, so the number here is the number the site will
    measure an application against — computed there, from the Leave Allocation
    and its ledger, and never re-derived here. Casual Leave grows by one on the
    1st of each month once HR has run tools/setup_monthly_leave.py.

    `null` is "not read yet"; `{ rows: [] }` is "the site has given this person
    no leave at all", which the page says in words rather than drawing zeros. */
export async function loadLeaveBalance(emp) {
	set({ applyBal: null });
	try {
		const r = await api("/api/method/hrms.hr.doctype.leave_application.leave_application.get_leave_details",
			{ employee: emp, date: todayIso() });
		const alloc = r?.message?.leave_allocation || {};
		/* The dates each allocation covers, which get_leave_details does not
		   say. An application outside them is refused with "Application period
		   cannot be outside leave allocation period", and the only way to make
		   that sentence useful is to show the period beside the balance. */
		const periods = await listAll("Leave Allocation", ["leave_type", "from_date", "to_date"],
			[["employee", "=", emp], ["docstatus", "=", 1]]).catch(() => []);
		const span = {};
		for (const p of periods || []) {
			const t = p.leave_type;
			const a = String(p.from_date).slice(0, 10);
			const b = String(p.to_date).slice(0, 10);
			(span[t] ||= []).push([a, b]);
		}
		const rows = Object.entries(alloc).map(([type, a]) => ({
			type,
			total: Number(a.total_leaves) || 0,
			taken: Number(a.leaves_taken) || 0,
			pending: Number(a.leaves_pending_approval) || 0,
			expired: Number(a.expired_leaves) || 0,
			remaining: Number(a.remaining_leaves) || 0,
			periods: (span[type] || []).sort((x, y) => x[0].localeCompare(y[0])),
		}));
		/* The monthly leave's ledger, for the calendar's carry line — see
		   monthCarry in lib/monthlyleave.js. Read, never written: it is on
		   NEVER_WRITE in lib/write.js. */
		const ledger = await listAll("Leave Ledger Entry",
			["leaves", "from_date", "to_date", "transaction_type", "is_expired"],
			[["employee", "=", emp], ["leave_type", "=", LEAVE_TYPE_NAME], ["docstatus", "=", 1]]).catch(() => []);
		if (getState().apply.emp === emp) set({ applyBal: { rows, ledger: ledger || [] } });
	} catch (err) {
		if (getState().apply.emp === emp) {
			set({ applyBal: { rows: [], err: String(err.message || err).slice(0, 220) } });
		}
	}
}

/** The Leave Balance Report's own read: every *approved* leave application on
    the site, which is what "availed" on that report means.

    A separate read because the one on open does not cover it. That one asks for
    `status = "Open"` — it is filling an approval queue, where an application
    already decided is not a row. Availed is the opposite population, so asking
    for it is a second query rather than a wider first one: the queue is read on
    every page load and this is read only by somebody who opened the report.

    Fired once and guarded by its own state flag, the same way the Work Pattern
    read is. `lvbState` is set before the first await so the re-render it causes
    cannot ask again.

    **The entitlement half is the leave ledger**, read beside it since 24
    September 2026, when Give monthly leave started putting allocations on the
    site: see lib/leavebalance.js for how it is added up. It is its own catch —
    a login refused the ledger still gets Availed, and the report says which
    columns that leaves empty rather than drawing them as zero. */
export async function loadLeaveBalances() {
	if (getState().lvbState) return;
	set({ lvbState: "loading" });
	try {
		const rows = await listAll("Leave Application",
			["name", "employee", "employee_name", "company", "leave_type", "from_date", "to_date",
				"half_day", "half_day_date", "total_leave_days", "status", "posting_date"],
			[["status", "=", "Approved"]]);
		/* Read, never written: it is on NEVER_WRITE in lib/write.js. */
		const ledger = await listAll("Leave Ledger Entry",
			["employee", "leave_type", "leaves", "from_date", "transaction_type", "is_carry_forward", "is_expired"],
			[["docstatus", "=", 1]]).catch(() => null);
		set({ lvbRows: rows || [], lvbLedger: ledger, lvbState: "done" });
	} catch (err) {
		/* An empty report and a report that could not be read are different
		   things, and the screen says which. */
		set({ lvbRows: [], lvbLedger: null, lvbState: "error", lvbErr: String(err.message || err).slice(0, 220) });
	}
}

/* Final Settlement's own read: the exit half of `Employee`.
 *
 * A separate call rather than five more fields on the one every page load
 * makes, because this is the only screen that wants them and that call is
 * already the widest thing this app does. Guarded by its own state flag and
 * fired the first time somebody opens the page, the same way Work Pattern's is.
 *
 * **Not filtered by status, deliberately.** Somebody serving notice is still
 * Active and is exactly who this queue is for — which is what Factor HR's own
 * capture shows: sixteen people waiting, and not one of them with a date of
 * leaving on the record. Filtering on `status != "Active"` would have returned
 * a list of people who had already gone, and quietly missed everybody the
 * screen exists to chase.
 *
 * `notice_number_of_days` is the one field here that some sites do not carry,
 * and asking for a field a site does not have is a 417 on the whole call — so
 * the narrow list is the fallback, and the page draws EXP DOL as absent rather
 * than as empty when it lands. */
const SEP_BASE = ["name", "employee_name", "employee_number", "company", "department",
	"designation", "status", "date_of_joining"];
const SEP_FULL = SEP_BASE.concat(["relieving_date", "resignation_letter_date",
	"notice_number_of_days", "reason_for_leaving", "held_on"]);
const SEP_LESS = SEP_BASE.concat(["relieving_date", "resignation_letter_date"]);

export async function loadSeparations() {
	if (getState().sepState) return;
	set({ sepState: "loading" });

	const rows = await listAll("Employee", SEP_FULL)
		.catch(() => listAll("Employee", SEP_LESS))
		.catch((e) => e);

	if (Array.isArray(rows)) set({ seps: rows, sepState: "ok" });
	else set({ seps: [], sepState: connMessage(rows) });
}

/* The surveyed places a phone punch is described against — "35 m from Main
   Gate" rather than two numbers nobody can read. Ours, so a site without
   `manna_hr` has no such doctype; that leaves the Location column showing the
   coordinate and its map and nothing else, which is why this is never fatal.
   Guarded like Work Pattern's read so a re-render cannot ask twice. */
export async function loadWorkLocations() {
	if (getState().workLocState) return;
	set({ workLocState: "loading" });
	const rows = await listAll("Work Location",
		["name", "location_name", "latitude", "longitude", "is_active"]).catch(() => null);
	set({ workLocs: rows || [], workLocState: rows ? "ok" : "error" });
}

export async function loadShiftAssignments() {
	if (getState().shAssignState) return;
	set({ shAssignState: "loading" });

	const FULL = ["name", "employee", "employee_name", "shift_type", "company",
		"start_date", "end_date", "status", "docstatus"];
	const STD = ["name", "employee", "shift_type", "start_date"];
	const rows = await listAll("Shift Assignment", FULL)
		.catch(() => listAll("Shift Assignment", STD))
		.catch((e) => e);

	if (Array.isArray(rows)) set({ shAssign: rows, shAssignState: "ok" });
	else set({ shAssign: [], shAssignState: connMessage(rows) });
}

/* On Board's own reads, and they are allowed to fail. Three of these four calls
   are onto doctypes nobody has confirmed holds anything, and a module still
   being compared must not be able to blank the page everybody opens — so this
   runs after the dashboard has rendered, catches everything, and records *why*
   it came back empty.

   "The field is not on this site" and "the request was refused" are different
   findings, and only the first is about the data. Each read therefore tries a
   full field list, falls back to the fields ERPNext ships, and remembers which
   of the two answered. */
export async function loadOnBoard() {
	set({ assetErr: "", docErr: "", fileErr: "", onboardBusy: true, onboardRead: true });

	const EMP_STD = ["name", "employee_name", "employee_number", "company", "status",
		"passport_number", "valid_upto", "date_of_issue", "place_of_issue"];
	const EMP_FULL = EMP_STD.concat(DOC_BACKFILL.map((f) => f[0]));

	const docs = await listAll("Employee", EMP_FULL).catch(() => null);
	if (docs) {
		set({ docs, docTier: "full", docErr: "" });
	} else {
		/* The seven custom fields were added on 25 Aug. If they are absent the
		   coverage panel quotes the export instead, and says so on the page. */
		await listAll("Employee", EMP_STD)
			.then((r) => set({ docs: r, docTier: "standard", docErr: "" }))
			.catch((e) => set({ docs: [], docTier: "", docErr: String(e.message || e).slice(0, 160) }));
	}

	/* The Asset Type master, behind the Assets Details form's Asset Type box and
	   behind the "Add Asset Types" dialog that maintains it. Read here rather
	   than with the dashboard because it is On Board's alone, and never fatal:
	   a site without the doctype draws the box as free text, which is what this
	   screen did before the master existed. */
	await listAll("Asset Category", ["name", "asset_category_name", "creation"])
		.then((r) => set({ assetCats: r || [], assetCatErr: "" }))
		.catch((e) => set({ assetCats: [], assetCatErr: String(e.message || e).slice(0, 160) }));

	/* The scans behind those numbers — Frappe's `File`, filtered to the ones
	   attached to an Employee.

	   One read for the whole register rather than one per row. Eleven documents
	   is eleven requests the moment a paperclip is drawn per row, and the pager
	   shows five at a time, so a lazy per-row fetch would also mean the icon
	   cannot say whether there is anything behind it until after it is clicked —
	   which makes every clip look live and two thirds of them lie.

	   Keyed on `<employee>:<field>` here rather than in the component, because
	   the component draws this five rows at a time and would rebuild the index
	   on every page turn and every keystroke in Search.

	   Failure is not fatal and is not silent. A site with no File doctype on the
	   allowlist answers 417 and every clip goes dead — which is correct — but it
	   must say "not read" rather than "nothing attached", so the reason is kept.

	   `is_private` is asked for and not used yet. It is the field that decides
	   whether a scan may be opened at all once this API grows a login, and a
	   column that arrives with the row is one nobody has to remember to add
	   before that check can be written. */
	const FILE_FIELDS = ["name", "file_name", "file_url", "file_type", "file_size",
		"is_private", "attached_to_name", "attached_to_field", "creation"];
	await listAll("File", FILE_FIELDS, [["attached_to_doctype", "=", "Employee"]])
		.then((rows) => {
			const byField = {};
			for (const f of rows || []) {
				if (!f.attached_to_name || !f.attached_to_field) continue;
				const key = f.attached_to_name + ":" + f.attached_to_field;
				(byField[key] ||= []).push(f);
			}
			set({ docFiles: byField, fileErr: "" });
		})
		.catch((e) => set({ docFiles: {}, fileErr: String(e.message || e).slice(0, 160) }));

	/* `department` was in this list and is not on `Asset` — not on ours and not
	   on ERPNext's, where an asset's department is the custodian's rather than
	   the asset's. So the long read was refused every single time and the short
	   one answered every single time, which is exactly the false negative
	   query/fields.ts warns about: the register drew Location, Purchased and
	   Value as columns of dashes, and a register whose value column is empty
	   reads as a company that has not bought anything.

	   The four after `gross_purchase_amount` are ERPNext's own and were added to
	   our Asset on 3 Sep 2026 for Factor HR's Assets Details form. See
	   ASSET_FORM in data/onboard.js. */
	/* `docstatus` is on all three lists rather than only the long one, and it is
	   the one field here that cannot send a read to the fallback: every doctype
	   carries it by construction (see BASE_FIELDS on the server). It has to
	   arrive, because Assets Details offers Edit on a record and a *submitted*
	   asset is history — the PUT route refuses one, so a form that does not know
	   would offer a button that always fails. */
	const AST_FULL = ["name", "asset_name", "item_code", "asset_category", "company", "status",
		"docstatus", "location", "custodian", "purchase_date", "gross_purchase_amount",
		"asset_quantity", "warranty_expiry_date", "supplier", "serial_no"];
	/* One step down rather than straight to the five: a site on the older Asset
	   schema still has everything the register itself draws, and dropping to
	   name-and-category over four missing form fields would empty the page to
	   fix a form. */
	const AST_REG = ["name", "asset_name", "item_code", "asset_category", "company", "status",
		"docstatus", "location", "custodian", "purchase_date", "gross_purchase_amount"];
	const AST_STD = ["name", "asset_name", "asset_category", "company", "status", "docstatus"];
	/* Ours, on top of ERPNext's. `custom_detail` is the Detail box, dead until
	   `manna_hr` added the field — ERPNext's Asset has no free-text note under
	   any name.

	   **A step above AST_FULL rather than a sixteenth entry on it.** Folding it
	   in would mean a site without `manna_hr` failing the long read and dropping
	   to AST_REG, which marks Quantity, Rate, Warranty Date, Serial Number and
	   Vendor Name "not read" — five boxes greyed because one custom field is
	   missing. Same shape as EMP_FULL over EMP_STD above, for the same reason.

	   The tier stays `full` either way, because every other box on the form asks
	   `assetTier === "full"` to tell "not read" from "empty" and the answer for
	   those fifteen is the same. `assetDetail` is the sixteenth's own answer. */
	const AST_OURS = AST_FULL.concat(["custom_detail"]);
	const ours = await listAll("Asset", AST_OURS).catch(() => null);
	if (ours) {
		set({ assets: ours, assetTier: "full", assetDetail: true, assetErr: "" });
	} else {
		const assets = await listAll("Asset", AST_FULL).catch(() => null);
		if (assets) {
			set({ assets, assetTier: "full", assetDetail: false, assetErr: "" });
		} else {
			await listAll("Asset", AST_REG)
				.then((r) => set({ assets: r, assetTier: "register", assetDetail: false, assetErr: "" }))
				.catch(() => listAll("Asset", AST_STD)
					.then((r) => set({ assets: r, assetTier: "standard", assetDetail: false, assetErr: "" })))
				.catch((e) => set({
					assets: [], assetTier: "", assetDetail: false,
					assetErr: String(e.message || e).slice(0, 160),
				}));
		}
	}

	/* The three columns that say *what* moved and *who* to, added 3 Sep 2026 for
	   Factor HR's Assets Assignment screen. Without them a movement is a date and
	   a purpose — enough for the history panel, which counts them, and not enough
	   for a row on one person's screen, which is what that page is.

	   Tiered like the Asset read above and for the same reason: the history panel
	   worked on the four columns and must not go dark because a site's Asset
	   Movement is the older shape. When it does, the assignment form says its two
	   dates are unread rather than empty — see `moveTier`. */
	const MOV_FULL = ["name", "purpose", "transaction_date", "company",
		"asset", "from_employee", "to_employee"];
	const MOV_STD = ["name", "purpose", "transaction_date", "company"];

	const moves = await listAll("Asset Movement", MOV_FULL).catch(() => null);
	if (moves) {
		set({ assetMoves: moves, moveTier: "full" });
	} else {
		await listAll("Asset Movement", MOV_STD)
			.then((r) => set({ assetMoves: r, moveTier: "standard" }))
			.catch(() => set({ assetMoves: [], moveTier: "" }));
	}

	/* Ours. Absent on a site that has not had `manna_hr` installed, and that is
	   a different finding from a site with no handovers on it — so the refusal
	   is kept rather than folded into an empty list, and the form says which of
	   the two happened before it offers to write one. */
	await listAll("Asset Assignment", ASSIGN_FIELDS)
		.then((r) => set({ assignments: r, assignErr: "" }))
		.catch((e) => set({
			assignments: [],
			assignErr: String(e.message || e).slice(0, 160),
		}));

	set({ onboardBusy: false });
}

/** Every column the assignment form and its register draw. One list rather than
    a long one and a short one: the doctype is ours, so a site either has all of
    these or has no such doctype at all. */
const ASSIGN_FIELDS = ["name", "employee", "employee_name", "company", "asset", "asset_type",
	"asset_status", "serial_number", "assign_units", "assign_date", "valid_till",
	"return_unit", "returned_on", "lost_units", "lost_on", "recovery_amount",
	"remarks", "assets_detail", "assets_code"];

/* ---------------------------------------------------------------------------
   Import employee(s) from onboarding — its own read.

   Not part of `load()`, for the reason On Board's reads are not either: this
   doctype was added to the site on 4 Sep 2026, a site running an older copy of
   the schema does not have it at all, and a screen nobody has opened must not
   be able to blank the page everybody does. So it is fired the first time
   somebody opens the page, guarded by a flag so a re-render cannot ask twice,
   and it records *why* it came back empty.

   `force` is the ↻ on their toolbar and the re-read after a pull. It is a
   parameter rather than a second function because "read it again" and "read it
   the first time" are the same request with the guard off — two functions would
   be two field lists to keep in step.
   --------------------------------------------------------------------------- */

/* The candidate's own details, which are ours: Custom Fields on hrms'
   `Employee Onboarding` rather than a doctype of ours shadowing it — theirs is
   a checklist wrapper round a Job Applicant and installing a second doctype of
   the same name would break it. See CUSTOM_FIELDS in manna_hr/install.py.

   **They carry a `custom_` prefix on the site and no prefix in this store.**
   Frappe requires the prefix on any field added to a doctype somebody else
   ships, so that the next version of that app cannot collide with it. Stripping
   it here, once, is what keeps every screen below reading `c.first_name` — the
   store holds this app's vocabulary and the site holds Frappe's, and the one
   place they are reconciled is `stripPrefix` below rather than four files. */
const ONB_OURS = ["salutation", "first_name", "last_name", "employee_number",
	"employee_code_series", "date_of_birth", "cell_number", "personal_email"];

/** The rest of the Google Form's answers — see EXTRA_FIELDS in
    lib/onboardimport.js, which this is the unprefixed spelling of. */
const ONB_EXTRA = ["form_timestamp", "current_address", "permanent_address", "aadhaar_number",
	"other_id_proof", "marital_status", "family_members", "family_details", "other_insurance",
	"insurance_provider", "insurance_policy_no", "highest_qualification"];

/** Everything the card draws, and the parts it needs to create somebody. */
const ONB_FULL = ["name", "employee_name", "date_of_joining", "company", "department",
	"designation", "employee_grade", "job_applicant", "job_offer", "boarding_begins_on", "boarding_status",
	"employee", "docstatus", "owner", "creation", "modified", "modified_by"]
	.concat(ONB_OURS.map((f) => "custom_" + f));

/** One candidate row, in the store's spelling.

    A field the site did not return is left absent rather than set to "" — the
    card draws "not read" and "empty" differently, which is the distinction the
    whole of `candTier` exists for. */
function stripPrefix(row) {
	const out = { ...row };
	for (const field of ONB_OURS.concat(ONB_EXTRA)) {
		const prefixed = "custom_" + field;
		if (prefixed in out) {
			out[field] = out[prefixed];
			delete out[prefixed];
		}
	}
	return out;
}

/* ERPNext's own `Employee Onboarding`, field for field, and nothing of ours.
   A site carrying the stock doctype answers this and refuses the list above —
   which is a real state and a different one from having no candidates, so the
   screen says which of the two by drawing the four cells it did not get as
   "not read" rather than as dashes. */
const ONB_STD = ["name", "employee_name", "date_of_joining", "company", "department",
	"designation", "employee_grade", "boarding_status", "employee",
	"docstatus", "owner", "creation", "modified", "modified_by"];

export async function loadCandidates(force) {
	if (getState().candState && !force) return;
	set({ candState: "loading" });

	/* Three tiers now. `extra` is the rest of the Google Form's answers,
	   added 24 September 2026 and not on the site until
	   `create_custom_fields.py "Employee Onboarding"` has run again — so a site
	   without them must still read as `full`, or Upload and Sync would switch
	   off over fields they can do without. */
	const rows = await listAll("Employee Onboarding", ONB_FULL.concat(ONB_EXTRA.map((f) => "custom_" + f)))
		.then((r) => ({ rows: r.map(stripPrefix), tier: "extra" }))
		.catch(() => listAll("Employee Onboarding", ONB_FULL)
			.then((r) => ({ rows: r.map(stripPrefix), tier: "full" })))
		/* The stock doctype, on a site where `manna_hr` has not added its custom
		   fields — which is a real state and a different one from having no
		   candidates. Nothing to strip: every field on this list is ERPNext's. */
		.catch(() => listAll("Employee Onboarding", ONB_STD)
			.then((r) => ({ rows: r, tier: "standard" })))
		.catch((e) => e);

	if (rows instanceof Error) {
		/* The commonest failure here is a site that has no such doctype, which
		   answers 417 — the same code a missing field answers, and deliberately
		   so. The page prints the hint the server sent, which says which. */
		set({ cands: [], candTier: "", candState: "error", candErr: connMessage(rows) });
		return;
	}
	set({ cands: rows.rows || [], candTier: rows.tier, candState: "ok", candErr: "" });
}

/* ---------------------------------------------------------------------------
   The attachments filed against people — Employee Detail's Download Document
   dialog, and anything else on the Employees module that needs to know what
   scans exist.

   **There are two shapes of this read in the app and that is deliberate.**
   `loadOnBoard` above builds `docFiles`, keyed `"<employee>:<field>"`, because
   the Document register draws one paperclip per synthesised row and has to
   answer "is there anything behind *this* pair" a hundred times per page turn.
   This one keeps the flat list, because the download dialog counts and filters
   whole sets — every picture, every identity scan, everything.

   Two reads of one collection rather than one read and two indexes, because
   the two pages are in different modules and neither should have to have been
   opened for the other to work. Forty-odd rows; the cost is a request.
   --------------------------------------------------------------------------- */

const EMP_FILE_FIELDS = ["name", "file_name", "file_url", "file_type", "file_size",
	"is_private", "attached_to_name", "attached_to_field", "creation"];

export async function loadEmployeeFiles(force) {
	if (getState().empFilesState && !force) return;
	set({ empFilesState: "loading" });

	try {
		const rows = await listAll("File", EMP_FILE_FIELDS, [["attached_to_doctype", "=", "Employee"]]);
		set({ empFiles: rows || [], empFilesState: "ok", empFilesErr: "" });
	} catch (e) {
		/* Empty and unread are different answers here as everywhere else. A
		   dialog offering to download nothing because nobody has scanned anything
		   and one offering nothing because the read was refused must not look the
		   same — the first is a filing job and the second is a bug. */
		set({ empFiles: [], empFilesState: "error", empFilesErr: connMessage(e) });
	}
}

/** One calendar removed, and the lists re-read.

    A thin wrapper rather than a call from the component, for the reason every
    other write in this file is here: the screen should say what happened, and
    the store should stop claiming the calendar exists. Those are two different
    jobs and only one of them belongs in a button's onClick.

    Throws on refusal — which is the useful half here. The server counts what
    still points at the list and says how many, and that sentence is the whole
    reason the control is safe to offer. */
export async function deleteHolidayList(name) {
	await apiDelete("Holiday List", name);
	/* Both halves go: the list itself, and the dates hanging off it. Dropping
	   only the first would leave `holidays` keyed on a calendar nothing lists,
	   which is the sort of thing that shows up months later as a month drawn
	   from a calendar somebody deleted. */
	const s = getState();
	const holidays = { ...s.holidays };
	delete holidays[name];
	set({
		holidayLists: s.holidayLists.filter((h) => h.name !== name),
		holidays,
	});
}
