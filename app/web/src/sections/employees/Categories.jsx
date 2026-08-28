import { CATEGORY_FIELDS, FH_CATEGORY_TYPES, FH_CAT_SEEN, FH_CAT_TOTAL } from "@/data/masters";
import { Bars, Cols, Empty, Gap, Html, Note, NoteBelow, Panel, Scroll } from "@/components/ui";
import { fmt, tally, tidyDept } from "@/lib/format";
import { active } from "@/lib/scope";
import { set, useApp } from "@/state/store";

/* Factor HR's Categories, photographed 28 August 2026 — and it is not the
   screen the name suggested. Behind that menu item is `Category Type`: a master
   of masters, eight rows, each holding its own value list behind a View
   Category button.

   Every control on it here is dead, because that one writes and this one reads.
   The one live control is View Category, which is the only thing on the screen
   a read-only window can honestly answer. */

const DEAD = "This dashboard only reads. Category types are maintained in Factor HR, and on our side in the doctype each one maps to.";

const Ic = ({ d }) => (
	<svg viewBox="0 0 24 24">
		<path d={d} />
	</svg>
);

const Act = ({ d, l }) => (
	<span className="fhact" role="img" aria-label={`${l}, not available here`} title={DEAD}>
		<Ic d={d} />
	</span>
);

/** What one View Category opens, answered off our records rather than off a
    category master, because we have no category master — the values are
    whatever the people actually carry. */
function CatValues({ t, s }) {
	const a = active(s);

	if (!t.field) {
		return (
			<>
				<div className="lead">
					<Html html={t.why || ""} />
				</div>
				<Gap>
					<Html html={t.miss || ""} />
				</Gap>
				<div className="mt-[.6rem]">
					<Note>
						<Html html={t.hint || ""} />
					</Note>
				</div>
			</>
		);
	}

	const field = t.field;
	const held = a.filter((e) => e[field]);
	const used = tally(held, field)
		.map((r) => [field === "department" ? tidyDept(r[0]) : r[0], r[1]]);
	const defined = t.count ? s.counts[t.count] : null;

	return (
		<>
			<div className="lead">
				<b>{t.name}</b> reads onto <Html html={t.maps || ""} />. There is no category master on our
				side, so these are the values the {fmt(a.length)} active records carry — counted off the
				people rather than off a list.
			</div>
			{used.length ? (
				<>
					<Bars pairs={used.slice(0, 10)} />
					{used.length > 10 && <div className="cnt mt-[.45rem]">and {used.length - 10} more</div>}
					<div className="rows mt-[.7rem]">
						<div className="row">
							<span>In use</span>
							<span className="val">{used.length}</span>
						</div>
						{defined != null && (
							<div className="row">
								<span>Defined on the site</span>
								<span className="val">{fmt(defined)}</span>
							</div>
						)}
						<div className="row">
							<span>People with none</span>
							<span className="val">{fmt(a.length - held.length)}</span>
						</div>
					</div>
				</>
			) : (
				<Empty title="Not set for anybody">
					The field is on every record and blank on all {fmt(a.length)} of them.
				</Empty>
			)}
		</>
	);
}

/** Their screen, redrawn: title bar, search, table, pager. */
function FhCategoryType({ s }) {
	return (
		<div className="fhcat">
			<header>
				<h3>Category Type</h3>
				<span className="cov part">Their screen, our data</span>
				<span className="right">
					<button className="embtn pri" disabled title={DEAD}>+ Add</button>
					<button className="embtn" disabled title={DEAD} aria-label="Refresh">↻</button>
					<button className="embtn" disabled title={DEAD} aria-label="Import">↑</button>
				</span>
			</header>

			<div className="find">
				<input type="search" disabled placeholder="Search"
					aria-label="Search category types, not available here" />
			</div>

			<Scroll>
				<table>
					<thead>
						<tr>
							<th>Code</th><th>Category Type</th><th>Category</th><th className="act">Action</th>
						</tr>
					</thead>
					<tbody>
						{FH_CATEGORY_TYPES.map((t) => {
							const open = s.catopen === t.name;
							return [
								<tr key={t.name}>
									<td className="mono">{t.code || ""}</td>
									<td>
										{t.ico} {t.name}
										{!t.field && <> <span className="tag warn">pay</span></>}
									</td>
									<td>
										{/* Clicking the open one closes it, so the row is a toggle
										    rather than a trap on a page with no back button. */}
										<button
											className="fhview"
											aria-expanded={open}
											onClick={() => set({ catopen: open ? "" : t.name })}
										>
											View Category
										</button>
									</td>
									<td className="act">
										<Act l="View" d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6" />
										<Act l="Edit" d="M4 20h4L20 8l-4-4L4 16Z" />
										<Act l="Delete" d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
									</td>
								</tr>,
								open ? (
									<tr className="vals" key={t.name + "-vals"}>
										<td colSpan={4}>
											<CatValues t={t} s={s} />
										</td>
									</tr>
								) : null,
							];
						})}
					</tbody>
				</table>
			</Scroll>

			<div className="fhfoot">
				<span className="cnt">
					Showing 1 to {FH_CAT_SEEN} of {FH_CAT_TOTAL} entries
				</span>
				<span className="fhpage">
					<button className="embtn" disabled>First</button>
					<button className="embtn" disabled>Previous</button>
					<span className="cnt">Page 1 of 2</span>
					{/* The pager is drawn dead rather than dropped. "1 to 5 of 8" is the
					    shortest way to say that three category types exist and that
					    nobody here knows what they are. */}
					<button className="embtn" disabled
						title="Page 2 has not been screenshotted. Three more category types are on it and none of them is known here.">
						Next
					</button>
					<button className="embtn" disabled
						title="Page 2 has not been screenshotted. Three more category types are on it and none of them is known here.">
						Last
					</button>
				</span>
			</div>
		</div>
	);
}

