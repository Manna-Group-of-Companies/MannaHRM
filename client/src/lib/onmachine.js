/* ---------------------------------------------------------------------------
   Is this person on a fingerprint machine? Yes, no, or cannot tell.

   The browser cannot reach a machine: they sit on a plant's LAN and this page
   talks to the ERPNext site and nothing else. What it can read is what the
   bridge reads off each machine on every pass and writes to the site as
   `Attendance Device User`, one row per person per machine. So every answer
   here is "as of the bridge's last pass", and the page says so.

   **"No" is only said when the bridge has spoken.** No rows for a number on a
   site where the bridge has never written a row is not "not enrolled", it is
   "nobody has looked" — and telling HR somebody is missing from a machine they
   are standing on sends a person to the gate for nothing. That case is
   `unknown`, never `no`.
   --------------------------------------------------------------------------- */

export const ROSTER_FIELDS = [
	"name", "device_id", "device_user_id", "name_on_device", "employee", "on_device",
	"enrolled_at", "removed_at", "modified",
];

/**
 * @param {string} number   the Machine Code, `Employee.attendance_device_id`
 * @param {object} read     `{ rows, heard, missing, denied }` from `readRoster`
 * @param {string} [employee] the record just created, to spot a row linked elsewhere
 * @returns {{ state: "none"|"yes"|"removed"|"no"|"unknown"|"denied", on: object[], gone: object[], others: string[] }}
 */
export function machineVerdict(number, read, employee = "") {
	const empty = { on: [], gone: [], others: [] };
	if (!String(number || "").trim()) return { state: "none", ...empty };
	if (read.denied) return { state: "denied", ...empty };
	if (read.missing) return { state: "unknown", ...empty };

	const mine = (read.rows || []).filter((r) => String(r.device_user_id).trim() === String(number).trim());
	const on = mine.filter((r) => Number(r.on_device));
	const gone = mine.filter((r) => !Number(r.on_device));
	/* A row the bridge already linked to somebody else. The wizard refuses a
	   code an Active employee holds, so this is a Left one still holding it, or
	   a link from before the code was moved — either way worth a sentence. */
	const others = [...new Set(on.map((r) => r.employee).filter((e) => e && e !== employee))];

	if (on.length) return { state: "yes", on, gone, others };
	if (gone.length) return { state: "removed", on, gone, others };
	return { state: read.heard ? "no" : "unknown", on, gone, others };
}
