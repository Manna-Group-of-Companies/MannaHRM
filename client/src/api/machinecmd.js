import { apiCreate, getDoc, listAll } from "@/api/client";
import { commandDoc, isFinished } from "@/lib/machinecmd";

/* ---------------------------------------------------------------------------
   The one file that leaves a command for the bridge, and waits for its answer.

   Polled rather than pushed: Frappe has no socket this app uses, and the wait
   is seconds. The poll is slow on purpose — the site has a daily compute limit
   and the bridge's own cadence is about twenty seconds, so asking twice a
   second would only cost the site money and answer no sooner.
   --------------------------------------------------------------------------- */

const DOCTYPE = "Machine Command";
const EVERY_MS = 3000;

/** The machines ERPNext knows about, for the picker. Empty when the doctype is
    not on the site yet, which is an answer and not a failure. */
export async function machines() {
	try {
		return await listAll("Attendance Device", ["name", "device_id", "device_name", "company"], null);
	} catch (e) {
		if (e?.status === 404 || e?.excType === "DoesNotExistError") return [];
		throw e;
	}
}

export async function ask(request) {
	return apiCreate(DOCTYPE, commandDoc(request));
}

/**
 * Read one command until the bridge finishes it or the caller gives up.
 *
 * `onTick` is called with `(row, waitedSeconds)` after every read, so the page
 * can say what is happening rather than spin. `stop()` returning true ends the
 * wait — which is what unmounting does, because a page nobody is looking at
 * must not keep polling a site with a compute budget.
 */
export async function waitFor(name, { onTick, stop, everyMs = EVERY_MS, forSeconds = 180 } = {}) {
	const started = Date.now();
	for (;;) {
		const row = await getDoc(DOCTYPE, name);
		const waited = Math.round((Date.now() - started) / 1000);
		if (onTick) onTick(row, waited);
		if (row && isFinished(row)) return row;
		if (stop && stop()) return row;
		if (waited >= forSeconds) return row;
		await new Promise((done) => setTimeout(done, everyMs));
	}
}