export default function Categories() {
	const s = useApp();
	const a = active(s);
	const ours = CATEGORY_FIELDS.filter((f) => !f[4]);

	return (
		<>
			<div className="legend">
				<b className="font-display">Categories</b>
				<span className="cov part">Their screen, our data</span>
				<span>
					Factor HR’s <b>Category Type</b> master as photographed — and, under it, how the{" "}
					{fmt(a.length)} active people group on our side.
				</span>
			</div>

			<FhCategoryType s={s} />

			<Cols>
				<Panel title="Categories is a master of masters" cov="part" ico="🗂">
					<Note>
						The menu item does not open a list of categories. It opens a list of{" "}
						<b>category types</b> — eight of them — each with its own values behind{" "}
						<em>View Category</em>. So the question this page used to ask, <em>which of our five
						link fields is it?</em>, has no answer: it is not one of them. It is a generic master
						that happens to hold three of them and two things that are not fields at all.
					</Note>
					<NoteBelow>
						<b>Only Department carries a code</b> — <code>P001</code>. The other four are blank, so
						the code is optional and is not a key. Anything joining on it would join on nothing four
						times out of five.
					</NoteBelow>
				</Panel>

				<Panel title="Two of the five are pay, not grouping" cov="none" ico="₹">
					<Gap>
						Who is marked <b>Gratuity Applicable</b> and <b>LWF Applicable</b>, and on what rule. Two
						View Category clicks in their tenant.
					</Gap>
					<NoteBelow>
						<b>This is the finding on the screen.</b> Both sit in the same table as Department, which
						means statutory pay treatment in Factor HR is maintained by whoever maintains
						departments. ERPNext has neither as a category: gratuity is a <code>Gratuity Rule</code>,
						LWF a salary component with a condition. <b>Neither imports onto a field</b> — both have
						to be rebuilt as rules, and the two lists are how you check the rules were written right.
					</NoteBelow>
				</Panel>

				<Panel title="Three types unseen, and three of ours absent" cov="none" ico="❓">
					<Gap>Page 2 — three more category types, and nothing to guess them from.</Gap>
					<NoteBelow>
						The five on page 1 are in alphabetical order, and that carries a finding of its own:{" "}
						<b>{ours.map((f) => f[1]).join(", ")} would all have sorted onto page 1</b>, and none of
						them is there. So three of the five fields ERPNext groups people by have no category type
						in Factor HR at all — they are ours rather than theirs, and nothing is coming across to
						fill them. The three on page 2 sort after <em>LWF</em> and are something else again.{" "}
						<b>One more screenshot settles it.</b>
					</NoteBelow>
				</Panel>

				{CATEGORY_FIELDS.map((f) => {
					const held = a.filter((e) => e[f[0]]);
					const used = tally(held, f[0]);
					const blank = a.length - held.length;
					const defined = f[2] ? s.counts[f[2]] : null;
					return (
						<Panel key={f[0]} title={f[1]} cov={used.length ? "live" : "none"} ico={f[3]}>
							<div className="mb-[.6rem]">
								{f[4] ? (
									<span className="tag">has a Category Type</span>
								) : (
									<>
										<span className="tag warn">ours only</span>{" "}
										<span className="muted text-[.8rem]">no row on their screen</span>
									</>
								)}
							</div>
							{used.length ? (
								<>
									<Bars pairs={used.slice(0, 8).map((r) => [f[0] === "department" ? tidyDept(r[0]) : r[0], r[1]])} />
									<div className="rows mt-[.7rem]">
										<div className="row">
											<span>In use</span>
											<span className="val">{used.length}</span>
										</div>
										{defined != null && (
											<div className="row">
												<span>Defined on the site</span>
												<span className="val">{fmt(defined)}</span>
											</div>
										)}
										<div className="row">
											<span>People with none</span>
											<span className="val">{fmt(blank)}</span>
										</div>
									</div>
								</>
							) : (
								<Empty title="Not set for anybody">
									The field is on every record and blank on all {fmt(a.length)} of them.
								</Empty>
							)}
						</Panel>
					);
				})}

				<Panel title="Defined is not the same as used" cov="part" ico="✂">
					<Note>
						Fifteen departments are in use against the{" "}
						<b>{fmt(s.counts.departments || 0)} sitting on the site</b>, most of them ERPNext’s own
						defaults. The extras are worth <b>pruning rather than mapping onto</b>: each one is a
						wrong answer somebody can pick from a dropdown, and a person filed under the wrong
						department is a person whose corrections go to the wrong manager.
					</Note>
				</Panel>
			</Cols>
		</>
	);
}
