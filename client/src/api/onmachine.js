import { api, listAll } from "@/api/client";
import { ROSTER_FIELDS } from "@/lib/onmachine";

/* ---------------------------------------------------------------------------
   The bridge's copy of who is on each machine, for one Machine Code.

   Two reads: the rows for this number, and whether the bridge has written any
   row at all. The second is what lets "no" be said — see lib/onmachine.js.

   A doctype the site does not have comes back as a 404 (DoesNotExistError),
   which is the state of the live site until the manna_hr app is installed, and
   is an answer rather than a failure: `missing`. A reader whose roles cannot
   see the list gets `denied`, which is also an answer.
   --------------------------------------------------------------------------- */

const DOCTYPE = "Attendance Device User";

export async function readRoster(number) {
	try {
		const [rows, any] = await Promise.all([
			listAll(DOCTYPE, ROSTER_FIELDS, [["device_user_id", "=", String(number).trim()]]),
			/* One row, not listAll: that pages until a short page, and a page
			   size of one would walk every enrolment on every machine. */
			api("/api/resource/" + encodeURIComponent(DOCTYPE), {
				fields: JSON.stringify(["name"]),
				limit_page_length: 1,
			}),
		]);
		return { rows, heard: rows.length > 0 || (any?.data || []).length > 0, missing: false, denied: false };
	} catch (e) {
		if (e?.status === 404 || e?.excType === "DoesNotExistError") return { rows: [], heard: false, missing: true, denied: false };
		if (e?.status === 403) return { rows: [], heard: false, missing: false, denied: true };
		throw e;
	}
}
