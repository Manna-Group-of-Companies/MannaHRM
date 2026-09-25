import { patch, useApp } from "@/store";
import { Modal } from "@/components/ui";
import { uniq } from "@/lib/scope";
import { fmt, tally, tidyDept, todayIso } from "@/lib/format";
import {
	EXPORT_CATS, EXPORT_CAT_WHY, EXPORT_DEAD, STATUS_ROWS,
} from "@/data/employees";
import {
	EMP_SECTIONS, EMP_SECTION_KEYS, employeesPdf, employeesXlsx, exportSheets, readForExport,
} from "@/lib/employeeexport";

/* ---------------------------------------------------------------------------
   **Export Employees Data** — Factor HR's dialog, behind Employee Master's ⋯,
   photographed 4 September 2026.

   Two columns of six controls and a blue Generate Report: Employee Status and
   Particular Employee, Active Date From and Till, Filter By and Group By.

   ## It replaced a button that wrote the file immediately

   That is the whole change and it costs a click, so it is worth saying why the
   click is worth paying. The export of a staff directory is the one thing on
   this page that leaves it — it goes to somebody outside the app, in a
   spreadsheet, with names and joining dates and device ids in it. "Which
   people, over what, grouped how" are questions better asked before the file
   exists than discovered after it has been sent.

   The old behaviour is not lost: the dialog **opens holding the page's own
   filters**, so pressing Generate Report without touching anything writes very
   nearly the file the old button wrote. Very nearly, and not exactly, is a real
   difference and it is on the dialog: the search box on the bar is not carried
   in, because their form has no free-text criterion and a hidden one would make
   the count on this dialog disagree with the file it produces.

   ## What is a copy and what is not

   Every control is theirs, in their positions. Two are drawn dead, with the
   reason on them — see EXPORT_DEAD:

     · **Active Date From / Till.** ERPNext's Employee has no Active Date, and
       this dashboard already draws the same pair dead on Employee Detail for
       the same reason. The same gap gets the same sentence in both places.
     · **The dot beside Search Employee**, which has never been seen open.

   **Filter By is live here and dead on Employee Detail**, and the difference is
   not inconsistency. Their closed control on this dialog reads "Select
   Category" — a placeholder that names what goes in it — while the one on
   Employee Detail reads nothing at all. One is knowable and the other is not.

   What follows a category pick is ours: their capture is closed, so nothing is
   known about how a value gets chosen, and a category with no value is a filter
   that filters nothing. So picking one opens a second box of that category's
   values, and the page says that the second box is this site's answer rather
   than theirs.

   ## The file is the whole record now (24 Sep 2026)

   It used to be a CSV of the eight columns the cards draw. HR asked for every
   person's full record — Identity, PF / ESIC, Salary Master, Personal, Family,
   Qualification — as an Excel or a PDF, for one company at a time. So three
   controls were added around theirs, and they are ours: **Company**, which
   starts at the top bar's pick and can be changed here without leaving the
   page; **Download As**; and **Sections**. What goes in each section and how it
   is coloured is `lib/employeeexport.js`.
   --------------------------------------------------------------------------- */

/** How a person reads on the Search Employee list.

    The code is on the label rather than only the name, so two people called
    Jagan Pillai are two rows somebody can tell apart — which is not a
    hypothetical on this site's own seed. It is also what the typed text is
    matched back against, so the two cannot drift apart. */
const nameOf = (e) => `${e.employee_name}${e.employee_number ? ` (${e.employee_number})` : ""}`;

/** The five categories, as options. Both Filter By and Group By offer exactly
    the same list — one component so a category can never be filterable and not
    groupable by accident. A category this site cannot answer is drawn disabled
    and says which of the two reasons it is; see EXPORT_CAT_WHY. */
const CatOptions = ({ cats }) => cats.map((c) => (
	<option key={c.field} value={c.field} disabled={!!c.dead} title={c.dead || undefined}>
		{c.label}{c.dead ? " — unavailable" : ""}
	</option>
));

/** One field: the label above its control, which is how their dialog draws
    them and why this is not `.repgrid`.

    A `<div>` with an explicit `<label for>` rather than a `<label>` wrapped
    round the control, because two of these hold more than one control — the
    employee search has a dropdown beside it and Filter By grows a second select
    — and a label wrapping two controls names only the first and steals the
    click for it. */
