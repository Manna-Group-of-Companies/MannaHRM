import { useEffect, useState } from "react";

import { patch, set, useApp } from "@/store";
import { scoped } from "@/lib/scope";
import { dmy, fmt, todayIso } from "@/lib/format";
import { sheetsPdf, sheetsXlsx } from "@/lib/export";
import { HEAD_FILL, ZEBRA_FILL } from "@/lib/fills";
import { ledgerUpTo, lvbFill, lvbKey } from "@/lib/leavebalance";
import { LVB_COLS } from "@/data/leave";
import EmpPick from "@/components/EmpPick";
import { Empty, Scroll } from "@/components/ui";
import { loadLeaveBalances } from "@/api/load";

/* Leave Balance Report — who was given how much leave, how much of it they
   took, and what is left, as at one date.

   Rebuilt on 24 September 2026, asked for by IT: Factor HR's toolbar (the
   status dot, Filter By, the Generate menu, the two criteria tabs) came off,
   and the form is the five things somebody asks this report — which employee,
   which status, which leave type, as at when, and in which file. The table
   answers as the form changes; there is nothing to Generate, because
   everything under it was read once when the page opened.

   **One date, not a range.** A balance is a position on a day, not a total
   over a period, so every figure is "as at" the As On Date: an allocation made
   after it is not counted, and leave still running on it counts only up to it.

   Assigned, Carried Fwd, Expired and Balance come off the site's leave ledger
   (lib/leavebalance.js); Availed off approved applications. See LVB_COLS. */

/** Days of one application that fall on or before the As On Date.

    Whole applications are taken at their own `total_leave_days`, which is the
    site's number and already accounts for the half-day flag — recomputing it
    here would be a second opinion about somebody's leave, and the site's is the
    one payroll would use.

    An application still running on the As On Date is clipped instead, because
    leave not yet taken is not yet availed. The clip counts whole days and then
    gives back the half if the half-day falls inside the window. */
function availedUpTo(row, ason) {
	const from = String(row.from_date || "").slice(0, 10);
	const to = String(row.to_date || from).slice(0, 10);
	if (!from || from > ason) return 0;
	if (to <= ason) return Number(row.total_leave_days) || 0;

	const days = Math.round((Date.parse(ason) - Date.parse(from)) / 86400000) + 1;
	const half = String(row.half_day_date || "").slice(0, 10);
	const halved = row.half_day && half && half >= from && half <= ason ? 0.5 : 0;
	return Math.max(0, days - halved);
}

/** Everybody the status filter allows, in the company picked on the top bar,
    by name — the people the employee box offers and the report runs over. */
const pool = (s) => {
	const f = s.lvb;
	return scoped(s)
		.filter((e) => !f.status || e.status === f.status)
		.sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));
};

/** One row per person per leave type they were allocated or have taken any
    of. A type somebody was never given and never took is not a row: listing
    every type against every person would be 160 × 6 rows of dashes claiming to
    be a report.

    `alloc` is null for a type with nothing on the ledger, which the columns
    draw as `—` rather than zero. */
export function lvbRows(s) {
	const f = s.lvb;
	const ason = f.ason || todayIso();

	let people = pool(s);
	if (f.emp) people = people.filter((e) => e.name === f.emp);
	const inScope = new Set(people.map((e) => e.name));

	/* Keyed on employee and type joined with a NUL (lvbKey), which is the one
	   character neither an employee id nor a leave type holds — every type on
	   this site has a space in its name, so a space would split "Casual Leave". */
	const tally = new Map();
	for (const [k, a] of ledgerUpTo(s.lvbLedger, ason)) {
		const [employee, type] = k.split("\0");
		if (!inScope.has(employee)) continue;
		if (f.ltype && type !== f.ltype) continue;
		tally.set(k, { emp: s.byName[employee], type, availed: 0, alloc: a });
	}

	for (const r of s.lvbRows) {
		if (!inScope.has(r.employee)) continue;
		if (f.ltype && r.leave_type !== f.ltype) continue;
		const days = availedUpTo(r, ason);
		if (!days) continue;
		const k = lvbKey(r.employee, r.leave_type);
		const cur = tally.get(k);
		if (cur) cur.availed += days;
		else tally.set(k, { emp: s.byName[r.employee], type: r.leave_type || "—", availed: days, alloc: null });
	}

	return [...tally.values()]
		.filter((r) => r.emp)
		.sort((a, b) =>
			(a.emp.employee_name || "").localeCompare(b.emp.employee_name || "") || a.type.localeCompare(b.type));
}

/** What the file says under the table. Which half is missing depends on what
    the site answered, and the note says which rather than one thing always. */
const lvbNote = (s) => (s.lvbLedger
	? "Assigned and Carried Fwd are the allocations on the site's leave ledger up to the As On Date; "
		+ "Expired is what lapsed. Availed is approved leave, clipped at the As On Date. "
		+ "Balance = Assigned + Carried Fwd − Expired − Availed, and is blank for a type never allocated."
	: "Assigned, Carried Fwd, Expired and Balance are blank because the site's leave ledger could not be "
		+ "read with this login. Availed is approved leave, clipped at the As On Date.");

/** The one sheet both files are built from, so the Excel and the PDF cannot
    disagree about a figure or a colour. */
