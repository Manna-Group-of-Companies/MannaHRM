import { useEffect, useState } from "react";

import { patch, set, useApp } from "@/store";
import { scoped } from "@/lib/scope";
import { MONTHS, fmt, thisMonth } from "@/lib/format";
import { sheetsPdf, sheetsXlsx } from "@/lib/export";
import { HEAD_FILL, ZEBRA_FILL } from "@/lib/fills";
import { lvbFill, lvbKey, monthLeave } from "@/lib/leavebalance";
import { LVM_COLS } from "@/data/leave";
import EmpPick from "@/components/EmpPick";
import { Empty, Scroll } from "@/components/ui";
import { loadLeaveBalances } from "@/api/load";

/* Leave Monthly Availed — each person's leave for one month: what they
   brought into it, what it earned them, what they took, and what is available
   at its end.

   Asked for on 26 September 2026 ("show the monthly available leave"). Until
   then this address was a count of approved days per month for the whole
   group, which said how much leave was taken and nothing about how much
   anybody had left — the question somebody opening a monthly leave report is
   actually asking, now that Casual Leave arrives one a month.

   The Leave Balance Report's form with a Month where its As On Date was, and
   the same read behind it: approved applications and the site's leave ledger,
   asked for once whichever of the two pages opens first. The arithmetic is
   monthLeave in lib/leavebalance.js, and it is two of that report's balances
   subtracted, so the two pages cannot disagree about anybody.

   **Only the employees picked are listed**, and nobody until one is (asked for
   the same day). The box adds people one at a time, each drawn as a chip that
   takes them off again; picking nobody is not "everybody" here. */

/** Everybody the status filter allows, in the company picked on the top bar,
    by name — the people the employee box offers and the report runs over. */
const pool = (s) => {
	const f = s.lvm;
	return scoped(s)
		.filter((e) => !f.status || e.status === f.status)
		.sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));
};