function Field({ id, label, off, children, note }) {
	return (
		<div className={"expf" + (off ? " off" : "")}>
			<label className="k" htmlFor={id}>{label}</label>
			{children}
			{note}
		</div>
	);
}

/** A `YYYY-MM-DD` box, drawn dead. Both Active Date controls are this.

    Drawn rather than left out, because the value of a screen copy is that
    somebody can hold it against theirs and trust what matches — a control
    quietly dropped is a control nobody remembers to ask about. */
function DeadDate({ id, label, why }) {
	return (
		<Field id={id} label={label} off
			note={<span className="hint" title={why}>no such field here</span>}>
			<input id={id} type="date" disabled title={why} />
		</Field>
	);
}

/** Which categories can honestly be offered, and what is wrong with the rest.

    Three of the five — Grade, Branch, Employment Type — ride on the longer
    employee read, and a site that refused it has none of them on any row. That
    is a different answer from a field nobody has filled in, and the two are
    told apart here rather than both showing an empty list: `key in row` is
    true for a field that was read and left blank, and false for one that was
    never asked for. */
function catsFor(all) {
	return EXPORT_CATS.map(([field, label]) => {
		const read = all.some((e) => field in e);
		const values = uniq(all, field);
		return {
			field,
			label,
			values,
			dead: !read ? EXPORT_CAT_WHY.unread : !values.length ? EXPORT_CAT_WHY.empty : "",
		};
	});
}

/** Everything the dialog's own criteria leave, out of everybody this browser
    holds for the company on the top bar.

    One function, read by the count on the button and by the file itself, so the
    number somebody is shown and the number of rows they get cannot disagree —
    which is the same bargain `masterRows` makes for the page behind this. */
/** The dialog's own company, not the top bar's: somebody exporting one
    company should not have to change what every other page shows to do it.
    `undefined` (state from before this control existed) follows the bar. */
const companyOf = (s) => (s.exp.company === undefined ? s.company || "" : s.exp.company);
const inCompany = (s) => {
	const co = companyOf(s);
	return co ? s.employees.filter((e) => e.company === co) : s.employees;
};

function exportRows(s) {
	const f = s.exp;
	let rows = inCompany(s);

	if (f.status) rows = rows.filter((e) => e.status === f.status);
	if (f.emp) rows = rows.filter((e) => e.name === f.emp);
	if (f.filterBy && f.filterVal) rows = rows.filter((e) => e[f.filterBy] === f.filterVal);

	if (f.groupBy) {
		/* Sorted by the group, then by name inside it — which is what a grouped
		   report means in a flat file. A blank group last rather than first: the
		   people a category has not been set on are a footnote to the report, not
		   its opening section. */
		rows = [...rows].sort((a, b) => {
			const ga = a[f.groupBy] || "";
			const gb = b[f.groupBy] || "";
			if (ga !== gb) return !ga ? 1 : !gb ? -1 : ga.localeCompare(gb);
			return String(a.employee_name || "").localeCompare(String(b.employee_name || ""));
		});
	}
	return rows;
}

