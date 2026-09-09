import { useApp } from "@/store";
import { active, scoped } from "@/lib/scope";
import { fmt } from "@/lib/format";
import { Cols, Empty, Gap, Html, Note, Panel, Tile, Tiles } from "@/components/ui";
import Link from "@/routes/Link";
import { FACTOHR_MENU } from "@/data/factohr";
import { needFor } from "@/data/needs";

/* ---------------------------------------------------------------------------
   A page for one of Factor HR's menu items that this app does not do yet.

   **All 160 of their items have an address now.** 54 open a page that does the
   work; the other 106 open this one, which says what the item is, what it would
   take, and what the site holds towards it today.

   A page rather than a row on a list, for a reason worth stating. This app is
   read beside Factor HR to decide what to build next, and a menu item that
   exists there and is only a table row here is indistinguishable from one
   nobody has looked at. Every one of these has been looked at: the description
   is theirs, the plan is ours, and two of them say the item should **not** be
   built and why.

   It draws no invented number. The "what the site holds" tiles are live counts
   of things that really are on the site, and where a count would be a guess the
   panel is absent rather than zeroed — the same rule the Start Up page follows,
   and for the same reason: a fabricated figure gets quoted in a meeting and an
   empty panel gets fixed.
   --------------------------------------------------------------------------- */

/** Where a reader should go instead, per module — the built page nearest to
    what they were looking for. Never a guess: each is a page that reads the
    same records the missing item would. */
const NEAREST = {
	onboard: [["onboard", "documents", "Document Entry"], ["onboard", "assets", "Assets Details"]],
	employees: [["employees", "overview", "Employee Master"], ["employees", "detail", "Employee Detail"]],
	attendance: [["attendance", "inout", "In Out Activities"], ["attendance", "msp", "MSP Report"]],
	leave: [["leave", "overview", "Apply Leave"], ["leave", "history", "Leave Application History"]],
	payroll: [["payroll", "process", "Salary Process"], ["payroll", "register", "Salary Register"]],
	loans: [["loans", "register", "Loan Register"], ["loans", "projection", "Loan Projection"]],
};

/** What the site holds towards this item, per module. Counts only — this page
    never lists anybody, because a screen that says "not built" and then draws
    five hundred rows is not saying what it means. */
function holdings(section, s) {
	const a = active(s);
	if (section === "attendance") {
		return [
			["Punches today", fmt(s.checkins.length)],
			["Active employees", fmt(a.length)],
			["Shift types", fmt(s.shiftTypes.length)],
			["Corrections waiting", fmt((s.approvals.attendance || []).length)],
		];
	}
	if (section === "leave") {
		return [
			["Leave applications", fmt((s.approvals.leave || []).length)],
			["Leave types", fmt(s.leaveTypes.length)],
			["Active employees", fmt(a.length)],
		];
	}
	if (section === "employees") {
		return [
			["On the books", fmt(scoped(s).length)],
			["Active", fmt(a.length)],
			["Departments", fmt(s.departments.length)],
			["Designations", fmt(s.designations.length)],
		];
	}
	if (section === "onboard") {
		return [
			["Letters issued", fmt(s.letters.length)],
			["Letter types", fmt(s.letterTypes.length)],
			["Assets", fmt(s.assets.length)],
		];
	}
	/* Payroll and Loans deliberately have none. Nothing has been run and no loan
	   has been raised, so every tile here would read 0 — and a row of zeros says
	   "nobody was paid" where the truth is "nobody has asked". */
	return null;
}

export default function Blueprint({ section, title }) {
	const s = useApp();
	const row = FACTOHR_MENU.find((r) => r[0] === section && r[3] === title);

	if (!row) {
		return <Empty title="No such item">Nothing on Factor HR's menu is registered here.</Empty>;
	}

	const [, kind, group, , desc] = row;
	const plan = needFor(section, kind, title);
	const held = holdings(section, s);

	return (
		<>
			<div className="legend">
				<b className="font-display">{title}</b>
				<span>
					Factor HR · {section === "onboard" ? "On Board" : section} · {kind} · {group}
				</span>
			</div>

			<Cols>
				{/* Their words, marked as theirs. This is the best short statement of
				    what the screen is for that exists, and rewriting it would put
				    this app's guess where their product's own description belongs. */}
				<Panel title="What it is, in Factor HR's words" cov="none" ico="📖">
					<p className="text-read text-ink">{desc}</p>
					<Note>
						Read off their menu on 8 September 2026 — docs/FACTOHR_SCREENS.md §7. Their
						description, not a summary of it.
					</Note>
				</Panel>

				<Panel title={plan.refuse ? "Why this one is not coming" : "What it would take here"}
					cov={plan.refuse ? "skip" : "none"} ico={plan.refuse ? "🚫" : "🧱"}>
					{plan.refuse ? (
						<Gap><Html html={plan.need} /></Gap>
					) : (
						<p className="text-read text-ink"><Html html={plan.need} /></p>
					)}
					<div className="rows mt-[.8rem]">
						<div className="row">
							<span>Read from</span>
							<span className="val">{plan.doctype}</span>
						</div>
					</div>
					{plan.warn ? <Gap><Html html={plan.warn} /></Gap> : null}
				</Panel>

				{held ? (
					<Panel title="What the site holds today" cov="live" ico="📦">
						<Tiles>
							{held.map(([k, n]) => <Tile key={k} k={k} n={n} />)}
						</Tiles>
						<Note>
							Live counts, read when this page opened. They are here so whoever picks this
							item up knows whether the inputs exist before they start — not as a measure
							of progress on it.
						</Note>
					</Panel>
				) : null}

				<Panel title="Where to go instead" cov="live" ico="↪">
					<ul className="quicklist">
						{(NEAREST[section] || []).map(([sec, tab, label]) => (
							<li key={label}><Link section={sec} subtab={tab}>{label}</Link></li>
						))}
						<li><Link section={section} subtab="all">All of their {section === "onboard" ? "On Board" : section} menu</Link></li>
					</ul>
					<Note>
						The pages here that read the same records this item would. Not a substitute —
						a place to look while this is not built.
					</Note>
				</Panel>
			</Cols>
		</>
	);
}
