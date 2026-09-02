import { useEffect } from "react";
import { patch, set, useApp } from "@/store";
import { loadSeparations } from "@/api/load";
import { dmy, fmt, initials, tidyDept, ymd } from "@/lib/format";
import { download, toCsv } from "@/lib/csv";
import { deskImport, deskUrl } from "@/lib/desk";
import { Desk, Empty, Html, Note, SpecTable, panelProps, tabProps } from "@/components/ui";
import { openEmployee } from "@/features/employees/EmployeeMaster";
import { FH_FNF_FIELDS, FH_FNF_STAGES, FH_FNF_TABS, FH_FNF_WAITING } from "@/data/payroll";
import { NotReadable, PayLegend, scopeSaid } from "./shared";

/* Factor HR's FNF & Separation screen, photographed 29 August 2026: three
   numbered stages across the top, two bars of filters, and a card per person
   with the exit dates strung underneath.

   Their third stage was the one open, and it carried sixteen. See FH_FNF_TABS
   in `src/data/payroll.js` for what that number turned out to mean — it is not
   the zero this repo has been quoting off their summary tile, and the two are
   not in conflict.

   **The rows here are ours, not theirs.** Every other page under Payroll draws
   a count off `Employee` and says so; this one draws a *list*, which is the
   same promise made louder, so the population is spelled out on the page: who
   this site says is leaving or has left. No settlement can be processed from
   here and nothing on this page pretends otherwise. What it is for is seeing
   who would be in the queue on the day somebody switches it on. */

/* ------------------------------------------------------------------ dates -- */

/** An ISO date plus N days. Empty in, empty out — a notice period with no
    letter date behind it is not a date, and must not become today. */
function addDays(iso, n) {
	if (!iso || !n) return "";
	const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
	if (isNaN(d.getTime())) return "";
	d.setDate(d.getDate() + Number(n));
	return ymd(d);
}

/** The expected last working day, which no field on `Employee` holds: the day
    notice was given plus the notice period. Computed rather than read, and
    labelled as computed everywhere it is drawn — see FH_FNF_FIELDS. */
export const expDol = (e) => addDays(e.resignation_letter_date, e.notice_number_of_days);

/** The date this queue is ordered and filtered by: the day they left, or the
    day they are expected to. Their screen filters on a *Date of Leaving Range*
    over a column that was empty for all sixteen — so ours falls back to the
    expected day rather than dropping somebody who has not gone yet. */
export const leaveDate = (e) => String(e.relieving_date || expDol(e) || "").slice(0, 10);

/* The Indian financial year, April to March, which is what their YEAR box
   counts in — their capture read "2026- 2027". A calendar year files a March
   leaver under the wrong one, which is the same trap the Prof. Tax statement
   carries and for the same reason. */
const finYear = (iso) => {
	const [y, m] = String(iso).slice(0, 10).split("-").map(Number);
	return m ? (m < 4 ? y - 1 : y) : null;
};
const fyLabel = (y) => `${y} - ${y + 1}`;

/* ------------------------------------------------------------------- rows -- */

/** Whose employment is ending or has ended.

    Three tests rather than one, and the first is the one that matters:
    somebody serving notice is still **Active**, and is exactly who this queue
    is for. Their capture is the proof — sixteen people waiting, not one of them
    carrying a date of leaving. A filter on `status != "Active"` would have
    returned the people who had already gone and quietly missed the backlog. */
export const isLeaver = (e) =>
	e.status !== "Active" || !!e.relieving_date || !!e.resignation_letter_date;

/** How far along the record says each of their three stages is. Nothing here is
    a document in a state — there is no separation document on this site — so
    each mark says only what an `Employee` record can support. */
export function stageOf(e) {
	return {
		/* A date on the record is somebody having written the separation down. A
		   status that is merely no longer Active is somebody having gone with
		   nothing recorded about it, which is a different and worse thing. */
		sep: e.relieving_date || e.resignation_letter_date ? "done" : "part",
		clr: "none",
		fnf: "part",
	};
}

/** The exit read when it answered, and the dashboard's own employee list when
    it did not. The fallback is worth having rather than an error: the list
    every page already loads carries `status` and `date_of_joining`, so the
    queue still draws and only the two exit dates go missing. */
const sepSource = (s) => (s.sepState === "ok" && s.seps.length ? s.seps : s.employees);

/** Their two bars, applied in their order. `all` is the queue before any of the
    filters, because a page that only ever draws the filtered number is a page
    where a filter left on hides people silently. */
