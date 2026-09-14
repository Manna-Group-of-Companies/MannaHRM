import { apiCreate, apiWrite, listAll } from "@/api/client";
import { getState, set } from "@/store";
import { shiftDoc, toInput, toSite } from "@/data/shiftwizard";
import { patchOf } from "@/lib/write";

/* ---------------------------------------------------------------------------
   Attendance → Manage Shift: creating a `Shift Type`, and changing one.

   Two calls and a read-back, the same shape as api/categorytype.js. The request
   carries the person's own session, so whether they may make a shift is their
   roles on the site, and whether the shift is valid is hrms's own Shift Type
   controller. Nothing here checks either — a rule enforced in a browser is a
   suggestion to anyone holding `curl` (CLAUDE.md §1).

   Every function throws what the site said, so the dialog can print it next to
   the boxes that were typed and keep them there.
   --------------------------------------------------------------------------- */

/** The site's copy of a shift, with its times in the form the wizard sends, so
    comparing the two sees only what was actually changed. */
const asSent = (doc) => ({
	...doc,
	start_time: toSite(toInput(doc.start_time)),
	end_time: toSite(toInput(doc.end_time)),
});

/** What to PUT for an existing shift: the fields that differ, and never the
    name — a PUT cannot rename, and one carrying a different name is refused.
    Pure. */
export function shiftPatch(doc, f) {
	const next = shiftDoc(f);
	delete next.name;
	return patchOf(asSent(doc || {}), next);
}

/** The shift list, read back into the store. Read back rather than pushed
    locally: the site names the document, and a row invented here that disagrees
    with it by a character looks right until somebody clicks it. */
export async function loadShiftTypes() {
	const rows = await listAll("Shift Type", ["name"]);
	set({
		shiftTypes: rows || [],
		counts: { ...getState().counts, shift: (rows || []).length },
		/* The roster reads the windows once and keeps them. A window that has
		   just changed has to be read again, or the roster draws the old one. */
		shiftWindowState: "",
	});
	return rows || [];
}

/**
 * Save the wizard: create when `w.ours` is not true, else change the one it
 * was opened on.
 *
 * @returns {Promise<{name: string, created: boolean, empty?: boolean}>}
 */
export async function saveShiftType(w) {
	if (w.ours === true) {
		const patch = shiftPatch(w.doc, w.f);
		if (!Object.keys(patch).length) return { name: w.row, created: false, empty: true };
		const r = await apiWrite("Shift Type", w.row, patch);
		if (!r.ok) throw Object.assign(new Error(r.error || "The site refused the change."), { status: r.status });
		await reread();
		return { name: w.row, created: false };
	}
	const made = await apiCreate("Shift Type", shiftDoc(w.f));
	await reread();
	return { name: made?.name || shiftDoc(w.f).name, created: true };
}

/** The read-back after a write that has already been accepted. A failure here
    must not surface as a failed save: the shift exists, and a dialog saying it
    does not is a dialog somebody presses Save on again, into a duplicate. */
const reread = () => loadShiftTypes().catch(() => null);