const monthText = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1] || ""} ${ym.slice(0, 4)}`;

/** The people picked that the status filter and the company still allow, in
    the order they were picked. */
const picked = (s) => {
	const allowed = new Set(pool(s).map((e) => e.name));
	return (s.lvm.emps || []).filter((n) => allowed.has(n) && s.byName[n]).map((n) => s.byName[n]);
};

/** One row per picked person per leave type they had a balance in, or took
    any of, that month — by name, then type. Nobody picked is no rows. */
export function lvmRows(s) {
	const f = s.lvm;
	const ym = f.month || thisMonth();
	const inScope = new Set(picked(s).map((e) => e.name));
	if (!inScope.size) return [];

	const rows = [];
	for (const [k, m] of monthLeave(s.lvbLedger, s.lvbRows, ym)) {
		const [employee, type] = k.split("\0");
		if (!inScope.has(employee) || !s.byName[employee]) continue;
		if (f.ltype && type !== f.ltype) continue;
		rows.push({ emp: s.byName[employee], type, ...m });
	}
	return rows.sort((a, b) =>
		(a.emp.employee_name || "").localeCompare(b.emp.employee_name || "") || a.type.localeCompare(b.type));
}

/** What the file says under the table, depending on what the site answered. */
const lvmNote = (s) => (s.lvbLedger
	? "Brought Fwd is what was left at the end of the month before, plus any carry-forward into this one. "
		+ "Earned is what the month's allocation added; Availed is approved leave on this month's days, a "
		+ "leave crossing into the next month counted only up to the month's end; Lapsed is what expired. "
		+ "Available = Brought Fwd + Earned − Availed − Lapsed, and is blank for a type never allocated."
	: "Brought Fwd, Earned, Lapsed and Available are blank because the site's leave ledger could not be "
		+ "read with this login. Availed is approved leave on this month's days.");

/** The one sheet both files are built from, so the Excel and the PDF cannot
    disagree about a figure or a colour. */
function lvmSheet(s, rows) {
	const f = s.lvm;
	const people = picked(s);
	const who = people.length > 3 ? `${people.length} employees`
		: people.map((e) => e.employee_name || e.name).join(", ");
	return {
		title: "Leave Monthly Availed",
		sub: [s.company || "All companies", monthText(f.month || thisMonth()),
			f.status ? `${f.status} employees` : "every employee status", f.ltype || "all leave types", who]
			.filter(Boolean).join(" · "),
		head: LVM_COLS.map((c) => c[0]),
		rows: rows.map((r) => LVM_COLS.map((c) => { const v = c[1](r); return v == null ? "" : v; })),
		note: lvmNote(s),
		headFill: HEAD_FILL,
		zebra: ZEBRA_FILL,
		cellFill: lvbFill,
	};
}

function Toolbar({ s, rows }) {
	const f = s.lvm;
	const ym = f.month || thisMonth();
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState("");

	const download = async () => {
		const pdf = f.fmt === "PDF";
		const name = `leave-monthly-${ym}.${pdf ? "pdf" : "xlsx"}`;
		setBusy(true);
		setMsg("");
		try {
			await (pdf ? sheetsPdf : sheetsXlsx)([lvmSheet(s, rows)], name);
			setMsg(`Downloaded ${fmt(rows.length)} row${rows.length === 1 ? "" : "s"} to ${name}.`);
		} catch (e) {
			setMsg(`Could not build ${name}: ${e.message || e}`);
		} finally {
			setBusy(false);
		}
	};

	/* The status box narrows who the employee box offers, so a status that no
	   longer includes somebody picked takes their chip off — otherwise a chip
	   names somebody the report has silently stopped listing. */
	const setStatus = (status) => {
		patch("lvm", { status, emps: (f.emps || []).filter((n) => !status || s.byName[n]?.status === status) });
	};
	const people = picked(s);
	const chosen = new Set(people.map((e) => e.name));
	const add = (n) => { if (n && !chosen.has(n)) patch("lvm", { emps: [...people.map((e) => e.name), n] }); };
	const drop = (n) => patch("lvm", { emps: people.map((e) => e.name).filter((x) => x !== n) });

	return (
		<div className="repform mt-[.7rem]">
			<div className="mbbar">
				<label className="mbf">
					<span>Add Employee</span>
					<EmpPick people={pool(s).filter((e) => !chosen.has(e.name))} value="" all="type a name or code"
						ariaLabel="Search employee" everyone={false} onChange={add} />
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
					<select value={f.ltype} aria-label="Leave type" onChange={(e) => patch("lvm", { ltype: e.target.value })}>
						<option value="">All leave types</option>
						{s.leaveTypes.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
					</select>
				</label>
				<label className="mbf">
					<span>Month</span>
					<input type="month" value={ym} aria-label="Month"
						onChange={(e) => patch("lvm", { month: e.target.value })} />
				</label>
				<label className="mbf">
					<span>Download as</span>
					<span className="flex gap-[.3rem] items-center">
						<select value={f.fmt} aria-label="File type" onChange={(e) => patch("lvm", { fmt: e.target.value })}>
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
			<div className="flex flex-wrap gap-[.4rem] items-center" aria-label="Selected employees">
				{people.map((e) => (
					<span className="chip" key={e.name}>
						{e.employee_name || e.name}{e.employee_number ? ` (${e.employee_number})` : ""}
						<button type="button" aria-label={"Remove " + (e.employee_name || e.name)} onClick={() => drop(e.name)}>×</button>
					</span>
				))}
				{people.length > 1 ? (
					<button type="button" className="chiptool no" title="Clear every employee"
						aria-label="Clear every employee" onClick={() => patch("lvm", { emps: [] })}>✗</button>
				) : null}
			</div>
			{msg && <div className="mt-[.4rem]"><span className="muted" role="status">{msg}</span></div>}
		</div>
	);
}

function Table({ s, rows }) {
	const ym = s.lvm.month || thisMonth();

	if (s.lvbState === "error") {
		return (
			<Empty title="The leave could not be read">
				<span className="block">{s.lvbErr || "The site refused the request"}.</span>
			</Empty>
		);
	}
	if (s.lvbState !== "done") {
		return <Empty title="Reading leave from the site…" />;
	}
	if (!picked(s).length) {
		return <Empty title="Pick an employee" />;
	}
	if (!rows.length) {
		return (
			<Empty title="No leave this month">
				Nobody picked had leave allocated by the end of {monthText(ym)}, or took any in it.
				{s.lvbRows.length || s.lvbLedger?.length ? "" : " The site holds no approved Leave Application and no allocation at all."}
			</Empty>
		);
	}

	const available = rows.reduce((t, r) => t + (r.available || 0), 0);
	return (
		<>
			<div className="ddacount">
				{fmt(rows.length)} row{rows.length === 1 ? "" : "s"} · {monthText(ym)}
				{s.lvbLedger ? ` · ${fmt(available)} day${available === 1 ? "" : "s"} available at the month's end`
					: " · the leave ledger could not be read, so only Availed is filled"}
			</div>
			<Scroll>
				<table style={{ minWidth: 90 * LVM_COLS.length }}>
					<thead>
						<tr>{LVM_COLS.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={lvbKey(r.emp.name, r.type)}>
								{LVM_COLS.map((c) => (
									<td key={c[0]} className={c[0] === "Available" ? "mono font-bold" : c[2] || undefined}>
										{String(c[1](r))}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>
		</>
	);
}

export default function LeaveMonthly() {
	const s = useApp();
	const rows = lvmRows(s);

	/* The Leave Balance Report's read, guarded by its own flag — if that page
	   was opened first, this is already done and asks nothing. */
	useEffect(() => { void loadLeaveBalances(); }, []);

	return (
		<>
			<div className="fhtitle">Leave Monthly Availed</div>
			<Toolbar s={s} rows={rows} />
			<Table s={s} rows={rows} />
		</>
	);
}
