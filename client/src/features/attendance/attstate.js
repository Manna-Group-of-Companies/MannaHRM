/* What Team, Employee and My Attendance share: a day's state in the
   HRDashboard reference's words, and the signed-in person's own record. */

const WORKED = new Set(["Present", "Half Day", "Work From Home", "In Only", "Out Only"]);

/** The reference's five states, from one Daily Detail row (lib/dailydetail.js).
    Late is a worked day with late minutes against the shift's own window. A day
    nobody has decided yet is Not in yet, never Absent — refusing somebody who
    did turn up is the expensive mistake (CLAUDE.md §4). */
export function teamState(r) {
	if (r.status === "On Leave" || r.status === "Leave Applied") return "On leave";
	if (r.status === "Absent") return "Absent";
	if (WORKED.has(r.status)) return r.lateMin > 0 || r.late === "late" ? "Late" : "Present";
	if (r.dayType) return "Off today";
	return "Not in yet";
}

/** The pill each state wears (components/kit/ui.jsx PILL). */
export const PILL_OF = { Present: "Present", Late: "Late", "On leave": "On Leave", Absent: "Absent", "Off today": "Closed", "Not in yet": "Not started" };

/** The signed-in person's own Employee — "" for a login none carries (D3). */
export const ownEmployee = (s) => (s.employees || []).find((e) => e.user_id && e.user_id === s.user)?.name || "";