export function fnfRows(s) {
	const f = s.fnf;
	let rows = sepSource(s).filter(isLeaver);
	if (s.company) rows = rows.filter((e) => e.company === s.company);
	const all = rows.length;
	const nodate = rows.filter((e) => !leaveDate(e)).length;

	if (f.dot === "Active") rows = rows.filter((e) => e.status === "Active");
	if (f.dot === "Inactive") rows = rows.filter((e) => e.status !== "Active");

	/* Their STATUS box. FNF Done is empty by construction here — no settlement
	   can be processed on this site — and it is offered anyway, because a filter
	   that is missing is a filter nobody knows was asked for. The empty state
	   says why it came back empty rather than leaving it looking like a bad
	   search. */
	if (f.status === "done") rows = [];

	const q = f.q.trim().toLowerCase();
	if (q) {
		rows = rows.filter((e) => [e.employee_number, e.employee_name]
			.some((v) => (v || "").toLowerCase().includes(q)));
	}
	/* Their second search box, on the row below the first. Two searches on one
	   screen is theirs, not ours — so this one is given the columns the top one
	   does not cover, rather than being wired to the same two fields and quietly
	   doing nothing. */
	const find = f.find.trim().toLowerCase();
	if (find) {
		rows = rows.filter((e) => [e.designation, e.department, e.company, e.reason_for_leaving]
			.some((v) => (v || "").toLowerCase().includes(find)));
	}

	/* The range and the year both act on the leaving date, and only while the
	   radio is on Date of Leaving. A settlement date is a date nothing here
	   holds — see the title on the other radio. */
	if (f.range === "dol") {
		if (f.year) rows = rows.filter((e) => String(finYear(leaveDate(e))) === f.year);
		if (f.from) rows = rows.filter((e) => leaveDate(e) && leaveDate(e) >= f.from);
		if (f.till) rows = rows.filter((e) => leaveDate(e) && leaveDate(e) <= f.till);
	}

	/* Most recent first, which is what "Last 50 Activities" has to mean. The
	   joining date is the last resort so that a row with no exit date at all
	   still sorts somewhere rather than to the top. */
	const when = (e) => leaveDate(e) || String(e.date_of_joining || "").slice(0, 10);
	rows = rows.slice().sort((a, b) => (when(b) || "").localeCompare(when(a) || ""));

	const cap = f.scope.startsWith("n:") ? Number(f.scope.slice(2)) : 0;
	const capped = Boolean(cap && rows.length > cap);
	return { all, nodate, matched: rows.length, rows: cap ? rows.slice(0, cap) : rows, capped };
}

/* ------------------------------------------------------------------ chrome - */

const ICON = {
	refresh: "M20 11a8 8 0 1 0-2.3 6M20 5v6h-6",
	down: "M12 4v11M7 12l5 5 5-5M5 20h14",
	up: "M12 20V9M7 12l5-5 5 5M5 4h14",
	pen: "M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17Z",
	open: "M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
	kebab: "M12 6h.01M12 12h.01M12 18h.01",
	doc: "M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7Zm0 0v4h4M9 13h6M9 17h4",
};

function Ico({ path }) {
	return (
		<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
			strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
			<path d={path} />
		</svg>
	);
}

/** The status dot, the same control as Employee Master's and Regularization's.
    On this queue its two halves read as *still serving notice* and *already
    gone*, which is the one distinction anybody working this list cares about —
    said in the title rather than by renaming their options. */
