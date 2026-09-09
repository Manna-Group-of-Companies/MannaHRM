import { Legend, Panel, Scroll } from "@/components/ui";
import Link from "@/routes/Link";
import { FACTOHR_MENU, NOTES } from "@/data/factohr";
import { slugOf } from "@/data/blueprints";
import { SUBTABS } from "@/routes/registry";

/* ---------------------------------------------------------------------------
   One module's **whole Factor HR menu**, item for item, with what answers each
   item here.

   Read off the tenant on 8 September 2026 — see `data/factohr.js` for how, and
   docs/FACTOHR_SCREENS.md §7 for what it turned up. This is the "All" page of
   every module, and it exists because of one thing the capture made obvious:

   **Factor HR has 160 menu items and this app has 39 pages.** Before this
   existed, every comparison anybody could make was against the four or five
   menus somebody had remembered to screenshot, so the answer to "what is left"
   was a guess that always came out flattering. Now it is a list, per module,
   that anybody can count.

   Two rules decide what is drawn:

   - **Nothing is left out.** An item with no page here is drawn with its
     description and, where there is one, a line saying why. A menu item that
     quietly vanishes reads as an oversight; one that is drawn and marked reads
     as a decision, which is what these are.
   - **A page is claimed only when it is the same screen.** Pointing "Absent
     Report" at Daily Detail because both concern attendance would make the
     count look better and send somebody to the wrong page — and the count is
     the only reason this page is worth having.

   The descriptions are factoHR's own words, from their menu. Ours are in
   `NOTES`, and only where there is something worth saying.
   --------------------------------------------------------------------------- */

const KINDS = [
	["Transaction", "🖊", "things you do"],
	["Reports", "📊", "things you read"],
	["Setup", "⚙", "things you configure"],
];

/** The label a `[section, subtab]` pair reads as on the bar it lives on, so a
    row says where it is going rather than showing a URL. */
function labelFor(section, subtab) {
	const tab = (SUBTABS[section] || []).find((t) => t[0] === subtab);
	return tab ? tab[1] : subtab;
}

export default function ModuleMenu({ section, title }) {
	const rows = FACTOHR_MENU.filter((r) => r[0] === section);
	const here = rows.filter((r) => r[5]).length;

	return (
		<>
			<Legend
				title={`${title} — all of Factor HR's menu`}
				states={[
					["live", `${here} of their ${rows.length} open a page here`],
					["none", `${rows.length - here} have nothing behind them yet`],
				]}
			/>

			{KINDS.map(([kind, ico, what]) => {
				const mine = rows.filter((r) => r[1] === kind);
				if (mine.length === 0) return null;

				/* Their own grouping, kept. The heading a row sits under is how
				   somebody who used Factor HR every day finds it again — regrouping
				   these by what this app happens to have built would be tidier and
				   would break exactly that. */
				const groups = [...new Set(mine.map((r) => r[2]))];

				return (
					<Panel title={`${kind} · ${mine.length}`} cov="live" ico={ico} key={kind}>
						<p className="text-mini text-ink-3 mb-[.6rem]">{what}</p>
						<Scroll>
							<table className="menutable">
								<thead>
									<tr>
										<th>Factor HR</th>
										<th>Here</th>
									</tr>
								</thead>
								<tbody>
									{groups.map((g) => (
										<GroupRows key={g} section={section} group={g} rows={mine.filter((r) => r[2] === g)} />
									))}
								</tbody>
							</table>
						</Scroll>
					</Panel>
				);
			})}
		</>
	);
}

/** One of their menu groups: the heading, then its items. A fragment rather
    than a `<tbody>` of its own, because a table with one body per group loses
    the zebra striping that makes a long list of these readable. */
function GroupRows({ section, group, rows }) {
	return (
		<>
			<tr className="grouprow">
				<td colSpan={2}>{group}</td>
			</tr>
			{rows.map(([, , , title, desc, to]) => (
				<tr key={title}>
					<td>
						<b>{title}</b>
						<span className="block text-fine text-ink-3">{desc}</span>
						{NOTES[title] ? <span className="block text-fine mt-[.2rem] ournote">{NOTES[title]}</span> : null}
					</td>
					{/* **Every row is a link now.** An item with a page here opens it;
					    one without opens the page that says what it would take. It used
					    to read "Not built", which is true and is also where a reader
					    stopped — and the whole point of this table is what happens
					    next. */}
					<td>
						{to ? (
							<Link section={to[0]} subtab={to[1]}>{labelFor(to[0], to[1])}</Link>
						) : (
							<Link section={section} subtab={slugOf(title)} className="notbuilt">
								What it would take
							</Link>
						)}
					</td>
				</tr>
			))}
		</>
	);
}
