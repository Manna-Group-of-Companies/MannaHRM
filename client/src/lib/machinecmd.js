/* ---------------------------------------------------------------------------
   Asking a fingerprint machine something, from a page that cannot reach one.

   The machines sit on a plant's LAN; this page talks to the ERPNext site and
   nothing else. The bridge on the gate PC can reach both, so a `Machine
   Command` is left on the site, the bridge picks it up within about twenty
   seconds, does it at the machine and writes the answer back.

   **Nothing here decides anything.** The action list is closed on the server
   (`manna_hr/machinecmd.py`) and again in the bridge, a number another employee
   holds is refused there, and a finished command can never be re-run. What is
   in this file is the shape of the request and how to read the answer — a rule
   enforced here would be a rule anybody with this file could skip, CLAUDE.md §1.
   --------------------------------------------------------------------------- */

export const CHECK = "Check User";
export const ADD = "Add User";

/** The document to create. Everything else — who asked, when, the result —
    is the server's to fill. */
export function commandDoc({ device_id, action, device_user_id, name_on_device, employee }) {
	const doc = { device_id, action, status: "Pending" };
	if (device_user_id) doc.device_user_id = String(device_user_id).trim();
	if (name_on_device) doc.name_on_device = String(name_on_device).trim().slice(0, 24);
	if (employee) doc.employee = employee;
	return doc;
}

export const FINISHED = new Set(["Done", "Failed", "Cancelled"]);

export const isFinished = (row) => FINISHED.has(String(row?.status || ""));

/** What to show while a command is out, and when it comes back.

    A command still `Pending` well past the bridge's own cadence is the answer
    that matters most and the one a spinner hides: **no bridge is running for
    that machine**, so nobody is going to do this. Said as that, rather than as
    a timeout. */
export function commandState(row, { waitedSeconds = 0, patience = 90 } = {}) {
	const status = String(row?.status || "Pending");
	if (status === "Done") return { done: true, ok: true, text: row.result || "Done." };
	if (status === "Failed") return { done: true, ok: false, text: row.result || "The machine could not do it." };
	if (status === "Cancelled") return { done: true, ok: false, text: "Cancelled." };
	if (status === "Running") return { done: false, ok: null, text: "The bridge is at the machine now…" };
	if (waitedSeconds >= patience) {
		return {
			done: false,
			ok: null,
			waited: true,
			text: "No bridge has picked this up. The gate PC may be switched off, or its bridge stopped — "
				+ "the request stays and runs when it comes back.",
		};
	}
	return { done: false, ok: null, text: "Waiting for the gate PC to pick this up…" };
}
