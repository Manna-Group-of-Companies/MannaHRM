import { api, listAll } from "./client";
import { getState, set, NO_APPROVALS } from "@/state/store";
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

export async function load() {
	set({ connState: "", conn: "loading…" });
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
			listAll("Department", ["name"]),
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
		set({ connState: "bad", conn: String(err.message || err).slice(0, 80) });
	}
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
