import { patch, useApp } from "@/store";
import { scoped } from "@/lib/scope";
import { fmt, tidyDept, todayIso } from "@/lib/format";
import { download, toCsv } from "@/lib/csv";
import { Desk, Empty, Gap, Note, Scroll } from "@/components/ui";
import { deskImport, deskNew, deskUrl } from "@/lib/desk";
import { FH_ADHOC_CLIPPED, FH_ADHOC_FILTERS, FH_ADHOC_ROWS } from "@/data/payroll";
import { NotReadable, PayLegend } from "./shared";

/* ADHOC PAYMENTS/DEDUCTIONS, photographed 29 August 2026 and drawn here control
   for control: the title with six icons pinned to its right edge, one bar of an
   employee search and four lists, and a four-column table whose amount cells are
   empty because they are inputs rather than figures.

   Drawn even though payroll is deferred, for the same reason Salary Master is
   drawn with nothing under it: this is the screen HR uses today, and a screen
   that names what it is missing can be held up against theirs before a rupee is
   loaded. What it must not do is imply it can pay anybody. Nothing here writes —
   no payroll doctype is on the proxy's allowlist at all (server/index.js), so each
   of the six icons either opens the job on the site, where the audit trail is,
   or says why it cannot.

   The one thing this page adds to the photograph is the arithmetic nobody has
   done yet: **their one screenful is our N documents.** `Additional Salary` is
   one document per person per component per date, so a month in which forty
   people take a food allowance is forty rows on our side and one grid on
   theirs. That is what any import written against E1 has to unfold, and it is
   cheaper to find out here than in the first payroll run. */

/** One of the six title-bar icons. `href` sends it to the site; `onClick` does
    the job here; neither, and it draws dead with the reason on it. Same control
    as Salary Master's, kept local rather than shared — theirs is a different bar
    with a different set of jobs on it, and one shared icon would grow a flag per
    screen before long. */
function TitleIcon({ path, label, title, href, onClick }) {
	const ico = (
		<svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" fill="none"
			strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
			<path d={path} />
		</svg>
	);
	if (href !== undefined) {
		return <Desk className="embtn" href={href} label={label} title={title}>{ico}</Desk>;
	}
	return (
		<button className="embtn" disabled={!onClick} title={title} aria-label={label} onClick={onClick}>
			{ico}
		</button>
	);
}

/* The coloured dot in front of Search Employee. Its own selection, like Salary
   Master's and for the same reason: a filter set on one screen is not a filter
   set on another, and sharing them would silently hide people here. Blue — All —
   is how the capture found it. */
