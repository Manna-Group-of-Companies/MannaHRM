import { clock, dmy, tidyDept } from "../lib/format.js";
import { coordText, placeText } from "../lib/punchplace.js";
import {
	absent, availedLeave, birthdays, directory, headCount, inOutCount, leaveHistory,
	missedPunches, monthlyLeave, newJoiners, orgChart, pendingLeave, present, shiftReport, weekoffs,
} from "../lib/reports.js";

/* ---------------------------------------------------------------------------
   **Fifteen of Factor HR's reports, as specifications rather than as pages.**

   Their menu has 160 items and 119 of them had nothing behind them here. These
   fifteen are the ones this site can already answer from what the dashboard has
   loaded — no new doctype, no payroll run, no attendance policy engine. They
   are built as one page reading a spec (`features/reports/Report.jsx`) rather
   than as fifteen pages, for the same reason `ModuleAll` is one page: fifteen
   hand-built report screens drift until the same column means two things.

   A spec is:

     id        the subtab it lives at
     section   the module on the rail
     title     **Factor HR's own menu title**, so the tab reads as theirs
     ico       …
     ask       what the reader has to choose — "day", "month", "window", "" —
               and what the page draws to ask it
     build     (store, ask) → rows. Pure; it lives in `lib/reports.js`
     cols      [heading, csv field, class, value, punch?] — the same shape InOut.jsx
               uses, and for the same reason: the table, the CSV and anything
               printed read one list, so an export cannot disagree with what
               somebody read off the screen. `punch`, when present, returns
               the Employee Checkin the cell is about, and the page draws the
               value as the button that opens that punch on a map
     empty     what an empty result means here, which is never the same thing
     note      what the report will not tell you. **Every spec has one.**

   That last field is not decoration. These reports are read to decide what
   somebody is paid, and each of them has an edge it cannot see — a punch that
   has not arrived, a shift with no timings, a month boundary. Saying it on the
   page is cheaper than the argument afterwards.
   --------------------------------------------------------------------------- */

const nm = (e) => e.employee_name || e.name || "";
const code = (e) => e.employee_number || e.name || "";

/** Columns every employee-shaped report starts with. Their reports lead with
    the code and the name in this order, and somebody scanning for a person is
    scanning the same two columns on every screen. */
const WHO = [
	["Emp code", "emp_code", "mono", code],
	["Name", "name", "", nm],
	["Department", "department", "", (e) => tidyDept(e.department)],
	["Designation", "designation", "muted", (e) => e.designation || ""],
];

