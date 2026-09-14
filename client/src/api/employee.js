import { apiCreate, apiDeleteFile, apiUpload, apiWrite } from "@/api/client";
import { employeeDoc } from "@/lib/newemp";

/* ---------------------------------------------------------------------------
   Creating one Employee, from the three-step wizard.

   This is the one doctype outside payroll that this app creates, for a reason
   that does not extend to anything else: an Employee is a *person on file*, not
   a transaction. It is not submittable, so there is no docstatus to get wrong,
   and on its own it pays nobody — that still needs a Salary Structure
   Assignment, which goes in as a draft and stays one. A record that turns out
   to be wrong is corrected on the site.

   Everything that decides whether the document is fit to send is in
   `lib/newemp.js`, where it is pure and tested. This file is the one line that
   touches the network.

   The write is made as the signed-in person and under their own roles, so a
   form somebody may not submit is refused by the site rather than by anything
   here — which is the right way round. See CLAUDE.md §1.
   --------------------------------------------------------------------------- */

/** The record, as the site stored it.

    Throws rather than returning `{ok}`, unlike `apiWrite`: the caller has a
    three-step form to keep on screen, and the site's own refusal — a mandatory
    field, a naming series that is not set up, a duplicate — is the useful half
    of a failure here. It arrives whole and the form shows it verbatim. */
export async function createEmployee(f) {
	return apiCreate("Employee", employeeDoc(f));
}

/* ---------------------------------------------------------------------------
   Editing one Employee, from the profile page.
   --------------------------------------------------------------------------- */

/**
 * Write the fields somebody changed on Employee Profile.
 *
 * **A patch, never the whole document.** `apiWrite` PUTs what it is given, and
 * what it is given here is `patchFrom(doc, draft)` — the fields that differ and
 * nothing else. Sending the document back whole would re-send every column the
 * read returned, which does two things nobody asked for: it offers columns this
 * reader may not write, so a corrected phone number is refused over a salary
 * field untouched; and it re-sends values that were current when the page
 * loaded, so two people on one record means the second save quietly undoes the
 * first everywhere it did not type.
 *
 * Returns `{ok}` rather than throwing, unlike `createEmployee`: the caller has a
 * pane full of boxes to keep on screen and a message to put above them, and the
 * site's own refusal — a Link that names nothing, a permission, a mandatory
 * field — is the useful half of a failure. The write is made as the signed-in
 * person under their own roles, so what they may change is what the site says
 * and not what this file says (CLAUDE.md §1).
 *
 * @param {string} name  the Employee record id, `HR-EMP-00001`
 * @param {object} patch fieldname → value, already reduced to what changed
 */
export async function saveEmployee(name, patch) {
	return apiWrite("Employee", name, patch);
}

/**
 * File a photograph against one Employee and point `Employee.image` at it.
 *
 * **Two writes, because Frappe's upload does not set the field.** `upload_file`
 * with a `fieldname` records which field the File belongs to and stops there;
 * the desk's own Attach Image control sets the value itself afterwards. Upload
 * alone would leave a photograph on the record and the avatar still blank.
 *
 * **Private**, as every upload here is (see `apiUpload`): it is a face, and a
 * public file in Frappe is served to anybody holding the URL.
 *
 * **A refused second write takes the first one back.** A File filed against
 * `image` that `image` does not name is a photograph of somebody sitting on the
 * site with nothing pointing at it, which nobody will ever find to delete. The
 * photograph it replaces is left alone, the way the desk leaves it — it is an
 * attachment on the record, and removing one is not what "change the photo"
 * asked for.
 *
 * Returns `{ok}` with the site's own words on a refusal, like `saveEmployee`.
 *
 * @param {string} name the Employee record id
 * @param {File}   file what was picked
 * @returns {Promise<{ok: boolean, url?: string, error?: string}>}
 */
export async function saveEmployeePhoto(name, file) {
	let row;
	try {
		row = await apiUpload(file, { doctype: "Employee", name, field: "image", optimize: true });
	} catch (e) {
		return { ok: false, error: e.message };
	}
	const url = row?.file_url;
	if (!url) return { ok: false, error: "The site took the file and did not say where it put it." };

	const r = await apiWrite("Employee", name, { image: url });
	if (!r.ok) {
		/* Best effort: if this fails too, the refusal above is still the thing
		   worth showing, and the orphan is no worse than it would have been. */
		try { await apiDeleteFile(row.name); } catch { /* see above */ }
		return r;
	}
	return { ok: true, url };
}
