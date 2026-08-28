import { useEffect, useState } from "react";
import { api, listAll } from "@/api/client";
import { Cols, Empty, Gap, Note, NoteBelow, Panel, Scroll, Tile, Tiles } from "@/components/ui";
import {
	DATEISH, DATE_FIELD, DETAIL_GROUPS, ED_BASE, ED_SECTIONS, ED_STATUSES, ED_WHY, FIELD_LABEL,
} from "@/data/employees";
import { download, toCsv } from "@/lib/csv";
import { ageOn, dmy, fmt, nowStamp, todayIso } from "@/lib/format";
import { scoped } from "@/lib/scope";
import { getState, set, useApp } from "@/state/store";
import { openEmployee } from "./EmployeeMaster";

/* Factor HR's Employee Detail is a **report screen**, not a record view
   (screenshot 28 Aug 2026): a criteria form, a grid of tick boxes naming what
   the export should carry, and six buttons. §9 of FACTOHR_SCREENS guessed it
   was a record page and that was wrong — this is the form, section for section,
   with the record kept underneath because a report of one person is a record
   and somebody will want it. */

const prettyField = (f) =>
	FIELD_LABEL[f] || f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function edValue(doc, k) {
	const v = doc[k];
	if (v == null || v === "") return null;
	/* A Link field holds the record's id, which for Employee is HR-EMP-00042 and
	   means nothing to anybody. Resolve it to the name that is on the screen. */
	if (k === "reports_to") return getState().byName[v]?.employee_name || String(v);
	if (DATEISH.test(k)) return dmy(v);
	return String(v);
}

/* Ask for a field a site does not have and the whole call fails, taking every
   other field with it. So each ticked section is probed for one row first, and
   a section the site cannot answer is dropped by name rather than turning the
   report into an error message. */
async function edProbe(fields) {
	try {
		await api("/api/resource/Employee", { fields: JSON.stringify(fields), limit_page_length: 1 });
		return true;
	} catch {
		return false;
	}
}

/** A control this site cannot answer, drawn where Factor HR draws it and
    disabled, with the short reason beside it and the long one on hover. A row
    left out entirely reads as an oversight when the two are compared. */
function Dead({ label, hint, why }) {
	return (
		<>
			<label className="off">{label}:</label>
			<span className="ctl">
				<input disabled title={why} />
				<span className="hint" title={why}>{hint}</span>
			</span>
		</>
	);
}

function Row({ label, htmlFor, children }) {
	return (
		<>
			<label htmlFor={htmlFor}>{label}:</label>
			<span className="ctl">{children}</span>
		</>
	);
}

/** The record for one person, in full. The blanks are the finding rather than a
    rendering fault: the migration loaded the master and not the paperwork. */
function EdBody({ doc }) {
	if (!doc) return <Empty title="reading the record…" />;
	if (doc.__err) {
		return (
			<div className="gap">
				<b>Could not read the record.</b> {String(doc.__err)}
			</div>
		);
	}
	const all = DETAIL_GROUPS.reduce((a, g) => a.concat(g[2]), []);
	const blank = all.filter((f) => edValue(doc, f[0]) == null).length;

	return (
		<>
			<Tiles>
				<Tile k="Code" n={doc.employee_number || "—"} s={doc.company || ""} />
				<Tile k="Status" n={doc.status || "—"} cls={doc.status === "Active" ? "good" : "warn"} />
				<Tile k="Filled in" n={fmt(all.length - blank)} s={`of ${all.length} fields`} />
				<Tile k="Blank" n={fmt(blank)} cls={blank ? "warn" : "good"}
					s={blank ? "nothing behind them" : "nothing missing"} />
			</Tiles>
			<Cols>
				{DETAIL_GROUPS.map((g) => (
					<Panel key={g[0]} title={g[0]} cov="live" ico={g[1]}>
						<div className="rows">
							{g[2].map((f) => {
								const v = edValue(doc, f[0]);
								return (
									<div className="row" key={f[0]}>
										<span>{f[1]}</span>
										<span className={"val" + (v == null ? " muted" : "")}>{v == null ? "not set" : v}</span>
									</div>
								);
							})}
						</div>
					</Panel>
				))}
				<Panel title="What Factor HR shows here and this does not" cov="part" ico="📄">
					<Gap>
						Photograph, family and nominee details, education and previous employment, the uploaded
						documents, and the audit of who changed what.
					</Gap>
					<NoteBelow>
						Every one of them is already a field or a child table on the ERPNext{" "}
						<code>Employee</code> record. They are blank because the migration loaded the master and
						not the paperwork behind it — <b>nothing here needs building, it needs filling</b>.
					</NoteBelow>
				</Panel>
			</Cols>
		</>
	);
}

