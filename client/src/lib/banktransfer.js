/* ---------------------------------------------------------------------------
   Payroll → Bank Transfer, the part that moves a month along (22 October 2026,
   asked for by HR): the salary is worked out when the page is opened, and
   **Transferred** — pressed once the bank has been paid — makes the payslips.

   Pure, so the rule can be argued about without a site. Nothing here works
   out an amount: hrms's run does, on the site, and this only says which of the
   run's steps the page takes next.
   --------------------------------------------------------------------------- */

/**
 * What Bank Transfer does about one company's month.
 *
 * `auto` is the run step the page takes by itself on opening — "start" (make
 * the run and its people) or "slips" (submit the run, which makes the draft
 * slips) — or "". Only for a month that is over: a month still running would
 * be paid on half its attendance, so it is calculated only when HR asks
 * (`calc`).
 *
 * @param {object} o
 * @param {string} o.company   the top bar's company, "" for all of them
 * @param {string} o.ym        the month on the page, "2026-09"
 * @param {string} o.now       this month, "2026-10"
 * @param {boolean} o.locked   a login kept from every control that changes pay
 * @param {boolean} o.ok       the month has been read
 * @param {string} o.state     lib/payroll.js runState
 * @param {object|null} o.entry the month's Payroll Entry
 * @returns {{auto: string, calc: string, transfer: boolean, why: string}}
 */
export function transferStep({ company, ym, now, locked, ok, state, entry }) {
	const none = { auto: "", calc: "", transfer: false, why: "" };
	if (!ok || locked) return none;
	if (!company) return { ...none, why: "Pick a company in the top bar to work out its salary." };
	if (ym > now) return { ...none, why: "That month has not happened yet." };
	const next = state === "none" ? "start" : state === "draft" ? "slips" : "";
	if (next) return ym < now ? { ...none, auto: next } : { ...none, calc: next };
	if (state === "failed") return { ...none, why: `${entry?.name || "This month's run"} failed on the site. Open it in Frappe to see why.` };
	/* Slips made one at a time on the desk have no run to submit them through. */
	if (state === "slips" && !entry) return { ...none, why: "These slips were made on the desk, not by a run, so they are submitted there." };
	return { ...none, transfer: state === "slips" };
}

/** The question Transferred asks before it submits anything. */
export function transferQuestion({ label, count, net, noBank }) {
	const rupees = "₹" + Math.round(Number(net) || 0).toLocaleString("en-IN");
	const people = `${count} ${count === 1 ? "person" : "people"}`;
	const flag = noBank ? ` ${noBank} of them ${noBank === 1 ? "has" : "have"} no bank details on file.` : "";
	return `Mark ${label}'s salary as transferred — ${rupees} to ${people} — and make their payslips? `
		+ `This submits the salary slips, which books the pay; only cancelling them in Frappe takes it back.${flag}`;
}
