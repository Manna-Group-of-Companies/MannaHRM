/* ---------------------------------------------------------------------------
   Machines that are one direction each, so the machine — not the key pressed —
   says whether a punch is an arrival or a leaving.

   **Manna Tyre Retreads, 1 October 2026, as HR set it out and the punches
   show.** BIO-6426150300692 is the punch-in machine and BIO-6426150300688 the
   punch-out machine. Their production shift is twenty-four hours, 09:00 to
   08:59 (Factor HR: "Production24hr shift"): a worker punches in on 692 at
   about nine and out on 688 at about nine the next morning, and works every
   other day. The key pressed is not to be believed — 692 records some
   arrivals as OUT — and the clock cannot tell an arrival from a leaving,
   because both happen at the same hour. Only the machine can.

   So, read here and nowhere else:
     · a punch on 692 is an IN and a punch on 688 an OUT;
     · an OUT before noon that follows that person's IN of an earlier day, by
       no more than thirty hours, is that shift's leaving and counts on the IN's
       day (`work_day`, read by `workDateOf` in lib/roster.js) — a 24-hour shift
       belongs to the day it started, like a night shift (CLAUDE.md §5).

   (30 September's version paired the first and last punch of each calendar
   day. That is wrong for a 24-hour worker, whose day has one punch on it.)

   **Read-time only.** The punch on the site keeps the key it arrived with — a
   punch is evidence and is never rewritten (lib/punchedit.js); `pressed`
   keeps it for a screen that wants to show it.

   The same rule is in the admin app (`admin/lib/core/day.dart`); a machine
   added to one is added to the other.
   --------------------------------------------------------------------------- */

export const BY_MACHINE = new Map([
	["BIO-6426150300692", "IN"],
	["BIO-6426150300688", "OUT"],
]);

/** How long after an arrival its leaving can still be: a 24-hour shift and
    a late punch-out, with room. */
const SHIFT_REACH_MS = 30 * 3600 * 1000;

const ms = (t) => Date.parse(String(t || "").replace(" ", "T"));

/** One punch, with its direction taken from its machine. */
export function fromMachine(row) {
	const kind = row && BY_MACHINE.get(row.device_id);
	if (!kind) return row;
	return { ...row, log_type: kind, pressed: row.log_type || "" };
}

/** A list of punches — any number of people, any order — with each machine's
    direction applied and each next-morning leaving placed on its arrival's day.
    Anything that is not a list — a refused read's null — is handed back. */
export function byMachine(rows) {
	if (!Array.isArray(rows)) return rows;
	const out = rows.map(fromMachine);
	const mine = new Map();
	out.forEach((r, i) => {
		if (!r || !BY_MACHINE.has(r.device_id)) return;
		const k = r.employee || "";
		if (!mine.has(k)) mine.set(k, []);
		mine.get(k).push(i);
	});
	for (const idx of mine.values()) {
		idx.sort((a, b) => String(out[a].time).localeCompare(String(out[b].time)));
		for (let j = 1; j < idx.length; j++) {
			const prev = out[idx[j - 1]];
			const cur = out[idx[j]];
			const t = String(cur.time || "");
			if (cur.log_type !== "OUT" || prev.log_type !== "IN" || t.slice(11, 13) >= "12") continue;
			const day = String(prev.time).slice(0, 10);
			if (day >= t.slice(0, 10) || ms(cur.time) - ms(prev.time) > SHIFT_REACH_MS) continue;
			out[idx[j]] = { ...cur, work_day: day };
		}
	}
	return out;
}
