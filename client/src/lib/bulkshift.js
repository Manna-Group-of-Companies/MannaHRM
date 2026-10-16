/* ---------------------------------------------------------------------------
   A shift for several people at once (asked for 16 October 2026): tick them on
   Manage Shift, choose the shift, and each is given it the way one person is
   given it from their month — api/shiftassign.js does the work, per person.

   Pure: who can be picked, which shifts fit everybody picked, and what is
   missing before Assign can run.
   --------------------------------------------------------------------------- */

/** The two ways somebody is put on a shift — see api/shiftassign.js. */
export const MODES = [
	{ key: "dates", label: "For dates (a Shift Assignment)" },
	{ key: "working", label: "As their working time (every day from now)" },
];

const low = (v) => String(v || "").toLowerCase();

/** Active people, filtered by a search and a department, by name. */
export function candidates(people, { q = "", dept = "" } = {}) {
	const t = low(q).trim();
	return (people || [])
		.filter((e) => e.status === "Active")
		.filter((e) => !dept || e.department === dept)
		.filter((e) => !t || `${low(e.employee_name)} ${low(e.employee_number)} ${low(e.name)} ${low(e.designation)}`.includes(t))
		.sort((a, b) => String(a.employee_name || "").localeCompare(String(b.employee_name || "")));
}

/** The shifts every picked person may be put on. A shift with a company is
    that company's (`Shift Type.custom_company`); with none, anybody's. So with
    people from two companies picked, only shifts open to both are offered. */
export function shiftsFor(shiftTypes, picked) {
	const companies = new Set((picked || []).map((e) => e.company).filter(Boolean));
	return (shiftTypes || []).filter((t) => !t.company || [...companies].every((c) => c === t.company));
}

/** What stops Assign, or "". */
export function checkBulk({ picked, shift, mode, from, to }, shiftTypes) {
	if (!picked || !picked.length) return "Tick at least one person.";
	if (!shift) return "Choose the shift.";
	if (!shiftsFor(shiftTypes, picked).some((t) => t.name === shift)) {
		return `${shift} belongs to another company than some of the people ticked.`;
	}
	if (mode === "dates") {
		if (!from) return "Choose the date it starts.";
		if (to && to < from) return "The end date is before the start date.";
	}
	return "";
}

/** A shift time as Frappe sends it — "8:30:00", "20:00:00" — written HH:MM. */
const hhmm = (t) => {
	const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "").trim());
	return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};

/** A shift's hours, "08:30–17:30", or "" when the site has not said. */
export function hoursOf(win) {
	const a = hhmm(win && win.start_time);
	const b = hhmm(win && win.end_time);
	return a && b ? `${a}–${b}` : "";
}

/** A shift as the list shows it: the name and, where known, its hours. */
export const shiftLabel = (name, windows) => {
	const h = hoursOf((windows || {})[name]);
	return h ? `${name} · ${h}` : name;
};

/** The button's words. */
export const assignLabel = (n, mode) => `Assign to ${n} ${n === 1 ? "person" : "people"}`
	+ (mode === "working" ? " as working time" : "");