function AdDot({ s }) {
	const opts = [
		["Active", "on", "Active"], ["Inactive", "off", "InActive"], ["", "all", "All"],
	];
	const cur = opts.find((o) => o[0] === s.adhoc.status) || opts[2];
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="listbox" aria-label="Filter by status"
				aria-expanded={s.adhoc.menu} title={"Status: " + cur[2]}
				/* Out of the document handler's way, which would otherwise close the
				   menu in the same click that opened it. */
				onClick={(e) => { e.stopPropagation(); patch("adhoc", { menu: !s.adhoc.menu }); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!s.adhoc.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === s.adhoc.status}
						onClick={(e) => { e.stopPropagation(); patch("adhoc", { status: o[0], menu: false }); }}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

/** One of the four lists on their bar. Every one is dead, and the tooltip says
    which kind of dead it is: PAYMENT PROCESS carries the one value the capture
    caught, the other three were empty, and none of the four lists has ever been
    opened. A select filled with plausible options would be a list nobody has
    seen — and there is nothing under it to filter either way. */
function DeadPick({ label, value, why }) {
	const id = "ad-" + label.toLowerCase().replace(/[^a-z]+/g, "-");
	return (
		<span className="adf">
			<label htmlFor={id}>{label}</label>
			<select id={id} disabled value={value} title={why} onChange={() => {}}>
				<option value={value}>{value}</option>
			</select>
		</span>
	);
}

/** A person, as the picker draws them — the same row shape as Salary Master's,
    because it is the same choice being made. */
const PickRow = ({ e }) => (
	<button onClick={() => patch("adhoc", { emp: e.name, q: "" })}>
		<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
		<b>{e.employee_name}</b>
		<span className="mono">{e.employee_number || "—"}</span>
		<span className="muted">{tidyDept(e.department)}</span>
	</button>
);

/** What this screen can honestly put in a file: their component list, and what
    would stand behind each row here. Not a payment file — there are no amounts
    on this side to put in one, and the heading row says so, because a
    spreadsheet outlives the screen that made it. */
function adhocCsv(rows) {
	const cols = ["Description", "Level", "Earning", "Deduction", "Reference / Remarks",
		"What would stand behind it here"];
	download(
		"adhoc-components-" + todayIso() + ".csv",
		toCsv(cols, rows.map((r) => [
			r.head || r.desc,
			r.head ? "heading" : "row",
			"", "", "",
			r.map || "",
		])),
	);
}

export default function Adhoc() {
	const s = useApp();
	const a = s.adhoc;
	const emp = a.emp ? s.byName[a.emp] : null;
	const q = (a.q || "").trim().toLowerCase();

	const pool = a.status ? scoped(s).filter((e) => e.status === a.status) : scoped(s);
	const matches = q
		? pool
			.filter((e) => [e.employee_number, e.employee_name, e.designation]
				.some((v) => (v || "").toLowerCase().includes(q)))
			.slice(0, 8)
		: [];

	/* The magnifier in their title bar searches the descriptions, not the people
	   — the bar underneath already has an employee search on it. A heading is
	   kept whenever anything under it survives the filter, so a filtered list is
	   still their list rather than a flattened one. */
	const find = (a.find || "").trim().toLowerCase();
	const hit = (r) => !r.head && r.desc.toLowerCase().includes(find);
	const rows = find
		? FH_ADHOC_ROWS.filter((r, i) => {
			if (!r.head) return hit(r);
			const after = FH_ADHOC_ROWS.slice(i + 1);
			const next = after.findIndex((n) => n.head);
			return (next === -1 ? after : after.slice(0, next)).some(hit);
		})
		: FH_ADHOC_ROWS;
	const listed = FH_ADHOC_ROWS.filter((r) => !r.head).length;

	return (
		<>
			<PayLegend what="Adhoc Payments/Deductions">
				A one-off amount against one person — an incentive, a recovery, an arrear. Frappe HR ships
				this whole screen as <code>Additional Salary</code>. Theirs is drawn below as photographed;{" "}
				<b>nothing on this side can pay anybody.</b>
			</PayLegend>

			<div className="fhscreen">
				<div className="fhtitle row">
					Adhoc Payments/Deductions
					<span className="ics">
						{/* The one control on this bar that does the real job. Over there it
						    writes with no approval on it at all — there is no workflow on
						    `Additional Salary`, which is an open policy question rather than
						    a build. See docs/FACTOHR_SCREENS.md §27. */}
						<Desk className="embtn pri adadd" href={s.site && deskNew(s.site, "Additional Salary")}
							label="Add"
							title="One amount, one person, one component, one date. Opens a new Additional Salary on the ERPNext site — nothing here writes payroll, and no payroll doctype is on this proxy's allowlist.">
							+ Add
						</Desk>
						{/* Edit and Delete act on a selected row of theirs. There is no row on
						    this side to select — the table below is their component list, read
						    off a photograph, not payments held here. */}
						<TitleIcon path="M4 20h4L19 9l-4-4L4 16v4zM14.5 5.5l4 4" label="Edit"
							title="Edits the row selected in their grid. There is no row here to select: this table is their component list read off a photograph, not payments held on our side." />
						<TitleIcon path="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" label="Delete"
							title="Deletes the selected row. Nothing on this page is ours to delete — and an amount that has reached a payslip is cancelled on the site, never deleted." />
						<button className="embtn" aria-pressed={a.search} aria-label="Search"
							title="Search the descriptions. Their magnifier, and the one icon on this bar that does here exactly what it does there."
							onClick={() => patch("adhoc", { search: !a.search, find: "" })}>
							<svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" fill="none"
								strokeWidth="1.7" strokeLinecap="round">
								<circle cx="11" cy="11" r="7" />
								<path d="M20 20l-3.6-3.6" />
							</svg>
						</button>
						{/* Import is the one that matters for the migration: E1 lands as a
						    spreadsheet and this is where a month of adhoc lines would go in.
						    It previews before it writes, which is the only reason it is
						    offered while the structure behind it does not exist. */}
						<TitleIcon path="M12 16V4M7 9l5-5 5 5M4 20h16" label="Import"
							href={s.site && deskImport(s.site)}
							title="Loads amounts from a spreadsheet. Opens ERPNext's Data Import on the site — nothing is written until the preview there is accepted. One row per person per component, not one row per grid." />
						<TitleIcon path="M14 4h5v16h-5M10 8l4 4-4 4M3 12h11" label="Export"
							onClick={() => adhocCsv(FH_ADHOC_ROWS)}
							title="Export their component list and what would stand behind each row here, as CSV. Not a payment file — there are no amounts on this side to put in one." />
					</span>
				</div>

				<div className="embar adbar">
					<AdDot s={s} />

					<span className="find rev">
						<input type="search" placeholder="Search Employee" aria-label="Search employee"
							value={a.q || ""} onChange={(e) => patch("adhoc", { q: e.target.value })} />
						<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
							strokeWidth="1.8" strokeLinecap="round">
							<circle cx="11" cy="11" r="7" />
							<path d="M20 20l-3.6-3.6" />
						</svg>
					</span>

					{FH_ADHOC_FILTERS.map(([label, value, why]) => (
						<DeadPick key={label} label={label} value={value} why={why} />
					))}
				</div>

				{/* Their search box opens the picker under itself. Ours says how many
				    people it searched, because the dot can empty it and a search that
				    finds nobody should say which filter did that. */}
				{!emp && q ? (
					<div className="regfind">
						{matches.length ? (
							matches.map((e) => <PickRow key={e.name} e={e} />)
						) : (
							<span className="none">
								Nobody matches, out of {fmt(pool.length)} searched
								{a.status ? ` · status ${a.status}` : ""}
							</span>
						)}
					</div>
				) : null}

				{emp ? (
					<div className="regwho">
						<i className={"sdot " + (emp.status === "Active" ? "on" : "off")} />
						<b>{emp.employee_name}</b>
						<span className="mono">{emp.employee_number || "—"}</span>
						<span className="muted">{tidyDept(emp.department)} · {emp.company}</span>
						<span className="n">no adhoc payments — none exist for anybody</span>
						<button className="embtn" onClick={() => patch("adhoc", { emp: "", q: "" })}>Clear</button>
					</div>
				) : null}

				{a.search ? (
					<span className="find adfind">
						<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
							strokeWidth="1.8" strokeLinecap="round">
							<circle cx="11" cy="11" r="7" />
							<path d="M20 20l-3.6-3.6" />
						</svg>
						<input type="search" placeholder="Search description" aria-label="Search description"
							value={a.find || ""} onChange={(e) => patch("adhoc", { find: e.target.value })} />
					</span>
				) : null}

				<Scroll>
					<table className="adhoc">
						<thead>
							<tr>
								<th className="g" />
								<th>Description</th>
								<th className="amt">Earning</th>
								<th className="amt">Deduction</th>
								<th>Reference / Remarks</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => (r.head ? (
								<tr className="grp" key={r.head}>
									<td />
									<td colSpan={4}>{r.head}</td>
								</tr>
							) : (
								<tr key={r.desc}>
									<td className="g">{r.n ?? ""}</td>
									<td className={"desc" + (r.blue ? " lnk" : "")}>
										{r.desc}
										{/* What would stand behind this row here. Under the name rather
										    than in a column of its own, because their four columns are
										    the screen and a fifth would stop it being a copy of it. */}
										{r.map ? <small title={r.why}>{r.map}</small> : null}
										{r.blue ? (
											<small className="unread" title="It sits at the same indent as the component rows but is drawn bold and in their link blue, and the capture does not resolve which it is. Left as it looks.">
												numbered 1 — heading or row, not resolvable from the capture
											</small>
										) : null}
									</td>
									{/* Their cells are empty because they are inputs. Ours are empty
									    because there is nothing to put in them and nowhere to put it
									    — left blank as theirs are rather than filled with a zero,
									    which would be a figure this page has no business showing. */}
									<td className="amt" />
									<td className="amt" />
									<td />
								</tr>
							)))}
							{!rows.length ? (
								<tr>
									<td />
									<td colSpan={4} className="none">
										Nothing in their list matches “{a.find}”, out of {listed} rows read off the
										capture.
									</td>
								</tr>
							) : null}
							{FH_ADHOC_CLIPPED && !find ? (
								<tr className="clip">
									<td />
									<td colSpan={4}>
										Their list runs on past the bottom of the capture. {listed} rows were read; how
										many there are is not known, so this page states no total.
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</Scroll>
			</div>

			<div className="mt-4">
				<Note>
					<b>Their one screenful is our N documents.</b> <code>Additional Salary</code> is one
					document per person, per component, per date — so a month in which forty people take a
					food allowance is forty rows here and one grid there. Anything imported off E1 has to be
					unfolded that way round, and that is the shape of the job rather than a detail of it.
				</Note>

				<div className="mt-[.7rem]">
					<Gap>
						<b>Two of the rows under CTC Wise Input are not adhoc payments at all.</b> Gratuity is a
						statutory payment on leaving, computed from service length by a Gratuity Rule, and
						Health Insurance CTC is employer cost carried in the CTC rather than money that reaches
						a bank account. Both are components of a salary structure on our side, not{" "}
						<code>Additional Salary</code>. One screen there is three doctypes here, and the split
						is not visible from the labels.
					</Gap>
				</div>

				<div className="mt-[.7rem]">
					<Gap>
						<b>There is no approval on any of this.</b> Frappe HR ships no workflow on{" "}
						<code>Additional Salary</code>, so whoever can create the doctype can pay somebody. A
						Workflow plus a row on the approvals queue is about a day&rsquo;s work — but it is a
						policy question first, and it is still open.
					</Gap>
				</div>

				<div className="mt-[.7rem]">
					<NotReadable />
				</div>

				<div className="mt-[.7rem]">
					<Empty title="No adhoc payments exist, for anybody">
						Not a filter that found nothing: <code>Additional Salary</code> holds no rows on this
						site and payroll is deferred, so there is nothing to list under any employee, year or
						process. The picker above is live because <code>Employee</code> is —{" "}
						{fmt(pool.length)} people are in scope for it.
					</Empty>
				</div>

				<div className="mt-[.7rem] text-right">
					<Desk href={s.site && deskUrl(s.site, "Additional Salary")} label="Additional Salary list"
						title="Every Additional Salary on the site. Expect it to be empty until payroll is started.">
						Open the list on the site
					</Desk>
				</div>
			</div>
		</>
	);
}