export default function ExportEmployees({ onClose }) {
	const s = useApp();
	const f = s.exp;
	const setF = (part) => patch("exp", { ...part, msg: "" });

	const all = inCompany(s);
	const company = companyOf(s);
	const keys = f.sections || EMP_SECTION_KEYS;
	const format = f.format || "xlsx";
	const statuses = tally(all, "status");
	/* Active and Inactive whether or not anybody is in them, then anything else
	   the records carry — the same list the status filter on the bar behind this
	   builds, and for the same reason: a status that only appears once somebody
	   has it is a status nobody knows they can ask for. */
	const statusOpts = [
		...STATUS_ROWS.map(([v]) => [v, statuses.find((r) => r[0] === v)?.[1] || 0]),
		...statuses.filter(([v]) => !STATUS_ROWS.some(([fixed]) => fixed === v)),
	];

	const people = [...all].sort((a, b) =>
		String(a.employee_name || "").localeCompare(String(b.employee_name || "")));
	const cats = catsFor(all);
	const chosen = cats.find((c) => c.field === f.filterBy);

	const rows = exportRows(s);

	const typed = f.empText || "";
	const hit = people.find((e) => nameOf(e) === typed);
	/* Typed something, and it is nobody. Said on the control rather than
	   silently ignored — an unmatched name is a report about one person that
	   quietly came back with everybody. */
	const noHit = typed.trim() && !hit;

	const toggle = (k) => {
		const next = keys.includes(k) ? keys.filter((x) => x !== k) : [...keys, k];
		/* Kept in the sections' own order, so the workbook's tabs do not
		   depend on the order somebody clicked the boxes in. */
		setF({ sections: EMP_SECTION_KEYS.filter((x) => next.includes(x)) });
	};

	async function generate() {
		const say = (busy) => patch("exp", { busy });
		say("Reading employee records…");
		try {
			const { docs, notes } = await readForExport(rows, keys, say);
			const cat = EXPORT_CATS.find(([k]) => k === f.filterBy);
			const crit = [
				company || "All companies",
				f.status ? `Status: ${f.status}` : "",
				cat && f.filterVal ? `${cat[1]}: ${tidyDept(f.filterVal)}` : "",
				`${fmt(rows.length)} employee(s)`,
			].filter(Boolean).join("  ·  ");
			const sheets = exportSheets(docs, keys, { sub: crit, notes });
			const stem = `employees-${(company || "all-companies").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${todayIso()}`;
			const name = `${stem}.${format === "pdf" ? "pdf" : "xlsx"}`;
			say("Writing the file…");
			await (format === "pdf" ? employeesPdf : employeesXlsx)(sheets, name);
			patch("exp", { busy: "", msg: `${fmt(rows.length)} employee(s), ${keys.length} section(s), written to ${name}.` });
		} catch (e) {
			patch("exp", { busy: "", msg: `Could not write the file: ${String(e.message || e).slice(0, 200)}` });
		}
	}

	/* Whether the dialog opened holding anything. Said only when it did — a line
	   explaining the seeding on a dialog that was seeded with nothing is a line
	   about a thing that did not happen. */
	const seeded = f.status || f.filterVal;

	return (
		<Modal
			title="Export Employees Data"
			wide
			/* Generate Report beside Close, outside the scroll: with Sections under
			   the criteria this dialog is taller than a laptop screen, and the
			   first report of it was a user who never saw the button. */
			foot={
				<div className="expfoot">
					<span className="cnt">
						{fmt(rows.length)}
						{rows.length === all.length ? "" : " of " + fmt(all.length)} person(s) in the file
					</span>
					<button className="btn tpl" onClick={generate}
						disabled={!rows.length || !keys.length || Boolean(f.busy)}
						title={!rows.length
							? "Nothing to export — nobody is left after the criteria above."
							: !keys.length
								? "Pick at least one section."
								: `Write these people's records to ${format === "pdf" ? "a PDF" : "an Excel workbook"}.`}>
						<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
							strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
							<path d="M12 4v10.5M8 11l4 4 4-4M4 20h16" />
						</svg>
						{f.busy || "Generate Report"}
					</button>
				</div>
			}
			extra={
				<div className="expform">
					{seeded ? (
						<span className="hint">
							Opened holding this page&rsquo;s filters. The search box on the bar is not carried in —
							their form has no free-text criterion, and a hidden one would make the count on
							Generate Report disagree with the file.
						</span>
					) : null}

					<div className="expgrid">
						<Field id="expCompany" label="Company"
							note={<span className="hint">
								{company === (s.company || "")
									? "The company on the top bar."
									: "Only for this file — the top bar is unchanged."}
							</span>}>
							<select id="expCompany" value={company}
								onChange={(e) => setF({ company: e.target.value, emp: "", empText: "", filterVal: "" })}>
								<option value="">All companies</option>
								{s.companies.map((c) => (
									<option key={c.name} value={c.name}>{c.company_name || c.name}</option>
								))}
							</select>
						</Field>

						<Field id="expFormat" label="Download As">
							<span id="expFormat" className="expfmt" role="radiogroup" aria-label="Download as">
								{[["xlsx", "Excel", "One coloured sheet per section, plus All Details side by side"],
									["pdf", "PDF", "One coloured table per section, landscape A4"]].map(([v, label, why]) => (
									<button key={v} type="button" role="radio" aria-checked={format === v}
										className={"embtn" + (format === v ? " on" : "")} title={why}
										onClick={() => setF({ format: v })}>
										{label}
									</button>
								))}
							</span>
						</Field>

						<Field id="expStatus" label="Employee Status">
							<select id="expStatus" value={f.status}
								onChange={(e) => setF({ status: e.target.value })}>
								<option value="">All</option>
								{statusOpts.map(([v, n]) => (
									<option key={v} value={v}>{v} ({fmt(n)})</option>
								))}
							</select>
						</Field>

						{/* Their Particular Employee: a small closed dropdown, then a
						    search box. The first has never been seen open — see
						    EXPORT_DEAD.dot — and is drawn dead beside a box that works. */}
						<Field id="expEmp" label="Particular Employee"
							note={noHit
								? <span className="bad">Nobody is called that — the file would cover everybody.</span>
								: hit
									? <span className="hint">{hit.name} · {hit.designation || "no designation"}</span>
									: <span className="hint">Empty means everybody the criteria leave.</span>}>
							<span className="exppair">
								<button type="button" className="embtn" disabled title={EXPORT_DEAD.dot}
									aria-label="Search scope — not available here">
									<i className="sdot all" />
									<b className="cx">▾</b>
								</button>
								<input id="expEmp" type="text" list="expPeople" placeholder="Search Employee"
									aria-invalid={noHit ? "true" : undefined}
									value={typed}
									onChange={(e) => {
										const v = e.target.value;
										setF({ empText: v, emp: people.find((p) => nameOf(p) === v)?.name || "" });
									}} />
								<datalist id="expPeople">
									{people.map((e) => <option key={e.name} value={nameOf(e)} />)}
								</datalist>
							</span>
						</Field>

						<DeadDate id="expFrom" label="Active Date From" why={EXPORT_DEAD.active} />
						<DeadDate id="expTill" label="Active Date Till" why={EXPORT_DEAD.active} />

						<Field id="expFilter" label="Filter By"
							/* A filter the page had and this form has nowhere to put. Their
							   dialog has one Filter By; Employee Master's bar can narrow by
							   department and designation at once. Named rather than dropped
							   without a word — a file quietly wider than the list it was
							   asked for from is the failure this dialog exists to prevent. */
							note={f.carried ? (
								<span className="bad">
									The page was also filtered to <b>{f.carried}</b>, and there is one Filter By on
									this form — so that one is not carried in and the file will be wider than the
									list behind it.
								</span>
							) : null}>
							<select id="expFilter" value={f.filterBy}
								onChange={(e) => setF({ filterBy: e.target.value, filterVal: "" })}>
								<option value="">Select Category</option>
								<CatOptions cats={cats} />
							</select>
							{/* Ours, not theirs. Their capture is closed, so nothing is known
							    about how a value gets picked — and a category chosen with no
							    value narrows nothing at all. */}
							{chosen && !chosen.dead ? (
								<select className="expsub" value={f.filterVal}
									aria-label={`${chosen.label} to filter by`}
									onChange={(e) => setF({ filterVal: e.target.value })}>
									<option value="">any {chosen.label.toLowerCase()}</option>
									{chosen.values.map((v) => (
										<option key={v} value={v}>
											{chosen.field === "department" ? tidyDept(v) : v}
										</option>
									))}
								</select>
							) : null}
						</Field>

						<Field id="expGroup" label="Group By"
							note={<span className="hint">
								{f.groupBy
									? "Rows ordered by it on every sheet — which is what grouping means in a flat file."
									: "Optional. With none, the file is in the order the site sent."}
							</span>}>
							<select id="expGroup" value={f.groupBy}
								onChange={(e) => setF({ groupBy: e.target.value })}>
								<option value="">-- Select Group By --</option>
								<CatOptions cats={cats} />
							</select>
						</Field>
					</div>

					<fieldset className="expsecs">
						<legend>
							Sections
							<button type="button" className="lnk" onClick={() => setF({
								sections: keys.length === EMP_SECTION_KEYS.length ? [] : EMP_SECTION_KEYS,
							})}>
								{keys.length === EMP_SECTION_KEYS.length ? "Clear all" : "Select all"}
							</button>
						</legend>
						{EMP_SECTIONS.map((sec) => (
							<label key={sec.key} className="expsec">
								<input type="checkbox" checked={keys.includes(sec.key)} onChange={() => toggle(sec.key)} />
								{/* The section's colour in the file, so a box here and a sheet
								    tab there can be matched by eye. Data, like a chart's series
								    colour — not a theme role. */}
								<i style={{ background: "#" + sec.color }} aria-hidden="true" />
								{sec.title}
							</label>
						))}
					</fieldset>

					{f.msg ? <div className="note">{f.msg}</div> : null}
				</div>
			}
			onClose={onClose}
		/>
	);
}
