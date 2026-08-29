import { api, listAll } from "./client";
import { getState, patch, set, NO_APPROVALS } from "@/state/store";
import { DOC_BACKFILL } from "@/data/onboard";
import { todayIso } from "@/lib/format";

export const EMP_FIELDS_MIN = [
	"name", "employee_name", "employee_number", "company", "department", "designation",
	"attendance_device_id", "reports_to", "date_of_joining", "status", "default_shift",
];
export const EMP_FIELDS = EMP_FIELDS_MIN.concat([
	"salutation", "grade", "branch", "employment_type", "holiday_list", "ctc",
]);

/* The correction queue, under either name. This app's own doctype is
   `Attendance Regularization` (docs/SCHEMA.md), with `Pending Approval` as its
   open state; the first cut of this page asked for the longer
   `Employee Attendance Regularization` and Factor HR's own word, `Initiated`.
   Nothing has been applied to the live site yet, so which of the two answers is
   still open — both are tried, and neither failing is fatal. An empty queue
   must not blank the rest of the dashboard. */
async function pendingRegularizations() {
	const mine = await listAll(
		"Attendance Regularization",
		["name", "employee", "employee_name", "company", "attendance_date", "requested_in", "requested_out",
			"reason", "status", "approver_type", "decided_by", "decided_on", "decision_note",
			"creation", "owner", "modified", "modified_by"],
		[["status", "=", "Pending Approval"]],
	).catch(() => null);

	// Which name answered decides where a decision would later be written.
	if (mine && mine.length) {
		set({ regDoctype: "Attendance Regularization" });
		return mine;
	}
	set({ regDoctype: "Employee Attendance Regularization" });
	return listAll(
		"Employee Attendance Regularization",
		["name", "employee", "employee_name", "attendance_date", "requested_in", "requested_out",
			"reason", "remarks", "status", "applied_on", "creation", "owner", "modified", "modified_by"],
		[["status", "=", "Initiated"]],
	).catch(() => mine || []);
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
	if (status === 401 || status === 403) return `not authorised (${status})`;
	// The site's own daily compute limit, which reads as a dead site otherwise.
	if (status === 429) return "daily limit reached";
	/* The proxy's own answer when it was started without a token, which is not
	   the site being down and should not read as it. Its hint says how to fix
	   it; the status line only has room to say which of the two this is. */
	if (status === 503 && /ERP_KEY|no API key/.test(text)) return "no API key";
	if (status >= 500) return `site error (${status})`;
	if (/timeout|aborted/i.test(text)) return "timed out";
	if (/network|fetch failed|ECONNREFUSED/i.test(text)) return "no connection";
	// Anything genuinely unexpected still gets shown, just not a whole payload.
	return text.replace(/\s+/g, " ").slice(0, 40);
}

