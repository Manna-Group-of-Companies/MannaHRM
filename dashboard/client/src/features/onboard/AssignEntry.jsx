import { patch, useApp } from "@/store";
import { load } from "@/api/load";
import { scoped } from "@/lib/scope";
import { dmy, dmyTime, fmt, tidyDept } from "@/lib/format";
import { deskImport, deskNew, deskUrl } from "@/lib/desk";
import { ASSIGN_FORM, ASSIGN_FORM_GAPS } from "@/data/onboard";
import { Desk, Empty, FieldChip, Scroll } from "@/components/ui";
import { assetRows } from "@/features/onboard/shared";
import EmployeeList from "@/features/employees/EmployeeList";

/* ---------------------------------------------------------------------------
   Factor HR's **Assets Assignment**, photographed 3 September 2026 — the same
   day as Assets Details, and the page this one had been saying it had never
   seen.

   It is a *person* screen, and that is the whole shape of it: their employee
   bar at the top — the coloured dot, Search employee, List of Employees, the
   same three controls Salary Master and the regularization screen carry — then
   an ASSETS table of what that person is holding, then the fifteen-box form for
   one handover.

   **Nothing here types into anything.** Every box is filled from the row picked
   in the table above it and is read-only, because this dashboard reads and the
   writes are documents on the site (CLAUDE.md §1). So Save is a link to a new
   Asset Movement over there rather than a button that pretends, and Cancel
   empties the boxes, which is the one thing it can honestly do here.

   Their table has nine columns and two of them have nothing behind them on this
   side — VALID TILL and REMARK — for the same reason seven of the fifteen boxes
   are dead: an ERPNext handover is two rows in a log, an Issue and later a
   Receipt, with no end date and no note on either. See ASSIGN_FORM.
   --------------------------------------------------------------------------- */

/** How many rows of the ASSETS table are on a page. */
const PER = 10;

const Ic = ({ d, w = 17 }) => (
	<svg viewBox="0 0 24 24" width={w} height={w} stroke="currentColor" fill="none"
		strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
		<path d={d} />
	</svg>
);

/* The same coloured dot as Salary Master and the regularization screen, because
   it is the same control on their bar. Its own selection, though: a filter set
   on one screen is not a filter set on another, and sharing them would silently
   hide people here. */
