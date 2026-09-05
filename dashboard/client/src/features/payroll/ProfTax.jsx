import { Fragment } from "react";

import { getState, patch, set, useApp } from "@/store";
import { go } from "@/routes/router";
import { scoped } from "@/lib/scope";
import { cell, download } from "@/lib/csv";
import { fmt, tidyDept } from "@/lib/format";
import { Cols, Empty, Gap, Html, Note, Panel, Scroll } from "@/components/ui";
import People from "@/components/People";
import {
	PT_BY, PT_COLS, PT_FY_MONTHS, PT_OUTPUTS, PT_PROCESS, PT_REPORT_TYPES, PT_STATES,
	PT_STATUSES, PT_STATUS_SEEN, PT_TYPES, fyOf, ptYears,
} from "@/data/payroll";

import { PayLegend } from "./shared";

/* PROF. TAX STATEMENT, photographed 29 August 2026 and drawn here control for
   control: thirteen fields down one column, With Logo pinned beside Report
   Output, two checkboxes under it, and four buttons — Generate, Reset Fields,
   Close, Generate In Background. No Schedule Report, which every attendance
   report of theirs carries.

   Generate is the whole model, as on Daily Detail and Statutory Reports:
   nothing is listed until it is pressed, and touching any control puts the last
   run away rather than leaving a stale report above a changed form.

   What it generates is not their statement and does not pretend to be. No
   payroll doctype is readable here at all, so there is no rupee of Professional
   Tax on this side to state. What the form produces instead is the readiness
   check underneath the return: everybody the return would cover, and which of
   the columns such a return needs this site can actually fill. Five of ten can
   be, and the five that cannot are the finding — chief among them the State,
   which is the field that decides the slab, the due date, and which government
   the money goes to. */

const RESET = {
	process: "Salary", type: "Detail", year: "", ptype: "Monthly",
	from: "", till: "", state: "All", status: [...PT_STATUS_SEEN],
	emp: "", pick: false, by: "", gby: "", output: "Excel",
	logo: true, split: false, zero: false,
};

/* The UAE company is picked out by name because it is the only one of the four
   that none of this applies to, and a deduction applied group-wide is wrong for
   somebody the moment two companies sit under two regulators. Matched loosely:
   the site spells it "Manna Tyre UAE" and the sales data spells it "Manna Tyres
   UAE", and neither spelling should decide whether a payroll is legal. */
const isUae = (name) => /\buae\b/i.test(name || "");

/** The year on the form, resolved. Empty means the fiscal year today falls in —
    held empty in the store so a tab left open across an April moves with it. */
const ptYear = (f) => f.year || fyOf();

/** From and Till as a period, in the fiscal year's own April-to-March order.
    Either end left empty means that end of the year, which is the only thing an
    unset bound on a return can mean. */
function ptPeriod(f) {
	const y = ptYear(f);
	const a = f.from || PT_FY_MONTHS[0];
	const b = f.till || PT_FY_MONTHS[PT_FY_MONTHS.length - 1];
	return a === b ? `${a} of ${y}` : `${a} to ${b} of ${y}`;
}

/** Everybody the form's filters leave in scope, in the order the report lists
    them: sectioned by GroupBy, grouped by Filter By inside that, then by name.
    State is not a filter here and cannot be — see PT_COLS. */