export const REPORTS = [
	/* ---- Employees ---- */
	{
		id: "joining", section: "employees", title: "New Joining", ico: "📈", ask: "window",
		build: (s, a) => newJoiners(s.rows, a.from, a.to),
		cols: WHO.concat([
			["Joined", "joined", "mono", (e) => dmy(e.date_of_joining)],
			["Company", "company", "muted", (e) => e.company || ""],
			["Shift", "shift", "muted", (e) => e.default_shift || ""],
		]),
		empty: "Nobody joined in this window.",
		note: "Off <code>date_of_joining</code>, and it counts people still on the books — somebody who "
			+ "joined in April and left in June is not here. Their report counts the joining, not the "
			+ "person, so the two disagree by exactly the leavers.",
	},
	{
		id: "birthdays", section: "employees", title: "Employee Birthday", ico: "🎂", ask: "month",
		build: (s, a) => birthdays(s.rows, a.month),
		cols: WHO.concat([
			["Birthday", "birthday", "mono", (e) => dmy(e.date_of_birth).slice(0, 6)],
			["Company", "company", "muted", (e) => e.company || ""],
		]),
		empty: "No birthdays on file for this month.",
		note: "The year is thrown away and the day is kept, because a birthday recurs and the stored "
			+ "date does not. <b>A blank birthday is the commonest gap on a migrated record</b>, so an "
			+ "empty month is worth checking against the master before it is believed.",
	},
	{
		id: "directory", section: "employees", title: "Employees Directory", ico: "📇", ask: "",
		build: (s) => directory(s.rows),
		cols: WHO.concat([
			["Phone", "phone", "mono", (e) => e.cell_number || ""],
			["Email", "email", "", (e) => e.company_email || e.personal_email || e.prefered_email || ""],
			["Company", "company", "muted", (e) => e.company || ""],
			["Device id", "device", "mono", (e) => e.attendance_device_id || "phone"],
		]),
		empty: "No employees have been read.",
		note: "Contact details as the Employee record holds them. A blank is a record nobody has "
			+ "filled in rather than somebody with no phone — the migration loaded the master and not "
			+ "the paperwork. <b>Device id is the exception: blank there is not a gap.</b> It is the "
			+ "<code>attendance_device_id</code> a fingerprint machine sends, and somebody without one "
			+ "punches from the phone, which is why this column says so rather than leaving it empty.",
	},
	{
		id: "weekoff", section: "employees", title: "Weekoff Holiday Report", ico: "🗓", ask: "",
		build: (s) => weekoffs(s.rows, s.holidays),
		cols: WHO.concat([
			["Holiday list", "holiday_list", "", (e) => e.list || "— none set"],
			["Days on it", "days", "num", (e) => (e.days == null ? "" : e.days)],
		]),
		empty: "No employees have been read.",
		note: "<b>A person with no holiday list is the finding, not a blank row.</b> They fall back to "
			+ "the company default, and where the company has not set one either, nothing decides which "
			+ "of their days are holidays — which is a wrong day's pay waiting to happen.",
	},
	{
		id: "orgchart", section: "employees", title: "Organization Chart", ico: "🌳", ask: "",
		build: (s) => orgChart(s.rows),
		cols: [
			["Reports to", "depth", "", (e) => "· ".repeat(e.depth) + nm(e)],
			["Emp code", "emp_code", "mono", code],
			["Designation", "designation", "", (e) => e.designation || ""],
			["Department", "department", "muted", (e) => tidyDept(e.department)],
			["Direct reports", "reports", "num", (e) => e.reports || ""],
		],
		empty: "No employees have been read.",
		note: "Off <code>reports_to</code>, which already holds the tree — this is the cheapest item "
			+ "on their whole menu. Anybody with no manager set sits at the top level, so a flat chart "
			+ "means the field is empty rather than that everybody reports to nobody.",
	},

	/* ---- Attendance ---- */
	{
		id: "present", section: "attendance", title: "Present Report", ico: "✅", ask: "day",
		build: (s, a) => present(s.rows, s.checkins, a.day)
			.map((e) => ({ ...e, inWhere: placeText(e.punchIn, s.places) })),
		cols: WHO.concat([
			["First punch", "first", "mono", (e) => clock(e.first)],
			["Last punch", "last", "mono", (e) => clock(e.last)],
			["Punches", "punches", "num", (e) => e.punches],
			/* Where the punch-in was made, for the people who punch from the phone.
			   The fifth entry names the punch, so the page can open it on a map. */
			["Punch-in location", "in_location", "mono", (e) => coordText(e.punchIn), (e) => e.punchIn],
			["Where", "in_where", "muted", (e) => e.inWhere],
		]),
		empty: "No punches have reached the site for this day.",
		note: "<b>An OUT with no IN counts.</b> A missed morning punch and a night shift that began "
			+ "yesterday both look like that from here, and neither is somebody who did not turn up. "
			+ "This is punches, not <code>Attendance</code> — those rows are generated by the shift job.",
	},
	{
		id: "absent", section: "attendance", title: "Absent Report", ico: "⭕", ask: "day",
		build: (s, a) => absent(s.rows, s.checkins, s.leave, a.day),
		cols: WHO.concat([
			["Company", "company", "muted", (e) => e.company || ""],
			["Shift", "shift", "muted", (e) => e.default_shift || ""],
			["Device id", "device", "mono", (e) => e.attendance_device_id || ""],
		]),
		empty: "Everybody active either punched or is on approved leave.",
		note: "<b>This names people who may not be paid for a day, so what it leaves out is the whole "
			+ "of it.</b> Approved leave is out, and anybody with any punch is out. What is left is "
			+ "still not proof — a machine that has not delivered its log looks exactly like this. "
			+ "Nothing downstream reads this list; a day is decided by the shift job, not here.",
	},
	{
		id: "msp", section: "attendance", title: "MSP Report", ico: "⚠", ask: "window",
		build: (s, a) => missedPunches(s.rows, s.checkins, daysBetween(a.from, a.to)),
		cols: [
			["Date", "date", "mono", (e) => dmy(e.on)],
		].concat(WHO, [
			["Punches", "punches", "num", (e) => e.punches],
			["Missing", "missing", "", (e) => e.missing],
			["First", "first", "mono", (e) => clock(e.first)],
			["Last", "last", "mono", (e) => clock(e.last)],
		]),
		empty: "Every punch in this window pairs up.",
		note: "An odd number of punches means one is missing — in without out, or the reverse. "
			+ "<b>This is the attendance report worth reading first:</b> a missed punch is somebody's "
			+ "pay and it is the input to every correction. Fix it with a correction, which writes the "
			+ "missing punch — never by hand-writing an <code>Attendance</code> row.",
	},
	{
		id: "iocount", section: "attendance", title: "In / Out Count Report", ico: "🔢", ask: "day",
		build: (s, a) => inOutCount(s.rows, s.checkins, a.day),
		cols: WHO.concat([
			["In", "ins", "num", (e) => e.ins],
			["Out", "outs", "num", (e) => e.outs],
			["Total", "punches", "num", (e) => e.punches],
		]),
		empty: "No punches have reached the site for this day.",
		note: "Sorted by the busiest first, because a count that is not two is the row worth looking "
			+ "at. A machine that was never set up for in/out reports every punch as an IN, so a "
			+ "column of zero outs is a device setting rather than a building nobody left.",
	},
	{
		id: "shiftrep", section: "attendance", title: "Employee Shift Report", ico: "🕘", ask: "",
		build: (s) => shiftReport(s.rows),
		cols: WHO.concat([
			["Default shift", "shift", "", (e) => e.shift || "— none set"],
			["Company", "company", "muted", (e) => e.company || ""],
		]),
		empty: "No employees have been read.",
		note: "The shift's <em>name</em>, not its timings — nothing on this dashboard reads a shift "
			+ "window, which is the same limit that makes the Start Up page's Late-In tile a dash. "
			+ "A person with no default shift has nothing to be measured against.",
	},
	{
		id: "headcount", section: "attendance", title: "Head Count And Attendance", ico: "🏭", ask: "day",
		build: (s, a) => headCount(s.rows, s.checkins, s.leave, a.day, "company"),
		cols: [
			["Company", "group", "", (r) => r.group],
			["Team size", "team", "num", (r) => r.team],
			["In", "in", "num", (r) => r.in],
			["On leave", "leave", "num", (r) => r.leave],
			["Not yet in", "notIn", "num", (r) => r.notIn],
		],
		empty: "No employees have been read.",
		note: "The one attendance number a manager reads without opening anybody's record. Grouped by "
			+ "company because that is how their report groups it; every row's three counts add to its "
			+ "team size, which is the check worth doing before quoting one of them.",
	},

	/* ---- Leave ---- */
	{
		id: "history", section: "leave", title: "Leave Application History", ico: "📜", ask: "",
		build: (s) => leaveHistory(s.leave),
		cols: [
			["Emp code", "emp_code", "mono", (r) => r.employee || ""],
			["Name", "name", "", (r) => r.employee_name || r.employee || ""],
			["Type", "type", "", (r) => r.leave_type || "—"],
			["From", "from", "mono", (r) => dmy(r.from_date)],
			["To", "to", "mono", (r) => dmy(r.to_date)],
			["Days", "days", "num", (r) => (r.days == null ? "" : r.days)],
			["Status", "status", "", (r) => r.status || "—"],
		],
		empty: "No leave applications have been read.",
		note: "Every application this dashboard holds, whatever its status. <b>Days count both ends</b> "
			+ "— a Monday-to-Monday application is eight days, not seven — and the site's own "
			+ "<code>total_leave_days</code> wins where it is set, because a half day is real and this "
			+ "arithmetic cannot see one.",
	},
	{
		id: "pending", section: "leave", title: "Pending Leave Applications", ico: "⏳", ask: "",
		build: (s) => pendingLeave(s.leave),
		cols: [
			["Emp code", "emp_code", "mono", (r) => r.employee || ""],
			["Name", "name", "", (r) => r.employee_name || r.employee || ""],
			["Type", "type", "", (r) => r.leave_type || "—"],
			["From", "from", "mono", (r) => dmy(r.from_date)],
			["To", "to", "mono", (r) => dmy(r.to_date)],
			["Days", "days", "num", (r) => (r.days == null ? "" : r.days)],
			["Applied", "applied", "mono", (r) => dmy(r.posting_date || r.creation)],
		],
		empty: "Nothing is waiting on a decision.",
		note: "<b>A status the site has not set counts as pending.</b> An application nobody has "
			+ "decided is exactly what this report is for, and reading a blank as decided would hide "
			+ "the worst case rather than the best one.",
	},
	{
		id: "availed", section: "leave", title: "Leave Availed Detail", ico: "🌴", ask: "",
		build: (s) => availedLeave(s.leave),
		cols: [
			["Emp code", "emp_code", "mono", (r) => r.employee || ""],
			["Name", "name", "", (r) => r.employee_name || r.employee || ""],
			["Type", "type", "", (r) => r.leave_type || "—"],
			["From", "from", "mono", (r) => dmy(r.from_date)],
			["To", "to", "mono", (r) => dmy(r.to_date)],
			["Days", "days", "num", (r) => (r.days == null ? "" : r.days)],
		],
		empty: "No approved leave has been read.",
		note: "Approved only — what has actually been taken, as opposed to what has been asked for. "
			+ "It is not a balance: <b>nothing on this site has a leave ledger yet</b>, so this counts "
			+ "applications rather than drawing down an entitlement.",
	},
	{
		id: "monthly", section: "leave", title: "Leave Monthly Availed", ico: "📊", ask: "",
		build: (s) => monthlyLeave(s.leave),
		cols: [
			["Month", "month", "mono", (r) => r.month],
			["Type", "type", "", (r) => r.type],
			["Days", "days", "num", (r) => r.days],
			["People", "people", "num", (r) => r.people],
		],
		empty: "No approved leave has been read.",
		note: "Grouped on the month the leave <em>started</em>, so a trip crossing a month boundary "
			+ "lands wholly in the first. Their report does the same thing — worth knowing before "
			+ "anybody reconciles the two. People are distinct people, not applications.",
	},
];

/** Every day from `from` to `to`, both included, as `YYYY-MM-DD`.

    A list of days rather than a range, for the same reason
    `summary.celebrations` builds one: a window is walked, never subtracted, and
    every off-by-one in this kind of code lives in the subtraction. Capped, so a
    mistyped year is a short report rather than a frozen tab. */
export function daysBetween(from, to, cap = 62) {
	const out = [];
	if (!from || !to || to < from) return out;
	let t = Date.parse(from + "T00:00:00Z");
	const end = Date.parse(to + "T00:00:00Z");
	while (t <= end && out.length < cap) {
		out.push(new Date(t).toISOString().slice(0, 10));
		t += 86400000;
	}
	return out;
}

/** The spec for a page, or undefined. */
export const reportFor = (section, id) =>
	REPORTS.find((r) => r.section === section && r.id === id);
