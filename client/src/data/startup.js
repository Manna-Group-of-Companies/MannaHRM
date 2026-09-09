/* ---------------------------------------------------------------------------
   **Start Up** — Factor HR's own front page, read off the tenant on
   8 September 2026 at 3pm. See docs/FACTOHR_SCREENS.md §6.

   Their Welcome page has three tabs — Start Up, Approvals, Product Updates —
   and everything below is the first of them, panel for panel and in its order.
   There is **no Engagement tab**: Mood Analysis, Wish Celebration, CEO Speak,
   Announcements and Important Files all sit on Start Up itself, which is why
   this app's separate Engagement page went and its contents came here.

   Content, not code. The notes are hand-written because several need a `<code>`
   span, and they are authored here rather than coming off a screen.
   --------------------------------------------------------------------------- */

/** Factor HR's own Quick Links, in their order, and where each one goes here.

    `to` is a page in this app; `null` means there is nothing to open, and the
    row says why rather than being dropped. A link quietly missing from a list
    somebody is comparing against theirs is the one kind of gap this whole
    project exists to make visible. */
export const QUICK_LINKS = [
	["Attendance Regularization", "attendance", "overview"],
	["Attendance Submission (summary)", "attendance", "submit"],
	["Calendar", "employees", "calendar"],
	["Create Trouble Ticket", null, null,
		"Factor HR's own support desk, for raising tickets with factoHR. It goes with the product."],
	["Document Entry", "onboard", "documents"],
	["Employee Master", "employees", "overview"],
	["Employee Salary Master", "employees", "salary"],
	["Letter Entry", "onboard", "overview"],
	["New IT Declaration main screen", "payroll", "itdec"],
	["Salary process", "payroll", "process"],
];

/** Their Quick Reports, same rule. */
export const QUICK_REPORTS = [
	["Daily Detail Attendance Report", "attendance", "daily"],
	["ECR File", null, null,
		"The EPFO return. Nothing here generates one — it is a fixed-width file with a schema of "
		+ "its own, and the first thing to check is whether PF is even filed through this system."],
	["Employee Detail Report", "employees", "detail"],
	["Employee Earnings Report", "employees", "ctc"],
	["In / Out Activity Report", "attendance", "inout"],
	["IncomeTax Computation Register Report", null, null,
		"Per-person tax computation. hrms has the declarations and the components; the register "
		+ "itself is a report nobody has built on either side yet."],
	["Leave Balance Report", "leave", "balances"],
	["Salary Pay-slip Report", "payroll", "payslip"],
	["Salary Register Report", "payroll", "register"],
];

/** The six buckets their attendance summary counts the day in.

    `key` matches what `lib/summary.startupBuckets` returns. The order is
    theirs — it is the order somebody reads left to right every morning, and
    re-sorting it into something tidier would break the comparison this page
    exists for. */
export const ATT_BUCKETS = [
	["team", "Team Size", "👥", "Active employees in the companies you are looking at."],
	["in", "Total In", "✅", "People with at least one punch today. An OUT with no IN counts — "
		+ "a missed morning punch and a night shift both look like that, and neither is an absence."],
	["notIn", "Not Yet In", "⭕", "Active, not on leave, and no punch yet today."],
	["late", "Late-In", "⏰", "Punched in after their shift began. **Not computed here**: this "
		+ "dashboard reads Shift Type for its names and not its timings, so a zero would be a claim "
		+ "rather than a count."],
	["leave", "On Leave", "🌴", "People — not applications. One person with two overlapping "
		+ "applications is one person off."],
	["future", "Fut. Leave", "📅", "People whose approved leave starts after today."],
];

/** Their Payroll Summary tiles, in their order, with what each would read here.

    Every one of these is a `Salary Slip` state. Nothing on this site has run a
    payroll yet, so they are all honestly empty rather than zero — see the
    note on the panel. */
