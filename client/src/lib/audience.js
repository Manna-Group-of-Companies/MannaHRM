import { scoped } from "@/lib/scope";
import { SREP_AUDIENCE } from "@/data/schedreport";

/* ---------------------------------------------------------------------------
   Who a Send To tick actually names, and at what addresses.

   Both schedulers carry the same three ticks — Factor HR's newer two-step
   wizard and their older single form, photographed on two different reports and
   holding the same three boxes — so the resolving lives here rather than in
   either of them. Two copies of this would be two dialogs that could come to
   disagree about who "every active employee" is, which is the one thing a
   scheduler must not be vague about.

   ## The argument this file exists to make

   A tick names an *audience*. `Auto Email Report.email_to` is a *list*. A rule
   is evaluated when it runs; a list is fixed when it is saved. ERPNext has the
   second and Factor HR's form asks for the first, so the tick is resolved
   here — now, against the employee master this dashboard already holds — and
   both dialogs show the count and the names before anything opens.

   Silently turning a rule into a snapshot is how a schedule ends up mailing the
   wrong people for a year. Doing it loudly is the best this API can offer.
   --------------------------------------------------------------------------- */

/** The address the site holds for somebody, in Frappe's own order of
    preference — `prefered_email` is the field it treats as *the* address and
    the other two are what it falls back to.

    "" when the read that loaded the employee list fell back to
    `EMP_FIELDS_MIN`, which carries no address at all. That shows up as the "no
    email" count rather than as a short list, because a list quietly one name
    shorter is the failure nobody notices. */
export const emailOf = (e) => e.prefered_email || e.company_email || e.personal_email || "";

/** Who the ticked boxes name, and at what addresses.

    Scoped by the company on the top bar, like every other count on this
    dashboard: an audience that ignored the picker would mail a company nobody
    on screen was looking at.

    The people count and the address count are both returned because they differ
    whenever the site is missing an address, and "12 people, 9 addresses" is the
    sentence somebody needs before they schedule anything. Both are `Set`s of
    docnames rather than tallies, so a person picked by two ticks at once is one
    person. */
export function audienceOf(s, f) {
	const rows = scoped(s);
	const seen = new Map();
	const people = new Set();
	const nomail = new Set();

	SREP_AUDIENCE.forEach((a) => {
		if (!f[a.key]) return;
		a.pick(rows).forEach((e) => {
			people.add(e.name);
			const mail = emailOf(e);
			if (!mail) return void nomail.add(e.name);
			if (!seen.has(mail)) seen.set(mail, e.employee_name || e.name);
		});
	});

	return {
		addrs: [...seen.keys()], named: [...seen.values()],
		people: people.size, nomail: nomail.size,
	};
}

/** Every address a schedule will carry: what was typed, then what the ticks
    resolved to, deduped and in that order.

    Typed first, because somebody who typed an address meant that one. Compared
    case-insensitively, because two spellings of one mailbox is one mailbox and
    two lines on the record. */
export function recipients(s, f) {
	const typed = f.to.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
	const out = [];
	[...typed, ...audienceOf(s, f).addrs].forEach((a) => {
		if (!out.some((x) => x.toLowerCase() === a.toLowerCase())) out.push(a);
	});
	return out;
}