export default function EmployeeDetail() {
	const s = useApp();
	const [report, setReport] = useState(null);

	const people = scoped(s).slice()
		.sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));

	/* "" is a real choice here — Factor HR's Particular Employee means everybody
	   — so only a name that no longer exists gets cleared. */
	const picked = s.empSel && people.some((p) => p.name === s.empSel) ? s.empSel : "";
	// Null until the form is first drawn, and null means all four are ticked.
	const statuses = s.edStatus ?? ED_STATUSES;

	const mgrs = [...new Set(scoped(s).map((e) => e.reports_to).filter(Boolean))]
		.map((n) => [n, s.byName[n]?.employee_name || n])
		.sort((a, b) => a[1].localeCompare(b[1]));

	/* Cached rather than re-read: the body re-renders on every keystroke in the
	   search box, and a fetch per keypress would be one per keypress. */
	useEffect(() => {
		if (!picked || getState().empDoc[picked]) return;
		let live = true;
		api("/api/resource/Employee/" + encodeURIComponent(picked))
			.then((r) => r.data)
			// The failure is kept on the record rather than thrown, so the page says
			// which person it could not read instead of blanking.
			.catch((err) => ({ name: picked, __err: String(err.message || err) }))
			.then((doc) => {
				if (live && doc) set({ empDoc: { ...getState().empDoc, [picked]: doc } });
			});
		return () => { live = false; };
	}, [picked]);

	const toggleStatus = (v) => {
		const next = statuses.includes(v) ? statuses.filter((x) => x !== v) : statuses.concat([v]);
		set({ edStatus: next });
	};

	const toggleSection = (k) =>
		set({
			edSections: s.edSections.includes(k)
				? s.edSections.filter((x) => x !== k)
				: s.edSections.concat([k]),
		});

	async function generate() {
		set({ edBusy: true, edMsg: "", edBad: false });
		try {
			const want = ED_SECTIONS.filter((x) => !x[3] && s.edSections.includes(x[0]));
			const kept = [];
			const dropped = [];
			for (const x of want) {
				if (await edProbe(ED_BASE.concat(x[2]))) kept.push(x);
				else dropped.push(x[1]);
			}
			const cols = [...new Set(ED_BASE.concat(...kept.map((x) => x[2])))];
			/* The age filter is arithmetic on a date, not a field, so the date has
			   to come back whether or not Personal Detail was ticked. */
			const wantAge = s.edAgeA !== "" || s.edAgeB !== "";
			if (wantAge && !cols.includes("date_of_birth")) cols.push("date_of_birth");

			const filters = [];
			if (statuses.length && statuses.length < ED_STATUSES.length) filters.push(["status", "in", statuses]);
			if (picked) filters.push(["name", "=", picked]);
			if (s.edMgr) filters.push(["reports_to", "=", s.edMgr]);
			if (s.edJoinA) filters.push(["date_of_joining", ">=", s.edJoinA]);
			if (s.edJoinB) filters.push(["date_of_joining", "<=", s.edJoinB]);
			if (s.edSepA) filters.push(["relieving_date", ">=", s.edSepA]);
			if (s.edSepB) filters.push(["relieving_date", "<=", s.edSepB]);
			if (s.edDobA) filters.push(["date_of_birth", ">=", s.edDobA]);
			if (s.edDobB) filters.push(["date_of_birth", "<=", s.edDobB]);

			let rows = await listAll("Employee", cols, filters.length ? filters : undefined);
			let msg = "";

			if (wantAge) {
				const on = s.edAgeOn || todayIso();
				const lo = s.edAgeA === "" ? -Infinity : +s.edAgeA;
				const hi = s.edAgeB === "" ? Infinity : +s.edAgeB;
				/* No date of birth is not "outside the range" — it is unknown, and
				   dropping those rows silently would understate the report. */
				const blind = rows.filter((e) => !e.date_of_birth).length;
				rows = rows.filter((e) => {
					const a = ageOn(e.date_of_birth, on);
					return a != null && a >= lo && a <= hi;
				});
				if (blind) {
					msg = `${fmt(blind)} record${blind === 1 ? " has" : "s have"} no date of birth and could not `
						+ "be aged, so they are not in this report. That is a gap in the master, not in the filter.";
				}
			}

			setReport({
				rows, cols, when: nowStamp(), dropped: dropped.join(", "),
				sections: kept.length ? kept.map((x) => x[1]).join(", ") : "the identifying fields only",
			});
			if (dropped.length) {
				set({
					edBad: true,
					edMsg: `This site's Employee has no field behind ${dropped.join(", ")}. `
						+ "Those columns were left out; everything else was generated.",
				});
			} else {
				set({ edMsg: msg, edBad: false });
			}
		} catch (err) {
			set({ edBad: true, edMsg: "The site refused the report: " + String(err.message || err) });
		}
		set({ edBusy: false });
	}

	function csv() {
		if (!report || !report.rows.length) return;
		download(
			"employee-detail-" + todayIso() + ".csv",
			toCsv(report.cols, report.rows.map((row) => report.cols.map((c) => String(row[c] ?? "")))),
		);
	}

	function reset() {
		set({
			edStatus: ED_STATUSES.slice(), edSections: ["category"],
			edJoinA: "", edJoinB: "", edSepA: "", edSepB: "", edDobA: "", edDobB: "",
			edAgeA: "", edAgeB: "", edAgeOn: todayIso(), edMgr: "", empSel: "",
			edMsg: "", edBad: false,
		});
		setReport(null);
	}

	const dateIn = (v, on, id) => (
		<input type="date" id={id} value={v} onChange={(e) => on(e.target.value)} />
	);
	const span = (a, setA, b, setB, id) => (
		<>
			{dateIn(a, setA, id)}
			<label className="text-ink-2">Date Till:</label>
			{dateIn(b, setB)}
		</>
	);

	return (
		<>
			<div className="legend">
				<b className="font-display">Employee Detail</b>
				<span className="cov part">Partial</span>
				<span>
					In Factor HR this is a <b>report screen</b>, not a record view. Its criteria are below; the
					record for one person is underneath them.
				</span>
			</div>

			<div className="repbar">
				<button
					className="btn ghost"
					disabled
					title="Not built. Importing employees is a write and this dashboard only reads — but this button is how the 161 records on the site would have got there, and how the rest would."
				>
					⇧ Import Employees from Excel
				</button>
			</div>

			<div className="repform">
				<div className="repgrid">
					<label>Employee Status:</label>
					<span className="ctl">
						{ED_STATUSES.map((v) => (
							<label className="chk" key={v}>
								<input type="checkbox" checked={statuses.includes(v)} onChange={() => toggleStatus(v)} />
								<i className={"sdot " + (v === "Active" ? "on" : "off")} />
								{v}
							</label>
						))}
					</span>

					<Row label="Particular Employee" htmlFor="edPick">
						<select id="edPick" className="wide" value={picked}
							onChange={(e) => set({ empSel: e.target.value })}>
							<option value="">everybody</option>
							{people.map((p) => (
								<option key={p.name} value={p.name}>
									{p.employee_name} ({p.employee_number || "-"})
								</option>
							))}
						</select>
					</Row>

					<Dead label="Payroll Type" hint="payroll not started"
						why="Factor HR splits Monthly from other payroll types. Nothing here has a payroll type because payroll has not been started — see Salary Master." />
					<Dead label="Filter By" hint="never seen open"
						why="The dropdown has never been screenshotted open. An invented filter is worse than a missing one." />

					<Row label="Joining Date From" htmlFor="edJoinA">
						{span(s.edJoinA, (v) => set({ edJoinA: v }), s.edJoinB, (v) => set({ edJoinB: v }), "edJoinA")}
					</Row>

					<Dead label="Active Date From" hint="no such field here"
						why="ERPNext has no Active Date on Employee. What Factor HR dates here — reinstatement, confirmation, something else — is unknown." />

					<Row label="Separated Date From" htmlFor="edSepA">
						{span(s.edSepA, (v) => set({ edSepA: v }), s.edSepB, (v) => set({ edSepB: v }), "edSepA")}
						<span className="hint">relieving date</span>
					</Row>

					<Row label="Birthday Date From" htmlFor="edDobA">
						{span(s.edDobA, (v) => set({ edDobA: v }), s.edDobB, (v) => set({ edDobB: v }), "edDobA")}
					</Row>

					<Dead label="Retirement Date From" hint="needs a retirement age"
						why="Not a field but a calculation: date of birth plus a retirement age, and nobody has stated the age." />

					<Row label="Reporting Manager" htmlFor="edMgr">
						<select id="edMgr" className="wide" value={s.edMgr} onChange={(e) => set({ edMgr: e.target.value })}>
							<option value="">anybody</option>
							{mgrs.map((m) => (
								<option key={m[0]} value={m[0]}>{m[1]}</option>
							))}
						</select>
						<span className="hint">
							{mgrs.length === 1 ? "1 person manages" : `${fmt(mgrs.length)} people manage`} somebody
						</span>
					</Row>

					<Dead label="Approving Manager" hint="leave_approver holds a User"
						why="The nearest ERPNext field is leave_approver, which holds a User rather than an Employee — close enough to mislead, so it is not wired up." />
					<Dead label="Employee Data Option" hint="never seen open"
						why="Never screenshotted open, and it appears to govern the As On Date beside it." />
				</div>

				<fieldset className="repset" style={{ maxWidth: 520 }}>
					<legend>Specify Employee Age Range Filter</legend>
					<div className="repgrid">
						<label htmlFor="edAgeA">Age From:</label>
						<span className="ctl">
							<input type="number" id="edAgeA" min={14} max={99} style={{ width: "5.5rem" }}
								value={s.edAgeA} onChange={(e) => set({ edAgeA: e.target.value })} />
							<label htmlFor="edAgeB" className="text-ink-2">Age Till:</label>
							<input type="number" id="edAgeB" min={14} max={99} style={{ width: "5.5rem" }}
								value={s.edAgeB} onChange={(e) => set({ edAgeB: e.target.value })} />
						</span>
						<Row label="Age As On Date" htmlFor="edAgeOn">
							{dateIn(s.edAgeOn, (v) => set({ edAgeOn: v }), "edAgeOn")}
							<span className="hint">whole years on that day</span>
						</Row>
					</div>
				</fieldset>

				{/* Each tick box names the fields it adds to the export. Where the
				    answer lives in a child table rather than on the record it cannot
				    come from a list call at all — one document read per person, 161
				    requests to build one report — so the box is drawn, disabled, and
				    says why. */}
				<div className="repchecks">
					{ED_SECTIONS.map((x) => {
						const off = !!x[3];
						return (
							<label className={"chk" + (off ? " off" : "")} key={x[0]} title={off ? ED_WHY[x[3]] : undefined}>
								<input type="checkbox" disabled={off} checked={s.edSections.includes(x[0])}
									onChange={() => toggleSection(x[0])} />
								{x[1]}
							</label>
						);
					})}
				</div>

				<div className="repacts">
					<button className="btn imp" disabled={s.edBusy} onClick={() => void generate()}>
						▤ {s.edBusy ? "Reading the site…" : "Generate Report"}
					</button>
					<button className="btn ghost" disabled
						title="Needs the File doctype, which is not on the proxy's allowlist. A token that can read every attachment on the site is not something to hand to a page on localhost.">
						⇩ Download Employee Picture / Documents
					</button>
					<button className="btn ghost" onClick={reset}>↺ Reset Fields</button>
					{report && (
						<button className="btn ghost" onClick={() => { setReport(null); set({ edMsg: "", edBad: false }); }}>
							✕ Close
						</button>
					)}
					<button className="btn ghost" disabled
						title="Scheduling needs something running when nobody is watching. This page is a browser tab; the site's own scheduler is where this belongs.">
						⏰ Schedule Report
					</button>
					<button className="btn ghost" disabled
						title="Same reason as Schedule Report. Everything here runs in front of you, which is also why it is capped.">
						⌛ Generate In Background
					</button>
					{report && <button className="btn tpl" onClick={csv}>⇩ Download CSV</button>}
				</div>

				{s.edMsg && (
					<div className="mt-[.8rem]">{s.edBad ? <Gap>{s.edMsg}</Gap> : <Note>{s.edMsg}</Note>}</div>
				)}
			</div>

			{report ? (
				<>
					<div className="legend">
						<b className="font-display">{fmt(report.rows.length)} rows</b>
						<span className="cov live">Generated {report.when}</span>
						<span>
							{report.cols.length} columns, from {report.sections}.{" "}
							{report.dropped ? <><b>Dropped:</b> {report.dropped}. </> : null}
							{report.rows.length > 200
								? `The first 200 are on screen; the CSV holds all ${fmt(report.rows.length)}.`
								: ""}
						</span>
					</div>
					{report.rows.length ? (
						<Scroll>
							<table>
								<thead>
									<tr>
										{report.cols.map((c) => (
											<th key={c}>{prettyField(c)}</th>
										))}
									</tr>
								</thead>
								<tbody>
									{report.rows.slice(0, 200).map((row) => (
										<tr key={row.name} data-emp={row.name} title="Open this record"
											onClick={() => openEmployee(row.name)}>
											{report.cols.map((c) => {
												const v = row[c];
												if (v == null || v === "") return <td className="muted" key={c}>—</td>;
												const isDate = DATE_FIELD.test(c);
												return (
													<td key={c} className={isDate ? "mono" : undefined}>
														{isDate ? dmy(v) : String(v)}
													</td>
												);
											})}
										</tr>
									))}
								</tbody>
							</table>
						</Scroll>
					) : (
						<Empty title="Nobody matched">
							The criteria are stricter than the data. Reset the fields and narrow one at a time.
						</Empty>
					)}
				</>
			) : (
				<>
					<div className="legend">
						<b className="font-display">One record in full</b>
						<span className="cov live">Live</span>
						<span>The whole document for whoever is picked above — or click a card on Employee Master.</span>
					</div>
					{picked ? (
						<EdBody doc={s.empDoc[picked]} />
					) : (
						<Empty title="Nobody picked">
							Choose a person above, or click a card on Employee Master. A report of one person is a
							record, and this is it.
						</Empty>
					)}
				</>
			)}
		</>
	);
}
