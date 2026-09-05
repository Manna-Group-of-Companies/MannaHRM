import { apiCreate } from "@/api/client";
import { employeeDoc } from "@/lib/newemp";

/* ---------------------------------------------------------------------------
   Creating one Employee, from the three-step wizard.

   This is the one doctype outside payroll that this app creates, and it is on
   the proxy's CREATABLE list for a reason that does not extend to anything
   else: an Employee is a *person on file*, not a transaction. It is not
   submittable, so there is nothing for the docstatus guard to guard, and on its
   own it pays nobody — that still needs a Salary Structure Assignment, which
   the proxy will only ever write as a draft. A record that turns out to be
   wrong is corrected on the site.

   Everything that decides whether the document is fit to send is in
   `lib/newemp.js`, where it is pure and tested. This file is the one line that
   touches the network.

   The write needs the proxy started with `ERP_WRITE=1`. The default stays
   read-only; a form that quietly turned a read-only run into a writing one
   would be worth more than the form.
   --------------------------------------------------------------------------- */

/** The record, as the site stored it.

    Throws rather than returning `{ok}`, unlike `apiWrite`: the caller has a
    three-step form to keep on screen, and the site's own refusal — a mandatory
    field, a naming series that is not set up, a duplicate — is the useful half
    of a failure here. The proxy passes it through whole and the form shows it
    verbatim. */
export async function createEmployee(f) {
	return apiCreate("Employee", employeeDoc(f));
}
