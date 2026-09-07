import { apiCreate } from "@/api/client";
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