export const PAYROLL_TILES = [
	["Salary Proceed", "docstatus = 1 — slips that were submitted"],
	["Salary Not Proceed", "employees with a structure and no slip this month"],
	["Stop Salary", "hrms has no such flag; Factor HR's is a per-person hold"],
	["Hold Salary", "as above — one of the two would become a Custom Field"],
	["Pending ARREARS", "Additional Salary rows dated in a closed month"],
	["Stop TDS", "a per-person tax flag Factor HR carries and hrms does not"],
];

/** Their F&F Summary tiles. `Full and Final Statement` is stock hrms, so four
    of the five have somewhere to come from the moment anybody leaves. */
export const FNF_TILES = [
	["F&F Proceed", "Full and Final Statement, submitted"],
	["F&F Unfinalized", "Full and Final Statement, still draft"],
	["F&F Pending", "relieved, with no statement at all"],
	["Exit Clearance Pending", "Factor HR's clearance checklist; hrms has no equivalent"],
	["On Notice", "notice given, relieving date in the future"],
];

/** The panels of theirs that are drawn here as panels, empty, rather than being
    left off — title, icon, and what the empty state says.

    **Drawn rather than dropped, because four of them are empty in Factor HR
    too.** That is the finding: those features are switched on at that tenant
    and no employee has ever used one. A reader holding the two screens side by
    side needs to see the panel and see that it is empty on both — a panel
    missing from this side reads as work outstanding, and it is not.

    `need` is what it would take to fill it, in one sentence, because "not
    built" without that is a complaint rather than a plan. */
export const THEIRS_EMPTY = [
	["Mood Analysis", "🙂",
		"A daily one-tap mood poll, with comments. <b>Empty in Factor HR</b> — nobody there has ever "
		+ "answered one.",
		"A question, a way to ask it on the phone, and a promise about who reads the answers. "
		+ "The third is the hard one, and it is not a schema problem."],
	["Important Files", "📎",
		"Shared documents pinned to the front page. <b>Empty in Factor HR.</b>",
		"ERPNext already has <code>File</code> and attachments. What is missing is a decision about "
		+ "who may put one on everybody's front page."],
	["CEO Speak", "🗣",
		"A message from the top, pinned where everyone lands. <b>Empty in Factor HR.</b>",
		"One rich-text field and a date. It is a five-minute doctype and nobody has asked for it."],
	["Announcements", "📣",
		"Company notices. <b>Empty in Factor HR.</b>",
		"Same shape as CEO Speak plus who it goes to — and who it goes to is the part that needs "
		+ "answering before it is built."],
];

/** Their Help Desk counts. factoHR's <em>own</em> support desk — three tickets
    raised with factoHR, all still Open — so the numbers are theirs and there is
    nothing here for them to come from. Drawn because it is on their page. */
export const HELP_DESK = [
	["Open", "tickets raised with factoHR and not yet answered"],
	["Re-opened", "answered, and pushed back"],
	["Resolved", "closed by factoHR"],
	["Total", "every ticket ever raised from this tenant"],
];

/** Their Support Escalation Matrix: four named people at factoHR, Level 1 to
    Level 4. Theirs, not Manna's — so the levels are drawn and the names are
    not invented. Filling these in is a decision about who answers when this
    system is wrong at 6am, which is exactly the question the panel asks. */
export const ESCALATION = ["Level 1", "Level 2", "Level 3", "Level 4"];

/** The last of theirs, and why each is not drawn as a panel of its own.

    Two are factoHR's own product and have no successor here; one is a real
    report nobody has asked the question for yet. */
export const NOT_BUILT = [
	["Login Summary",
		"Web logins a day, as a bar chart. Frappe keeps <code>Activity Log</code>, so it could be "
		+ "built — but nobody has said who the question is for, and a chart of logins is one of the "
		+ "easiest things to build and the easiest to misread."],
	["Product Updates",
		"factoHR's own release notes, as a third tab beside Start Up and Approvals. Theirs."],
];
