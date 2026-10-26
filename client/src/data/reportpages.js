/* ---------------------------------------------------------------------------
   The reports Reports draws as boxes, and the address each opens at
   (21 October 2026) — kept apart from the page so the route table can read
   them without loading every report page first.
   --------------------------------------------------------------------------- */

export const REPORT_TILES = [
	["headcount", "Headcount (Point-in-time)", "Breakdown of all current employees.", "users"],
	["onboarding", "Onboarding", "New employees by month of their join date.", "user"],
	["offboarding", "Offboarding", "Leavers by month of their last working day.", "door"],
	["balance", "Time Off Balance", "An overview of employees’ time off balances.", "clock"],
	["pipeline", "Recruitment Pipeline", "How far applicants have got, by job and by source.", "brief"],
	["data", "Employee Data Reports", "Age, gender and birthdays.", "trend"],
	["schedule", "Time Off Schedule", "Who is away in the next thirty days.", "timer"],
	["turnover", "Employee Turnover Rate", "Leavers over the headcount, month by month.", "trendd"],
];

/* The attendance reports, asked for on this page as boxes (21 October 2026),
   in the order HR named them. Each opens inside Reports at its own address
   and is the attendance module's own page — the same read, filters and
   downloads it always had. */
export const ATT_TILES = [
	["inout", "In / Out Activity Report", "Every punch in a range, date wise.", "timer"],
	["daily", "Daily Detail Attendance Report", "Each person's day: in, out, worked and late.", "cal"],
	["monthly", "Monthly Basic Attendance Report", "The month as a grid, a letter a day.", "calendar"],
	["summary", "Monthly Summary Attendance Report", "The month's totals for each person.", "chart"],
	["present", "Present Report", "Who punched in today, and where.", "tick"],
	["absent", "Absent Report", "Who was absent on a day.", "x"],
	["msp", "MSP Report", "The single punches somebody has to fix.", "info"],
	["iocount", "In / Out Count Report", "How many ins and outs each person made today.", "list"],
	["shiftrep", "Employee Shift Report", "Each person's shift.", "clock"],
	["ot", "OT Report", "Overtime in a range.", "timer"],
	["weekly", "Weekly Report", "A week at a glance, day by day.", "calendar"],
];

/** Every page Reports opens from a box: the attendance eleven, the
    reference's own and All reports. The registry gives each an address. */
export const REPORT_PAGES = [...ATT_TILES.map((t) => t[0]), ...REPORT_TILES.map((t) => t[0]).filter((k) => k !== "balance"), "all"];