function lvbSheet(s, rows) {
	const f = s.lvb;
	const who = f.emp ? s.byName[f.emp]?.employee_name || f.emp : "";
	return {
		title: "Leave Balance Report",
		sub: [s.company || "All companies", `as on ${dmy(f.ason || todayIso())}`,
			f.status ? `${f.status} employees` : "every employee status", f.ltype || "all leave types", who]
			.filter(Boolean).join(" · "),
		head: LVB_COLS.map((c) => c[0]),
		rows: rows.map((r) => LVB_COLS.map((c) => { const v = c[1](r); return v == null ? "" : v; })),
		note: lvbNote(s),
		headFill: HEAD_FILL,
		zebra: ZEBRA_FILL,
		cellFill: lvbFill,
	};
}

function Toolbar({ s, rows }) {
	const f = s.lvb;
	const ason = f.ason || todayIso();
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState("");

	const download = async () => {
		const pdf = f.fmt === "PDF";
		const name = `leave-balance-${ason}.${pdf ? "pdf" : "xlsx"}`;
		setBusy(true);
		setMsg("");
		try {
			await (pdf ? sheetsPdf : sheetsXlsx)([lvbSheet(s, rows)], name);
			setMsg(`Downloaded ${fmt(rows.length)} row${rows.length === 1 ? "" : "s"} to ${name}.`);
		} catch (e) {
			setMsg(`Could not build ${name}: ${e.message || e}`);
		} finally {
			setBusy(false);
		}
	};

	/* The status box narrows who the employee box offers, so a status that no
	   longer includes the picked person clears the pick — otherwise the box
	   names somebody the report has silently stopped listing. */
	const setStatus = (status) => {
		const e = f.emp && s.byName[f.emp];
		patch("lvb", { status, emp: e && status && e.status !== status ? "" : f.emp });
	};

	return (
		<div className="repform mt-[.7rem]">
			<div className="mbbar">
				<label className="mbf">
					<span>Employee</span>
					<EmpPick people={pool(s)} value={f.emp} all="every employee" ariaLabel="Search employee"
						onChange={(v) => patch("lvb", { emp: v })} />
				</label>
				<label className="mbf">
					<span>Employee Status</span>
					<select value={f.status} aria-label="Employee status" onChange={(e) => setStatus(e.target.value)}>
						{["Active", "Inactive", "Suspended", "Left"].map((v) => <option key={v}>{v}</option>)}
						<option value="">All</option>
					</select>
				</label>
				<label className="mbf">
					<span>Leave Type</span>
					<select value={f.ltype} aria-label="Leave type" onChange={(e) => patch("lvb", { ltype: e.target.value })}>
						<option value="">All leave types</option>
						{s.leaveTypes.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
					</select>
				</label>
				<label className="mbf">
					<span>As On Date</span>
					<input type="date" value={ason} aria-label="As on date"
						onChange={(e) => patch("lvb", { ason: e.target.value })} />
				</label>
				<label className="mbf">
					<span>Download as</span>
					<span className="flex gap-[.3rem] items-center">
						<select value={f.fmt} aria-label="File type" onChange={(e) => patch("lvb", { fmt: e.target.value })}>
							<option value="Excel">Excel</option>
							<option value="PDF">PDF</option>
						</select>
						<button type="button" className="btn imp" disabled={busy || !rows.length} onClick={() => void download()}>
							{busy ? "Building…" : "Download"}
						</button>
						<button type="button" className="btn ghost" title="Read the leave from the site again"
							aria-label="Reload from the site"
							onClick={() => { set({ lvbState: "" }); void loadLeaveBalances(); }}>↻</button>
					</span>
				</label>
			</div>
			{msg && <div className="mt-[.4rem]"><span className="muted" role="status">{msg}</span></div>}
		</div>
	);
}

function Table({ s, rows }) {
	const ason = s.lvb.ason || todayIso();

	if (s.lvbState === "error") {
		return (
			<Empty title="The leave could not be read">
				{/* The site's own hint, which is a sentence fragment rather than a
				    sentence — so it is punctuated here rather than run into the next. */}
				<span className="block">{s.lvbErr || "The site refused the request"}.</span>
				No figure is shown at all rather than one that might be wrong.
			</Empty>
		);
	}
	if (s.lvbState !== "done") {
		return <Empty title="Reading leave from the site…">Allocations and approved applications, read once.</Empty>;
	}
	if (!rows.length) {
		return (
			<Empty title="Nothing assigned or availed">
				No leave was assigned or approved on or before {dmy(ason)} for anybody the filters allow.
				{s.lvbRows.length || s.lvbLedger?.length ? "" : " The site holds no approved Leave Application and no allocation at all."}
			</Empty>
		);
	}

	return (
		<>
			<div className="ddacount">
				{fmt(rows.length)} row{rows.length === 1 ? "" : "s"} · as at {dmy(ason)}
				{s.lvbLedger ? "" : " · the leave ledger could not be read, so only Availed is filled"}
			</div>
			<Scroll>
				<table style={{ minWidth: 90 * LVB_COLS.length }}>
					<thead>
						<tr>{LVB_COLS.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={lvbKey(r.emp.name, r.type)}>
								{LVB_COLS.map((c) => (
									<td key={c[0]} className={c[2] || undefined}>{String(c[1](r))}</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>
		</>
	);
}

export default function LeaveBalances() {
	const s = useApp();
	const rows = lvbRows(s);

	/* One request, the first time somebody opens this page. loadLeaveBalances()
	   guards itself against the re-render it causes. */
	useEffect(() => { void loadLeaveBalances(); }, []);

	return (
		<>
			<div className="fhtitle">Leave Balance Report</div>
			<Toolbar s={s} rows={rows} />
			<Table s={s} rows={rows} />
		</>
	);
}
