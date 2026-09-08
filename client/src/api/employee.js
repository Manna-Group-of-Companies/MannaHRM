import { apiCreate, apiWrite } from "@/api/client";
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