export async function load() {
	set({ connState: "", conn: "loading…" });
	/* Where the proxy is pointed, so the screens that can only read can at least
	   link to the place a change is made. Fire-and-forget and never fatal: the
	   dashboard reads perfectly well without knowing, and the few controls that
	   need it stay disabled with the reason on them. */
	void api("/api/site").then((r) => set({ site: (r && r.url) || "" })).catch(() => {});
	try {
		const today = todayIso();
		const [emps, companies, checkins, shifts, holidays, leavetypes, attendance, depts, desigs,
			regs, leaves, ltypes, letters] = await Promise.all([
			/* Categories, CTC and Calendar each count a field the directory never
			   needed. Asking for a field a site does not have is a 417 on the whole
			   call, and the whole call is the dashboard — so the richer list is tried
			   and the original one is what it falls back to. */
			listAll("Employee", EMP_FIELDS).catch(() => listAll("Employee", EMP_FIELDS_MIN)),
			/* `default_holiday_list` is what the Calendar screen's "Default Calendar"
			   tick reads. Asked for with the same fallback as the employee list. */
			listAll("Company", ["name", "abbr", "default_holiday_list"])
				.catch(() => listAll("Company", ["name", "abbr"])),
			listAll("Employee Checkin", ["name", "employee", "time", "log_type"],
				[["time", ">=", today + " 00:00:00"]]),
			listAll("Shift Type", ["name"]),
			listAll("Holiday List", ["name"]),
			listAll("Leave Type", ["name"]),
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
			listAll("Employee Letter",
				["name", "employee", "employee_name", "letter_type", "letter_date"])
				.catch(() => []),
		]);

		set({
			employees: emps,
			byName: Object.fromEntries(emps.map((e) => [e.name, e])),
			checkins,
			/* The five queues with no doctype behind them stay empty rather than
			   absent — see NO_APPROVALS. Their tabs are field lists, not backlogs. */
			approvals: Object.assign(NO_APPROVALS(), { attendance: regs || [], leave: leaves || [] }),
			letterTypes: (ltypes || []).filter((t) => t.is_active !== 0),
			letters: letters || [],
			companies: companies || [],
			holidayLists: holidays || [],
			/* The names as well as the count: Apply Leave fills its type dropdown
			   from this, and the six in Factor HR are not necessarily the six here. */
			leaveTypes: leavetypes || [],
			shiftTypes: shifts || [],
			departments: depts || [],
			designations: desigs || [],
			counts: {
				companies: companies.length, shift: shifts.length, holiday: holidays.length,
				leavetype: leavetypes.length, attendance: attendance.length,
				departments: depts.length, designations: desigs.length, left: 344,
			},
			connState: "live",
			conn: "live",
		});

		void loadHolidayDates();
	} catch (err) {
		set({ connState: "bad", conn: connMessage(err) });
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
	if (!emp) return set({ applyHist: [], applyAtt: {} });
	patch("apply", { busy: true, err: "" });
	try {
		const hist = await listAll("Leave Application",
			["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "half_day",
				"half_day_date", "total_leave_days", "leave_balance", "posting_date", "status",
				"description", "creation", "modified", "modified_by"],
			[["employee", "=", emp]]);
		set({ applyHist: hist || [] });
	} catch (err) {
		patch("apply", { err: String(err.message || err).slice(0, 220) });
		set({ applyHist: [] });
	}

	const att = {};
	if (ym) {
		const rows = await listAll("Attendance", ["name", "attendance_date", "status"],
			[["employee", "=", emp], ["attendance_date", ">=", ym + "-01"], ["attendance_date", "<=", ym + "-31"]])
			.catch(() => []);
		(rows || []).forEach((r) => { att[String(r.attendance_date).slice(0, 10)] = r.status || ""; });
	}
	set({ applyAtt: att });
	patch("apply", { busy: false });
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

    **This is only half of a balance, and deliberately so.** Availed comes off
    Leave Application, which is on the proxy allowlist. Entitlement comes off
    Leave Allocation, which is not — and adding a doctype to the allowlist of a
    process holding a System Manager token is a decision for whoever owns that
    key, not something this report should take on its own. The site also holds
    no entitlement to read: see FH_LEAVE in `data/attendance.js`. The report
    says which of its columns that leaves empty, where they are. */
export async function loadLeaveBalances() {
	if (getState().lvbState) return;
	set({ lvbState: "loading" });
	try {
		const rows = await listAll("Leave Application",
			["name", "employee", "employee_name", "company", "leave_type", "from_date", "to_date",
				"half_day", "half_day_date", "total_leave_days", "status", "posting_date"],
			[["status", "=", "Approved"]]);
		set({ lvbRows: rows || [], lvbState: "done" });
	} catch (err) {
		/* An empty report and a report that could not be read are different
		   things, and the screen says which. */
		set({ lvbRows: [], lvbState: "error", lvbErr: String(err.message || err).slice(0, 220) });
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
	set({ assetErr: "", docErr: "", onboardBusy: true, onboardRead: true });

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

	const AST_FULL = ["name", "asset_name", "item_code", "asset_category", "company", "status",
		"location", "custodian", "department", "purchase_date", "gross_purchase_amount"];
	const AST_STD = ["name", "asset_name", "asset_category", "company", "status"];
	const assets = await listAll("Asset", AST_FULL).catch(() => null);
	if (assets) {
		set({ assets, assetErr: "" });
	} else {
		await listAll("Asset", AST_STD)
			.then((r) => set({ assets: r, assetErr: "" }))
			.catch((e) => set({ assets: [], assetErr: String(e.message || e).slice(0, 160) }));
	}

	const assetMoves = await listAll("Asset Movement",
		["name", "purpose", "transaction_date", "company"]).catch(() => []);

	set({ assetMoves, onboardBusy: false });
}