function AsgDot({ s }) {
	const opts = [
		["Active", "on", "Active"], ["Inactive", "off", "InActive"], ["", "all", "All"],
	];
	const cur = opts.find((o) => o[0] === s.asg.status) || opts[2];
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="listbox" aria-label="Filter by status"
				aria-expanded={s.asg.menu} title={"Status: " + cur[2]}
				/* Out of the document handler's way, which would otherwise close the
				   menu in the same click that opened it. See App.jsx. */
				onClick={(e) => { e.stopPropagation(); patch("asg", { menu: !s.asg.menu }); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!s.asg.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === s.asg.status}
						onClick={(e) => { e.stopPropagation(); patch("asg", { status: o[0], menu: false }); }}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

/** Picking somebody empties the table's pager and the boxes under it. A page
    number and a picked handover both belong to the person who was on screen,
    and neither means anything against the next one. */
const pickPerson = (name) => patch("asg", { emp: name, q: "", list: false, page: 1, pick: "" });

/** A person, as the search picker and the List of Employees panel both draw
    them — one row shape, so a choice made either way is the same choice. */
const PickRow = ({ e }) => (
	<button onClick={() => pickPerson(e.name)}>
		<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
		<b>{e.employee_name}</b>
		<span className="mono">{e.employee_number || "—"}</span>
		<span className="muted">{tidyDept(e.department)}</span>
	</button>
);

/** Who the two pickers can offer: in scope for the company, then filtered by
    the dot — which is what the dot is for on their screen as well. */
export function asgPool(s) {
	const rows = scoped(s);
	return s.asg.status ? rows.filter((e) => e.status === s.asg.status) : rows;
}

/* Their ASSET ICON column. Nothing on either side stores an icon against an
   asset — theirs draws one per type — so it is derived from the category and
   says so on hover rather than being passed off as a field. A category nobody
   has a glyph for gets the box, which is honest and still lines the column up. */
const ICONS = [
	[/laptop|computer|desktop|cpu|monitor/i, "💻"],
	[/mobile|phone|handset|sim/i, "📱"],
	[/vehicle|car|bike|scooter|truck/i, "🚗"],
	[/furniture|chair|table|desk|cabinet/i, "🪑"],
	[/tool|machine|plant|equip|instrument/i, "🔧"],
	[/print|scanner|copier/i, "🖨"],
	[/software|licen[cs]e/i, "🗝"],
	[/safety|helmet|shoe|glove|uniform/i, "🦺"],
];
const iconFor = (cat) => ICONS.find(([re]) => re.test(cat || ""))?.[1] || "📦";

/** The Issue and the Receipt that put an asset with somebody and took it back.

    Latest of each rather than first: an asset can go out, come back and go out
    again, and the handover on screen is the one running now. `moveTier` decides
    whether this can be asked at all — a site whose movement list came back
    without `asset` and `to_employee` has a history and no way to attribute it,
    which is a different answer from "never issued". */
function handover(s, assetName, emp) {
	if (s.moveTier !== "full" || !assetName) return {};
	const mine = s.assetMoves.filter((m) => m.asset === assetName);
	const last = (rows) => rows.slice().sort((a, b) =>
		String(b.transaction_date || "").localeCompare(String(a.transaction_date || "")))[0];
	return {
		issue: last(mine.filter((m) => m.purpose !== "Receipt" && (!emp || m.to_employee === emp))),
		receipt: last(mine.filter((m) => m.purpose === "Receipt" && (!emp || m.from_employee === emp))),
	};
}

/** One of their fifteen boxes.

    A box whose field this side has not got is still drawn, at the width the
    others are, and disabled with the reason on it — the same bargain the Assets
    Details form makes one page over. Seven of these fifteen are in that state,
    and that is the finding this screenshot produced. */
function Field({ f, ctx, tier, moveTier }) {
	const dead = f.state === "build";
	/* "Not read" is not the same claim as "empty", and only the tier can tell
	   them apart. Two of these read off the Asset fields added on 3 Sep and two
	   off the movement columns added the same day; a site answering the older
	   shape of either comes back absent rather than blank. */
	const unread = (f.state === "stock" && tier !== "full")
		|| ((f.key === "assign_date" || f.key === "returned_on") && moveTier !== "full");
	const raw = ctx.asset && f.get ? f.get(ctx) : undefined;
	const value = raw == null || raw === ""
		? ""
		: f.kind === "date" ? dmyTime(raw)
			: typeof raw === "number" ? fmt(raw)
				: String(raw);

	return (
		<div className={"fld" + (f.area ? " area" : "")}>
			<label className={dead || unread ? "off" : ""} htmlFor={"ag-" + f.key}>{f.label}</label>
			{f.area ? (
				<textarea id={"ag-" + f.key} rows={3} readOnly disabled={dead || unread}
					value={dead || unread ? "" : value}
					title={dead || unread ? f.why : `${f.label} — ${f.why}`} />
			) : (
				<input id={"ag-" + f.key} readOnly disabled={dead || unread}
					value={unread ? "" : value}
					placeholder={unread ? "not read" : ""}
					title={dead || unread ? f.why : `${f.label} — ${f.why}`} />
			)}
			<FieldChip state={unread ? "stock" : f.state} />
		</div>
	);
}

export default function AssignEntry() {
	const s = useApp();
	const pool = asgPool(s);
	const emp = s.asg.emp ? s.byName[s.asg.emp] : null;
	const q = (s.asg.q || "").trim().toLowerCase();

	const matches = q
		? pool
			.filter((e) => [e.employee_number, e.employee_name, e.designation]
				.some((v) => (v || "").toLowerCase().includes(q)))
			.slice(0, 8)
		: [];

	/* What this person is holding. The custodian is on the asset rather than on
	   the movement, which is why the table stands up even on a site whose
	   movement read came back short — the dates are what go missing then, not
	   the rows. */
	const all = assetRows(s);
	const held = emp ? all.filter((a) => a.custodian === emp.name) : [];
	const pages = Math.max(1, Math.ceil(held.length / PER));
	const page = Math.min(Math.max(1, s.asg.page || 1), pages);
	const shown = held.slice((page - 1) * PER, page * PER);
	const first = held.length ? (page - 1) * PER + 1 : 0;

	const picked = (s.asg.pick && held.find((a) => a.name === s.asg.pick)) || null;
	const ctx = { asset: picked, ...handover(s, picked?.name, emp?.name) };

	return (
		<div className="fhscreen asgscreen">
			<div className="embar asgbar">
				<AsgDot s={s} />

				<span className="find rev">
					<input type="search" placeholder="Search employee..." aria-label="Search employee"
						value={s.asg.q || ""} onChange={(e) => patch("asg", { q: e.target.value })} />
					<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
						strokeWidth="1.8" strokeLinecap="round">
						<circle cx="11" cy="11" r="7" />
						<path d="M20 20l-3.6-3.6" />
					</svg>
				</span>

				<button className="embtn list" aria-pressed={s.asg.list}
					title="Pick from everybody rather than by typing — their second way into the same choice"
					onClick={() => patch("asg", { list: !s.asg.list, q: "" })}>
					List of Employees
				</button>
			</div>

			{/* The picker their search box opens under itself. Ours says how many
			    people it searched, because the dot can empty it and a search that
			    finds nobody should say which filter did that. */}
			{!emp && q ? (
				<div className="regfind">
					{matches.length ? (
						matches.map((e) => <PickRow key={e.name} e={e} />)
					) : (
						<span className="none">
							Nobody matches, out of {fmt(pool.length)} searched
							{s.asg.status ? ` · status ${s.asg.status}` : ""}
						</span>
					)}
				</div>
			) : null}

			{/* Drawn whether or not somebody is already picked — theirs is a way of
			    changing who that is, and a list that vanished the moment it worked
			    would be a list you could never use twice. */}
			{s.asg.list ? (
				<EmployeeList
					pool={pool}
					busy={s.connState === "loading" || s.conn === "loading…"}
					onReload={() => { void load(); }}
					onPick={(e) => pickPerson(e.name)} />
			) : null}

			{emp ? (
				<div className="regwho">
					<i className={"sdot " + (emp.status === "Active" ? "on" : "off")} />
					<b>{emp.employee_name}</b>
					<span className="mono">{emp.employee_number || "—"}</span>
					<span className="muted">{tidyDept(emp.department)} · {emp.company}</span>
					<span className="n">{held.length ? `holding ${fmt(held.length)}` : "holding nothing"}</span>
					<button className="embtn" onClick={() => pickPerson("")}>Clear</button>
				</div>
			) : null}

			<div className="fhtitle row">
				Assets
				<span className="ics">
					{/* Loading handovers from a spreadsheet is a write, and the wizard on
					    the site previews the file before it makes one — so their up-arrow
					    goes there rather than opening a file box that could not finish the
					    job. */}
					<Desk href={s.site && deskImport(s.site)} label="Import"
						title="Loads assignments from a spreadsheet. Opens ERPNext's Data Import on the site — nothing is written until the preview there is accepted.">
						<Ic d="M12 16V4M7 9l5-5 5 5M4 20h16" />
					</Desk>
					<button className="embtn" aria-label="Refresh" title="Read the site again."
						onClick={() => { void load(); }}>
						<Ic d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
					</button>
					{/* Their gear is column settings, and this table has no stored column
					    preference to open — so it is drawn dead with that on it rather than
					    wired to something else that happened to be nearby. */}
					<button className="embtn" disabled aria-label="Settings"
						title="Theirs picks which columns this table shows. Nothing here stores a column preference, so there is nothing to open — the nine columns are always all nine.">
						<Ic d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M12 2.6l1.5 2.5 2.9-.5.5 2.9 2.5 1.5-1.4 2.6 1.4 2.6-2.5 1.5-.5 2.9-2.9-.5-1.5 2.5-1.5-2.5-2.9.5-.5-2.9L4.6 14.2 6 11.6 4.6 9l2.5-1.5.5-2.9 2.9.5z" />
					</button>
				</span>
			</div>

			<Scroll>
				<table className="asgtab">
					<thead>
						<tr>
							<th>Sr.No</th><th>Asset Icon</th><th>Asset Type</th><th>Assets</th>
							<th>Assign Date</th><th>Valid Till</th><th>Asset Status</th>
							<th>Remark</th><th className="act">Action</th>
						</tr>
					</thead>
					<tbody>
						{emp && shown.length ? shown.map((a, i) => {
							const h = handover(s, a.name, emp.name);
							return (
								<tr key={a.name} className={a.name === s.asg.pick ? "on" : ""}>
									<td className="mono">{first + i}</td>
									<td className="ico"
										title={`Drawn from the asset type — ${a.asset_category || "no type on the record"}. Neither side stores an icon against an asset.`}>
										{iconFor(a.asset_category)}
									</td>
									<td>{a.asset_category || "—"}</td>
									<td>{a.asset_name || a.name}</td>
									<td className="mono" title={s.moveTier === "full"
										? "The date of the Asset Movement that issued it."
										: "The movement list came back without the columns that say what moved and to whom, so this cannot be attributed. Not the same as never issued."}>
										{s.moveTier === "full" ? dmy(h.issue?.transaction_date) : "not read"}
									</td>
									<td className="dead"
										title="Nothing holds it. An ERPNext handover ends when a second movement brings the asset back, so there is no date set in advance to read.">
										—
									</td>
									<td>
										<span className={"pill " + (a.status === "In Use" ? "on" : "off")}>
											{a.status || "—"}
										</span>
									</td>
									<td className="dead"
										title="Asset Movement has no remarks field. Frappe hangs Comments off the document instead, which is signed and dated rather than editable into agreement later.">
										—
									</td>
									<td className="act">
										<button className="fhact on" aria-label="View"
											aria-pressed={a.name === s.asg.pick}
											title="Put this handover in the boxes below."
											onClick={() => patch("asg", { pick: a.name === s.asg.pick ? "" : a.name })}>
											<Ic d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6" w={15} />
										</button>
										<Desk className="fhact on" label="Edit"
											href={s.site && deskUrl(s.site, "Asset", a.name)}
											title="Open this asset on the ERPNext site, where its custodian can be changed — which is what an assignment is over there.">
											<Ic d="M4 20h4L20 8l-4-4L4 16Z" w={15} />
										</Desk>
									</td>
								</tr>
							);
						}) : (
							/* Their screen draws one row of dashes when there is nothing in
							   it, and so does this one. The count line underneath is the
							   honest half: theirs says "1 to 1 of 1 entries" over that empty
							   row, and a number counting a placeholder is a number somebody
							   will quote back. */
							<tr className="blank">
								{Array.from({ length: 9 }, (_, i) => (
									<td key={i} className="dead"
										title={emp
											? "Nothing is out with this person, so there is no handover to show."
											: "Nobody is picked. Their screen draws this row too."}>
										—
									</td>
								))}
							</tr>
						)}
					</tbody>
				</table>
			</Scroll>

			<div className="fhfoot asgfoot">
				<span className="cnt">
					{emp && held.length ? (
						<>Showing {fmt(first)} to {fmt((page - 1) * PER + shown.length)} of {fmt(held.length)} entries</>
					) : (
						<>
							Showing 0 to 0 of 0 entries{" "}
							<span className="muted">
								{emp ? "— nothing is out with this person" : "— nobody is picked yet"}
							</span>
						</>
					)}
				</span>
				<span className="fhpage">
					<button className="embtn" disabled={page <= 1}
						onClick={() => patch("asg", { page: page - 1 })}>Previous</button>
					{Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
						<button key={n} className={"embtn" + (n === page ? " pri" : "")}
							aria-current={n === page ? "page" : undefined}
							onClick={() => patch("asg", { page: n })}>
							{n}
						</button>
					))}
					<button className="embtn" disabled={page >= pages}
						onClick={() => patch("asg", { page: page + 1 })}>Next</button>
				</span>
			</div>

			<div className="asgform">
				<div className="asgrid">
					{ASSIGN_FORM.map((f) => (
						<Field key={f.key} f={f} ctx={ctx} tier={s.assetTier} moveTier={s.moveTier} />
					))}
				</div>

				<div className="asgact">
					{/* Their Save writes the handover. Ours opens the document that *is*
					    the handover on the site — an Asset Movement, which is what moves a
					    custodian there — because this dashboard reads, and a button that
					    looked like it saved would be the one lie on the page. */}
					<Desk className="embtn pri" label="Save"
						href={s.site && deskNew(s.site, "Asset Movement")}
						title="A handover is an Asset Movement on the ERPNext site: it names the asset, who it goes to and when, and moves the custodian when it is submitted. This opens a blank one there — nothing on this dashboard writes.">
						Save
					</Desk>
					<button className="embtn" disabled={!picked}
						title={picked
							? "Empty the boxes. Nothing is saved and nothing is lost — every one of them is read from the record."
							: "The boxes are already empty."}
						onClick={() => patch("asg", { pick: "" })}>
						Cancel
					</button>
					<span className="who">
						{picked ? (
							<>Showing <b>{picked.asset_name || picked.name}</b>{" "}
								<span className="mono">{picked.name}</span></>
						) : (
							<span className="muted">
								{emp
									? "No handover picked — the eye in the Action column fills these boxes."
									: "Nobody is picked, so there is nothing to fill these from."}
							</span>
						)}
					</span>
				</div>
			</div>

			{emp && !held.length ? (
				<Empty title={`Nothing is out with ${emp.employee_name}`}>
					No asset on the register names them as custodian. Where handovers are recorded that is the
					same sentence as &ldquo;they have been given nothing&rdquo;; where they are not, it says
					only that nobody wrote it down. {fmt(all.filter((a) => a.custodian).length)} of{" "}
					{fmt(all.length)} assets name anybody at all.
				</Empty>
			) : null}
		</div>
	);
}