function FnfDot({ f }) {
	const opts = [
		["Active", "on", "Active", "Still on the books — serving notice, or nothing has been closed off"],
		["Inactive", "off", "InActive", "Already gone, whatever the record does or does not say about when"],
		["", "all", "All", "Everybody in the queue"],
	];
	const cur = opts.find((o) => o[0] === f.dot) || opts[2];
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="listbox" aria-label="Filter by status"
				aria-expanded={f.menu} title={cur[2] + " — " + cur[3]}
				/* Kept off the document handler in App, which would otherwise close
				   the menu in the same click that opened it. */
				onClick={(e) => { e.stopPropagation(); patch("fnf", { menu: !f.menu }); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!f.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === f.dot} title={o[3]}
						onClick={(ev) => { ev.stopPropagation(); patch("fnf", { dot: o[0], menu: false }); }}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

/** One of the three marks under a person's name. The colour is the whole
    message, so the reason for it is on the title of every one of them. */
const Stage = ({ label, state, why }) => (
	<span className={"fnfstage " + state} title={why}>{label}</span>
);

const Field = ({ k, v, title }) => (
	<div className="fnff" title={title}>
		<span className="k">{k}</span>
		<span className={"v" + (v ? "" : " off")}>{v || "-"}</span>
	</div>
);

function Card({ s, e, picked, onPick }) {
	const st = stageOf(e);
	const exp = expDol(e);
	return (
		<article className="fnfcard">
			<div className="who">
				<div className="ava">{initials(e.employee_name)}</div>
				<div className="nm">
					<b>
						<span className="code">{e.employee_number || e.name}</span> {e.employee_name}
					</b>
					<span className="role">{e.designation || tidyDept(e.department)}</span>
				</div>
				{/* Their chip is green on every row, "FNF Not Done" and all. Not here:
				    on this page a colour has to mean what it means everywhere else in
				    the app, and a settlement nobody can process is not a finished
				    one — so it wears the unfinished chip. */}
				<span className="tag warn"
					title="Nothing on this site can process a settlement — see the table under the list.">
					FNF Not Done
				</span>
				<div className="stages">
					{FH_FNF_STAGES.map(([label, k, why]) => (
						<Stage key={k} label={label} state={st[k]} why={why} />
					))}
				</div>
			</div>

			<div className="det">
				<label className="pick" title="Select this row for the export">
					<input type="checkbox" checked={picked} onChange={onPick}
						aria-label={"Select " + (e.employee_name || e.name)} />
				</label>
				<Field k="DOJ" v={dmy(e.date_of_joining)}
					title="date_of_joining, off the record." />
				<Field k="DOL" v={e.relieving_date ? dmy(e.relieving_date) : ""}
					title="relieving_date, off the record. Empty on every row of Factor HR's own capture too." />
				<Field k="Exp DOL" v={exp ? dmy(exp) : ""}
					title="Computed here, not stored: the day notice was given plus the notice period." />
				<Field k="FNF processed" v=""
					title="Full and Final Statement is not installed on this site and is not on the proxy's allowlist. It cannot be anything but a dash here." />
				<div className="acts">
					<Desk className="fhact on" href={s.site && deskUrl(s.site, "Employee", e.name)}
						label="Edit on the site"
						title="Opens this Employee on the ERPNext site, where the exit fields are written.">
						<Ico path={ICON.pen} />
					</Desk>
					<button className="fhact on" title="Open this person's record here"
						aria-label="Open this record" onClick={() => openEmployee(e.name)}>
						<Ico path={ICON.open} />
					</button>
					<button className="fhact" disabled aria-label="More actions"
						title="Their kebab has not been opened, so what is on it is unknown and nothing is invented in its place.">
						<Ico path={ICON.kebab} />
					</button>
					<button className="fhact" disabled aria-label="Settlement statement"
						title="The settlement statement. There is no doctype behind it on this site.">
						<Ico path={ICON.doc} />
					</button>
				</div>
			</div>
		</article>
	);
}

/* -------------------------------------------------------------------- page - */

export default function FnF() {
	const s = useApp();
	const f = s.fnf;

	/* Read once, the first time somebody opens this page. The exit fields are of
	   no use to any other screen and the load everybody does is wide enough. */
	useEffect(() => { void loadSeparations(); }, []);

	const { all, nodate, matched, rows, capped } = fnfRows(s);
	/* A selection is only ever over what is on screen: a row picked and then
	   filtered away would otherwise ride into the export invisibly. */
	const shown = new Set(rows.map((e) => e.name));
	const sel = f.sel.filter((n) => shown.has(n));
	const allPicked = rows.length > 0 && sel.length === rows.length;

	/* Years the queue actually has somebody in, not a fixed list — a year on
	   this box that returns nobody is a year somebody spends a minute deciding
	   they have mis-filtered. */
	const years = [...new Set(
		sepSource(s).filter(isLeaver).map((e) => finYear(leaveDate(e))),
	)].filter(Boolean).sort((a, b) => b - a);

	const exportRows = sel.length ? rows.filter((e) => sel.includes(e.name)) : rows;
	/* The FNF column is written and left blank on purpose. An export whose
	   columns quietly differ from the screen's is an export somebody reconciles
	   twice. */
	const doExport = () => download(
		"final-settlement-" + ymd(new Date()) + ".csv",
		toCsv(
			["Code", "Name", "Company", "Department", "Designation", "Status", "DOJ", "DOL",
				"Exp DOL (computed)", "Notice days", "Resignation letter date", "Reason",
				"FNF processed"],
			exportRows.map((e) => [
				e.employee_number || e.name, e.employee_name, e.company, tidyDept(e.department),
				e.designation, e.status, e.date_of_joining || "", e.relieving_date || "",
				expDol(e), e.notice_number_of_days || "", e.resignation_letter_date || "",
				e.reason_for_leaving || "", "",
			]),
		),
	);

	const reload = () => { set({ sepState: "" }); void loadSeparations(); };
	const stage = FH_FNF_TABS.find((t) => t[0] === f.tab) || FH_FNF_TABS[2];

	return (
		<>
			<PayLegend what="Final Settlement">
				Their menu&rsquo;s name for it; the screen itself is headed <b>FNF &amp; Separation</b> and
				carries three numbered stages. Photographed 29 Aug 2026 with <b>{FH_FNF_WAITING} people</b>{" "}
				in the settlement stage and none of them processed.
			</PayLegend>

			<div className="fhscreen">
				<div className="fhtitle row">
					FNF &amp; Separation
					<span className="ics">
						<button className="embtn" title="Reload the exit fields from the site"
							aria-label="Reload" onClick={reload}>
							<Ico path={ICON.refresh} />
						</button>
					</span>
				</div>

				<div className="fnftabs" role="tablist" aria-label="Separation stage">
					{FH_FNF_TABS.map(([k, n, label]) => (
						<button key={k} className="fnftab"
							{...tabProps("fnftab-" + k, "fnfpane", f.tab === k)}
							onClick={() => patch("fnf", { tab: k })}>
							<i className="num">{n}</i>
							{label}
							{k === "settlement" && <b className="n">({fmt(all)})</b>}
						</button>
					))}
				</div>

				{f.tab !== "settlement" ? (
					<div {...panelProps("fnfpane", "fnftab-" + f.tab)} className="fnfpane">
						<Empty title={stage[2]}>
							Their tab, not their screen. The capture had Final Settlement open, so what these two
							draw has never been seen — and none of it is guessed at here.
						</Empty>
						<Note>
							<b>What would stand behind it: {stage[3]}.</b> <Html html={stage[4]} />
						</Note>
					</div>
				) : (
					<div {...panelProps("fnfpane", "fnftab-settlement")} className="fnfpane">
						<div className="embar fnfbar">
							<select value={f.scope} aria-label="How many to list"
								title="Their box reads “Last 50 Activities”. Most recent first, by leaving date where there is one."
								onChange={(e) => patch("fnf", { scope: e.target.value })}>
								<option value="n:50">Last 50 Activities</option>
								<option value="n:100">Last 100 Activities</option>
								<option value="n:250">Last 250 Activities</option>
								<option value="">All</option>
							</select>

							<span className="fnfradio">
								{[["dol", "Date of Leaving Range"], ["settle", "Settlement Date Range"]]
									.map(([k, l]) => (
										<label key={k} title={k === "settle"
											? "Nothing on this site holds a settlement date, so choosing it leaves the range with nothing to act on. Offered anyway, because which of the two somebody reached for is the finding."
											: "Filters on the relieving date — or on the expected last day, where there is no relieving date."}>
											<input type="radio" name="fnfrange" checked={f.range === k}
												onChange={() => patch("fnf", { range: k })} />
											{l}
										</label>
									))}
							</span>

							<label className="fnff top">
								<span className="k">Year</span>
								<select value={f.year} disabled={f.range !== "dol"} aria-label="Financial year"
									title={f.range === "dol"
										? "April to March, the way their box reads it — a calendar year files a March leaver under the wrong one."
										: "Nothing here holds a settlement date to count a year in."}
									onChange={(e) => patch("fnf", { year: e.target.value })}>
									<option value="">All years</option>
									{years.map((y) => <option key={y} value={String(y)}>{fyLabel(y)}</option>)}
								</select>
							</label>

							<FnfDot f={f} />

							<span className="find">
								<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
									strokeWidth="1.8" strokeLinecap="round">
									<circle cx="11" cy="11" r="7" />
									<path d="M20 20l-3.6-3.6" />
								</svg>
								<input type="search" placeholder="Search employee…" aria-label="Search employee"
									value={f.q} onChange={(e) => patch("fnf", { q: e.target.value })} />
							</span>
						</div>

						<div className="embar fnfbar">
							<label className="pick" title="Select everything shown">
								<input type="checkbox" checked={allPicked} aria-label="Select all shown"
									onChange={() => patch("fnf", { sel: allPicked ? [] : rows.map((e) => e.name) })} />
							</label>

							<label className="fnff top">
								<span className="k">Date from</span>
								<input type="date" value={f.from} disabled={f.range !== "dol"}
									onChange={(e) => patch("fnf", { from: e.target.value })} />
							</label>
							<label className="fnff top">
								<span className="k">Date till</span>
								<input type="date" value={f.till} disabled={f.range !== "dol"}
									onChange={(e) => patch("fnf", { till: e.target.value })} />
							</label>
							<label className="fnff top">
								<span className="k">Status</span>
								<select value={f.status} aria-label="Settlement status"
									onChange={(e) => patch("fnf", { status: e.target.value })}>
									<option value="notdone">FNF Not Done</option>
									<option value="done">FNF Done</option>
									<option value="">All</option>
								</select>
							</label>
							<label className="fnff top grow">
								<span className="k">Search</span>
								<input type="search" placeholder="Designation, department, reason"
									value={f.find} onChange={(e) => patch("fnf", { find: e.target.value })} />
							</label>

							<span className="regicons">
								<button className="embtn ic" title="Reload the exit fields from the site"
									aria-label="Reload" onClick={reload}>
									<Ico path={ICON.refresh} />
								</button>
								<button className="embtn ic" disabled={!rows.length} aria-label="Export"
									title={sel.length
										? `Export the ${sel.length} selected as CSV`
										: "Export everything shown as CSV"}
									onClick={doExport}>
									<Ico path={ICON.down} />
								</button>
								{/* Their up-arrow imports. Exit dates are a write, and writes
								    happen on the site — so it opens the wizard that does it
								    there rather than a form here that cannot. */}
								<Desk className="embtn ic" href={s.site && deskImport(s.site)} label="Import"
									title="Opens the Data Import wizard on the site, where exit dates are written.">
									<Ico path={ICON.up} />
								</Desk>
							</span>
						</div>

						{s.sepState === "loading" && (
							<Note>Reading the exit fields off <code>Employee</code>…</Note>
						)}
						{s.sepState && s.sepState !== "ok" && s.sepState !== "loading" && (
							<Note>
								<b>The exit fields could not be read — {s.sepState}.</b> The queue below falls back to
								the employee list every page already loads, so it still knows who is no longer Active
								and cannot know when any of them left.
							</Note>
						)}

						{!rows.length ? (
							<Empty title={f.status === "done" ? "Nothing has been settled" : "Nobody is in the queue"}>
								{f.status === "done" ? (
									"FNF Done is empty by construction: no settlement can be processed on this site, so no row can ever carry that state. Their own screen had none either — sixteen waiting, none processed."
								) : all ? (
									`${fmt(all)} people are in this queue before the filters. Clear the search, the dates or the year.`
								) : (
									<>
										Nobody on this site is leaving or has left — no relieving date, no resignation
										letter date, and nobody whose status is anything but Active
										{s.company ? " in this company" : ""}. Factor HR is holding{" "}
										<b>{FH_FNF_WAITING}</b> in the same stage, so this is the master not being
										loaded rather than nobody having gone.
									</>
								)}
							</Empty>
						) : (
							<>
								<div className="fnflist">
									{rows.map((e) => (
										<Card key={e.name} s={s} e={e} picked={sel.includes(e.name)}
											onPick={() => patch("fnf", {
												sel: sel.includes(e.name)
													? sel.filter((n) => n !== e.name)
													: sel.concat(e.name),
											})} />
									))}
								</div>
								<div className="fnfcount">
									{fmt(rows.length)}
									{matched === all ? "" : " of " + fmt(all)} shown
									{capped && <> — capped by the list box, {fmt(matched)} match</>}
									{sel.length > 0 && <>, {fmt(sel.length)} selected</>}
									{scopeSaid(s)}
								</div>
							</>
						)}

						<Note>
							<b>Who is in this queue.</b> Anybody this site says is leaving or has left — a relieving
							date, a resignation letter date, or a status that is no longer Active. The last test is
							the one that matters: <b>somebody serving notice is still Active</b>, and is exactly who
							the screen is for. Their own capture is the proof — {FH_FNF_WAITING} waiting, and not one
							of them carrying a date of leaving.
							{nodate > 0 && (
								<>
									{" "}
									<b>{fmt(nodate)} of the {fmt(all)} here carry no leaving date at all</b>, so any
									date or year filter drops them. Their screen has the same hole and puts a Date of
									Leaving Range directly above it.
								</>
							)}
						</Note>

						<NotReadable />

						<SpecTable
							cols={["Their column", "Where it would come from", "State", "Note"]}
							list={FH_FNF_FIELDS}
						/>
					</div>
				)}
			</div>
		</>
	);
}