function ptRows(s) {
	const f = s.pt;
	const q = (f.emp || "").toLowerCase().trim();
	/* Sorted the way the report reads: section, then the group inside it, then
	   by name. Compared field by field rather than on one joined key — a joined
	   key needs a separator that cannot occur in a department name, and every
	   candidate for one is a character somebody eventually types. Compared
	   through `ptVal` for the same reason the headings are drawn from it: two
	   departments that tidy to the same label have to sort as the same group or
	   the heading repeats. */
	const cmp = (a, b, k) => (k ? ptVal(a, k).localeCompare(ptVal(b, k)) : 0);

	return scoped(s)
		.filter((e) => {
			if (f.status.length && !f.status.includes(e.status || "")) return false;
			if (q) {
				const hay = `${e.employee_number || ""} ${e.employee_name || ""} ${e.name}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		})
		.sort((a, b) =>
			cmp(a, b, f.gby) || cmp(a, b, f.by)
			|| String(a.employee_name || "").localeCompare(String(b.employee_name || "")));
}

/** Which of the return's columns this site can fill. A column nothing can fill
    is shaded rather than dropped — the emptiness is what the page is for. */
const ptCells = () => ({
	cols: PT_COLS,
	raw: (c, e) => (c[2] ? c[2](e) : ""),
	empty: PT_COLS.filter((c) => !c[1]),
});

/** Their two grouping controls, resolved to a field each. GroupBy sections the
    report and Filter By groups inside it, which is how the attendance reports
    read the same pair. */
const ptGroups = (f) => ({
	sec: PT_BY.find((b) => b[0] && b[0] === f.gby),
	grp: PT_BY.find((b) => b[0] && b[0] === f.by),
});

const ptVal = (e, field) => (field === "department" ? tidyDept(e[field]) : e[field]) || "—";

/** The file name a return would be filed under. The period is in it because a
    PT statement is filed per period, and two of them in one folder must not be
    told apart by their timestamps. */
const ptName = (f, tag) =>
	`prof-tax-${ptYear(f)}-${(f.from || "full-year").toLowerCase()}`
	+ `${tag ? "-" + tag.toLowerCase().replace(/[^a-z0-9]+/g, "-") : ""}.csv`;

function ptExport(s) {
	const f = s.pt;
	const rows = ptRows(s);
	const { cols, raw } = ptCells();
	if (!rows.length) return set({ ptMsg: "Nothing to export — nobody is in scope." });

	const head = cols.map((c) => c[0]).join(",");
	const line = (e) => cols.map((c) => cell(raw(c, e))).join(",");

	/* Create Separate File For Each Group, done as it says. On a PT statement
	   that checkbox is not a convenience: each state files its own return to its
	   own registration, so one file per group is how the returns get posted at
	   all. It splits on GroupBy, or on Filter By when only that is set — and on
	   nothing when neither is, which it says rather than quietly writing one
	   file and calling it a split. */
	const { sec, grp } = ptGroups(f);
	const on = sec || grp;
	if (f.split && on) {
		const buckets = new Map();
		rows.forEach((e) => {
			const k = ptVal(e, on[0]);
			if (!buckets.has(k)) buckets.set(k, []);
			buckets.get(k).push(e);
		});
		buckets.forEach((list, k) =>
			download(ptName(f, k), [head].concat(list.map(line)).join("\r\n")));
		return set({
			ptMsg: `Written as <b>${buckets.size} files</b>, one per ${on[1].toLowerCase()}, `
				+ `${fmt(rows.length)} rows between them. Built in the browser from records already `
				+ "loaded — nothing was sent anywhere, and none of the five tax columns has a figure in it.",
		});
	}

	const name = ptName(f, "");
	download(name, [head].concat(rows.map(line)).join("\r\n"));
	set({
		ptMsg: `Exported ${fmt(rows.length)} row${rows.length === 1 ? "" : "s"} to <code>${name}</code>. `
			+ (f.split
				? "<b>Separate File For Each Group was ticked with no group set</b>, so there was nothing "
					+ "to split on and one file was written. "
				: "")
			+ "The five tax columns are in the file and empty, which is the honest shape of it today.",
	});
}

/** The four lists whose contents were never opened. Each offers the one value
    the capture caught and says so, rather than growing plausible neighbours
    nobody has seen. */
const SEEN = [
	["ptprocess", "Payment Process", "process", PT_PROCESS, "the only value in the capture"],
	["pttype", "Report Type", "type", PT_REPORT_TYPES,
		"Detail — whether they also summarise is unknown"],
	["ptpayroll", "Payroll Type", "ptype", PT_TYPES,
		"Monthly, and PT is not monthly in every state — which is why the control exists at all"],
	["ptstate", "State", "state", PT_STATES,
		"All. No state is held against anybody here, so this one cannot narrow anything"],
];

/** One of those four, drawn the same way wherever it sits in their column. */
function SeenPick({ c, f, stale }) {
	return (
		<>
			<label htmlFor={c[0]}>{c[1]}:</label>
			<span className="ctl">
				<select id={c[0]} className="wide" value={f[c[2]]}
					onChange={(e) => stale({ [c[2]]: e.target.value })}>
					{c[3].map((v) => <option key={v}>{v}</option>)}
				</select>
				<span className="hint">{c[4]}</span>
			</span>
		</>
	);
}

function PtForm({ s }) {
	const f = s.pt;

	/* Every control changes what Generate *would* list, so touching one clears
	   the last run rather than leaving a stale report above a changed form. */
	const stale = (part) => {
		patch("pt", part);
		set({ ptRun: false, ptMsg: "" });
	};

	const toggleStatus = (v) =>
		stale({ status: f.status.includes(v) ? f.status.filter((x) => x !== v) : f.status.concat(v) });

	function button(k) {
		if (k === "generate") {
			set({ ptRun: true, ptMsg: "" });
			if (f.output === "Excel") return ptExport(getState());
			if (f.output === "PDF") {
				return set({
					ptMsg: "<b>PDF is not built.</b> A Professional Tax statement is filed against a state "
						+ "registration, and this one has no state, no registration and no amount to put on "
						+ "it — so what a PDF would produce is a government-shaped document that is wrong, "
						+ "and somebody would file it. On screen and Excel show the same rows without "
						+ "dressing them as a return.",
				});
			}
			return;
		}
		if (k === "reset") return set({ pt: { ...RESET }, ptRun: false, ptMsg: "Fields reset." });
		if (k === "close") return go({ ptRun: false, ptMsg: "", subtab: "overview" });
		if (k === "pick") return patch("pt", { pick: !f.pick });
		if (k === "background") {
			set({
				ptMsg: "There is no queue behind this page. In ERPNext a long report is enqueued and mailed "
					+ "when it finishes; here it is computed in the browser from records already loaded, so "
					+ "Generate is instant and this button has nothing to hand off to.",
			});
		}
	}

	const ACTS = [
		["generate", "▤ Generate"], ["reset", "↺ Reset Fields"], ["close", "✕ Close"],
		["background", "⏳ Generate In Background"],
	];

	return (
		<div className="repform">
			<div className="repgrid">
				{SEEN.slice(0, 2).map((c) => <SeenPick key={c[0]} c={c} f={f} stale={stale} />)}

				<label htmlFor="ptyear">Year:</label>
				<span className="ctl">
					<select id="ptyear" className="wide" value={ptYear(f)}
						onChange={(e) => stale({ year: e.target.value })}>
						{ptYears().map((y) => <option key={y}>{y}</option>)}
					</select>
					<span className="hint">
						a fiscal year, April to March — the capture read <b>2025-26</b>
					</span>
				</span>

				{SEEN.slice(2).map((c) => <SeenPick key={c[0]} c={c} f={f} stale={stale} />)}

				<label htmlFor="ptfrom">From:</label>
				<span className="ctl">
					<select id="ptfrom" className="wide" value={f.from}
						onChange={(e) => stale({ from: e.target.value })}>
						<option value="">(start of the year)</option>
						{PT_FY_MONTHS.map((m) => <option key={m}>{m}</option>)}
					</select>
					<span className="hint">
						both ends were empty in the capture and neither list was opened; months of the chosen
						year is the reading
					</span>
				</span>

				<label htmlFor="pttill">Till:</label>
				<span className="ctl">
					<select id="pttill" className="wide" value={f.till}
						onChange={(e) => stale({ till: e.target.value })}>
						<option value="">(end of the year)</option>
						{PT_FY_MONTHS.map((m) => <option key={m}>{m}</option>)}
					</select>
				</span>

				<label>Employee Status:</label>
				<span className="ctl">
					{PT_STATUSES.map((v) => (
						<label className="chk" key={v}>
							<input type="checkbox" checked={f.status.includes(v)} onChange={() => toggleStatus(v)} />
							{v}
						</label>
					))}
					<span className="hint">
						theirs read the first three. <b>Left is the one to tick</b> — somebody who left in
						August still had PT deducted for the months before it
					</span>
				</span>

				<label htmlFor="ptemp">Employee:</label>
				<span className="ctl">
					<input id="ptemp" type="text" className="wide" placeholder="Type to search" value={f.emp}
						onChange={(e) => stale({ emp: e.target.value })} />
					<button className="dots" title="Pick from the list" onClick={() => button("pick")}>…</button>
				</span>
				{f.pick && (
					<>
						<span />
						<span className="ctl">
							{/* Capped at 400: this is a picker, and a select with every employee in it is a
							    scroll rather than a choice. Typing in the box above reaches the rest. */}
							<select size={8} className="wide" aria-label="Pick an employee" value={f.emp}
								onChange={(e) => {
									patch("pt", { emp: e.target.value, pick: false });
									set({ ptRun: false, ptMsg: "" });
								}}>
								<option value="">— clear —</option>
								{scoped(s).slice(0, 400).map((e) => (
									<option key={e.name} value={e.employee_number || e.name}>
										{`${e.employee_number || e.name}  ${e.employee_name || ""}`}
									</option>
								))}
							</select>
						</span>
					</>
				)}

				<label htmlFor="ptby">Filter By:</label>
				<span className="ctl">
					<select id="ptby" className="wide" value={f.by} onChange={(e) => stale({ by: e.target.value })}>
						{PT_BY.map((b) => <option key={b[0]} value={b[0]}>{b[1]}</option>)}
					</select>
					<span className="hint">groups inside the section</span>
				</span>

				<label htmlFor="ptgby">GroupBy:</label>
				<span className="ctl">
					<select id="ptgby" className="wide" value={f.gby}
						onChange={(e) => stale({ gby: e.target.value })}>
						<option value="">Select GroupBy</option>
						{PT_BY.filter((b) => b[0]).map((b) => <option key={b[0]} value={b[0]}>{b[1]}</option>)}
					</select>
					<span className="hint">
						sections the report — and the field a PT return wants here is the state, which is the
						one this list cannot offer
					</span>
				</span>

				<label htmlFor="ptout">Report Output:</label>
				<span className="ctl">
					<select id="ptout" value={f.output} onChange={(e) => stale({ output: e.target.value })}>
						{PT_OUTPUTS.map((v) => <option key={v}>{v}</option>)}
					</select>
					<label className="chk">
						<input type="checkbox" checked={f.logo}
							onChange={(e) => {
								patch("pt", { logo: e.target.checked });
								/* Ticked in their capture, and it only ever meant the PDF. Said out loud
								   rather than silently ignored: a control that does nothing and does not
								   say so is a control somebody trusts. */
								set({
									ptMsg: e.target.checked
										? ""
										: "With Logo is a PDF concern — the letterhead on a printed return. Excel and "
											+ "On screen are unaffected either way, so this box changes nothing until "
											+ "the PDF exists.",
								});
							}} />
						With Logo
					</label>
				</span>

				<span />
				<span className="ctl flex-col items-start gap-[.3rem]">
					<label className="chk">
						<input type="checkbox" checked={f.split}
							onChange={(e) => { patch("pt", { split: e.target.checked }); set({ ptMsg: "" }); }} />
						Create Separate File For Each Group
					</label>
					<label className="chk">
						<input type="checkbox" checked={f.zero}
							onChange={(e) => {
								patch("pt", { zero: e.target.checked });
								/* Their checkbox is the give-away that their statement drops people whose
								   tax came to nothing. Ours cannot honour it in either direction, and says
								   which rather than filtering on a figure it does not have. */
								set({
									ptMsg: e.target.checked
										? "Include Zero Tax says their statement leaves out anybody whose tax came to "
											+ "nothing — the exempt, and the months somebody was not paid. It cannot be "
											+ "honoured here either way: <b>no tax figure exists on this side at all</b>, "
											+ "and an unknown is not a zero. Everybody in scope is listed, ticked or not."
										: "",
								});
							}} />
						Include Zero Tax
					</label>
				</span>
			</div>

			<div className="repacts">
				{ACTS.map((a) => (
					<button key={a[0]} className={"btn " + (a[0] === "generate" ? "imp" : "ghost")}
						onClick={() => button(a[0])}>
						{a[1]}
					</button>
				))}
			</div>

			{s.ptMsg && (
				<div className="mt-[.8rem]">
					<Note><Html html={s.ptMsg} /></Note>
				</div>
			)}
		</div>
	);
}

function PtReport({ s }) {
	const f = s.pt;
	const rows = ptRows(s);
	const { cols, raw, empty } = ptCells();
	const { sec, grp } = ptGroups(f);

	if (!rows.length) {
		return (
			<div className="mt-[.9rem]">
				<Empty title="Nobody in scope">
					No employee is left after these filters. Reset Fields puts them back.
				</Empty>
			</div>
		);
	}

	/* Section and group headings, emitted inline as the list is walked rather
	   than by bucketing first: the sort has already put the rows in that order,
	   and a second pass could only disagree with it. A new section restarts the
	   grouping inside it, so the first row of each carries its own heading
	   rather than inheriting the last one. */
	let lastSec = null;
	let lastGrp = null;
	const body = rows.map((e) => {
		const heads = [];
		if (sec) {
			const v = ptVal(e, sec[0]);
			if (v !== lastSec) {
				lastSec = v;
				lastGrp = null;
				heads.push(
					<tr className="grp" key="sec">
						<td colSpan={cols.length}>{sec[1]}: {v}</td>
					</tr>,
				);
			}
		}
		if (grp) {
			const v = ptVal(e, grp[0]);
			if (v !== lastGrp) {
				lastGrp = v;
				heads.push(<tr className="grp" key="grp"><td colSpan={cols.length}>{v}</td></tr>);
			}
		}
		return (
			<Fragment key={e.name}>
				{heads}
				<tr>
					{cols.map((c) => (
						<td key={c[0]} className={c[1] ? undefined : "gapcol"}>{raw(c, e) || "—"}</td>
					))}
				</tr>
			</Fragment>
		);
	});

	return (
		<>
			<div className="legend mt-[.9rem]">
				<b className="font-display">Generated</b>
				<span className="cov none">{fmt(rows.length)} people</span>
				<span>
					{ptPeriod(f)} — <b>{cols.length - empty.length} of {cols.length} columns</b> can be
					filled, and not one of the {empty.length} that cannot is optional on a return.
				</span>
				<button className="btn ghost ml-auto" onClick={() => ptExport(s)}>⬇ Export CSV</button>
			</div>

			<div className="my-[.6rem]">
				<Gap>
					<b>This is not their statement.</b> A Professional Tax statement is a list of people, the
					state each is taxed in, and the rupees deducted from each in the period. This site holds
					the people. It holds no state, no registration and no deduction, so what is drawn is the
					readiness check underneath the return rather than the return.{" "}
					The {empty.length} shaded columns are empty for everybody:{" "}
					{empty.map((c, i) => (
						<Fragment key={c[0]}>
							{i ? ", " : ""}<code>{c[0]}</code>{c[3] ? ` (${c[3]})` : ""}
						</Fragment>
					))}.
				</Gap>
			</div>

			<Scroll>
				<table className="sr" style={{ minWidth: 140 * cols.length }}>
					<thead>
						<tr>
							{cols.map((c) => (
								<th key={c[0]} className={c[1] ? undefined : "gapcol"}>{c[0]}</th>
							))}
						</tr>
					</thead>
					<tbody>{body}</tbody>
				</table>
			</Scroll>

		</>
	);
}

export default function ProfTax() {
	const s = useApp();

	return (
		<>
			<PayLegend what="Prof. Tax Statement">
				Professional Tax — a state levy, deducted monthly and remitted to whoever the employer is
				registered with. Frappe HR has the mechanism and no master.
			</PayLegend>

			<div className="mt-[.8rem]">
				<PtForm s={s} />
			</div>

			{s.ptRun ? <PtReport s={s} /> : (
				<div className="mt-[.9rem]">
					{/* Who the return would cover does not depend on the period, so the screen
					    shows them rather than a sentence about why it will not. Generate adds
					    the return's own columns and shades the five this site cannot fill. */}
					<People people={ptRows(s)}
						note="Everybody this statement would cover, at the criteria above. Generate adds the columns a Professional Tax return needs and shows which of them this site can fill." />
				</div>
			)}

			<Cols>
				<Panel title="Who this applies to" cov="live" ico="🗺">
					{s.companies.length ? (
						<>
							<div className="rows">
								{s.companies.map((c) => (
									<div className="row" key={c.name}>
										<span>{c.name}</span>
										<span className="val">
											<span className={"cov " + (isUae(c.name) ? "skip" : "part")}>
												{isUae(c.name) ? "no PT, no PF, no ESI" : "PT applies"}
											</span>
										</span>
									</div>
								))}
							</div>
						</>
					) : (
						<Empty title="No companies read yet">
							The list comes off the site, and it has not answered.
						</Empty>
					)}
				</Panel>

				<Panel title="What their form asks and this site cannot answer" cov="none" ico="🧾">
					<div className="rows">
						<div className="row">
							<span>State</span>
							<span className="val muted">no field on <code>Employee</code></span>
						</div>
						<div className="row">
							<span>PT registration / enrolment</span>
							<span className="val muted">held nowhere on this site</span>
						</div>
						<div className="row">
							<span>Slab</span>
							<span className="val muted">no master — the mechanism exists, the table does not</span>
						</div>
						<div className="row">
							<span>Amount deducted</span>
							<span className="val muted">payroll not started</span>
						</div>
					</div>
				</Panel>
			</Cols>
		</>
	);
}
