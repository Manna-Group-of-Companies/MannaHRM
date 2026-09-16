/* ---------------------------------------------------------------------------
   Three dashboards per company — HR, Attendance, Payroll.

   Asked for on 16 September 2026, for Hi-Tech Rubber Industries, Manna Rubber
   Products Private Limited, Manna Treads and Manna Tyre Retreads, each with a
   login of its own that sees its own company and nothing else.

   **The lock is on the site, not here.** Each company login carries a User
   Permission on `Company` (tools/create_company_users.py), so ERPNext itself
   returns only that company's employees, punches, attendance and slips. The
   strip at the top of these pages narrows to what the site let this session
   read, which makes a locked login show one button — but a button hidden here
   is not a permission, and CLAUDE.md §5 says why that matters.

   Every page reads what it needs on open, filtered by company, rather than
   widening the shared first load: a month of Attendance for a factory is
   thousands of rows that no other page wants.
   --------------------------------------------------------------------------- */

import { useEffect, useState } from "react";

import { set, useApp } from "@/store";
import { listAll } from "@/api/client";
import { fmt, thisMonth, todayIso } from "@/lib/format";
import {
	dailyPresent, hrSummary, inr, joinTrend, monthAttendance, netByDept, offered,
	payrollSummary, todayAtGate, withoutStructure,
} from "@/lib/companydash";
import { Bars, Cols, Empty, Note, Panel } from "@/components/ui";
import { Columns, Donut, Meter, Stat, Stats } from "@/components/charts";
import Link from "@/routes/Link";

/** The company this page is about: the top bar's pick when it is one of ours,
 *  otherwise the first the site offers. */
function useCompany() {
	const s = useApp();
	const list = offered(s.companies);
	const co = list.includes(s.company) ? s.company : list[0];
	return { s, list, co };
}

function CompanyStrip({ list, co, title, month, onMonth }) {
	return (
		<div className="embar startbar">
			<div className="segs" role="group" aria-label="Company">
				{list.map((c) => (
					<button key={c} type="button" className="embtn" aria-pressed={c === co}
						onClick={() => set({ company: c })}>
						{c}
					</button>
				))}
			</div>
			<span className="grow" />
			{onMonth ? (
				<label className="find">
					<span aria-hidden="true">📅</span>
					<input type="month" value={month} aria-label="Month"
						onChange={(e) => onMonth(e.target.value || thisMonth())} />
				</label>
			) : null}
			<b>{title}</b>
		</div>
	);
}

/** One read keyed on its inputs, with loading and error carried out. */
function useRead(fn, deps) {
	const [st, setSt] = useState({ rows: null, err: "" });
	useEffect(() => {
		let live = true;
		setSt({ rows: null, err: "" });
		fn()
			.then((rows) => { if (live) setSt({ rows, err: "" }); })
			.catch((e) => { if (live) setSt({ rows: [], err: String((e && e.message) || e).slice(0, 200) }); });
		return () => { live = false; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);
	return st;
}

const monthBounds = (ym) => {
	const [y, m] = ym.split("-").map(Number);
	const last = new Date(y, m, 0).getDate();
	return [`${ym}-01`, `${ym}-${String(last).padStart(2, "0")}`];
};

function ReadNote({ st, what }) {
	if (st.err) return <Note>Could not read {what}: {st.err}</Note>;
	if (st.rows === null) return <Note>Reading {what}…</Note>;
	return null;
}

/* ---------------------------------------------------------------- HR ---- */

export function HrDash() {
	const { s, list, co } = useCompany();
	const today = todayIso();
	const emps = (s.employees || []).filter((e) => e.company === co);
	const h = hrSummary(emps, today);
	const trend = joinTrend(emps, today);
	const leaves = useRead(
		() => listAll("Leave Application",
			["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "status"],
			[["company", "=", co], ["status", "=", "Open"]]),
		[co],
	);

	return (
		<>
			<CompanyStrip list={list} co={co} title="HR Dashboard" />
			<Stats>
				<Stat ico="👥" k="Active Employees" n={fmt(h.active)} tone="good" s={`${fmt(h.total)} on the roll`} />
				<Stat ico="📈" k="Joined This Month" n={fmt(h.joinedMonth)} tone={h.joinedMonth ? "info" : undefined} />
				<Stat ico="👋" k="Left" n={fmt(h.left)} s={`${fmt(h.inactive)} not active in all`} />
				<Stat ico="📝" k="Open Leave Requests" n={leaves.rows ? fmt(leaves.rows.length) : "…"}
					tone={leaves.rows && leaves.rows.length ? "warn" : undefined}
					to={<Link section="dashboard" subtab="approvals">Approvals →</Link>} />
			</Stats>
			{!emps.length ? (
				<Empty title={`No employees read for ${co}`}>
					Either the company has nobody loaded yet, or this login may not read it.
				</Empty>
			) : null}
			<Cols>
				<Panel title="Headcount by department" ico="🏭" cov="live">
					{h.byDept.length ? <Bars pairs={h.byDept} /> : <Note>No active employees.</Note>}
				</Panel>
				<Panel title="Headcount by designation" ico="🪪" cov="live">
					{h.byDesig.length ? <Bars pairs={h.byDesig} /> : <Note>No active employees.</Note>}
				</Panel>
				<Panel title="Joiners, last six months" ico="📊" cov="live">
					<Columns rows={trend} label="Joiners per month" />
				</Panel>
				<Panel title="Setup gaps" ico="⚠️" cov="live">
					{/* A person with no device id has every punch dropped — see
					    docs/NEW_EMPLOYEE.md — and nobody notices until pay day. */}
					<Meter label="Active with a fingerprint device id" n={h.active - h.noDevice} of={h.active}
						tone={h.noDevice ? "warn" : "good"} hint={h.noDevice ? `${fmt(h.noDevice)} will have punches dropped` : ""} />
					<Meter label="Active with a reporting manager" n={h.active - h.noManager} of={h.active}
						tone={h.noManager ? "warn" : "good"} hint={h.noManager ? `${fmt(h.noManager)} have nobody to approve their requests` : ""} />
				</Panel>
				<Panel title="Open leave requests" ico="🗓️" cov="live">
					<ReadNote st={leaves} what="leave applications" />
					{leaves.rows && leaves.rows.length ? (
						<div className="rows">
							{leaves.rows.slice(0, 12).map((l) => (
								<div className="row" key={l.name}>
									<span>{l.employee_name || l.employee}</span>
									<span className="val">{l.leave_type} · {l.from_date} → {l.to_date}</span>
								</div>
							))}
						</div>
					) : leaves.rows ? <Note>Nothing waiting.</Note> : null}
				</Panel>
			</Cols>
		</>
	);
}

/* -------------------------------------------------------- Attendance ---- */

export function AttendanceDash() {
	const { s, list, co } = useCompany();
	const today = todayIso();
	const [month, setMonth] = useState(thisMonth());
	const [from, to] = monthBounds(month);
	const act = (s.employees || []).filter((e) => e.company === co && e.status === "Active");

	const att = useRead(
		() => listAll("Attendance",
			["name", "employee", "status", "attendance_date", "late_entry", "early_exit", "docstatus"],
			[["company", "=", co], ["attendance_date", ">=", from], ["attendance_date", "<=", to]], 500),
		[co, month],
	);
	const onLeave = useRead(
		() => listAll("Leave Application", ["name", "employee", "from_date", "to_date", "status"],
			[["company", "=", co], ["status", "=", "Approved"], ["from_date", "<=", today], ["to_date", ">=", today]]),
		[co],
	);

	const gate = todayAtGate(act, s.checkins, onLeave.rows, today);
	const m = monthAttendance(att.rows);
	const daily = dailyPresent(att.rows, month === thisMonth() ? today : to);
	const regs = (s.approvals.attendance || []).filter((r) => r.company === co);

	return (
		<>
			<CompanyStrip list={list} co={co} title="Attendance Dashboard" month={month} onMonth={setMonth} />
			<Stats>
				<Stat ico="✅" k="Punched In Today" n={fmt(gate.present)} tone="good" s={`of ${fmt(gate.of)} active`} />
				<Stat ico="🌴" k="On Leave Today" n={onLeave.rows ? fmt(gate.leave) : "…"} tone="info" />
				<Stat ico="⛔" k="Not In Yet" n={fmt(gate.notIn)} tone={gate.notIn ? "warn" : undefined} />
				<Stat ico="🛠️" k="Pending Corrections" n={fmt(regs.length)} tone={regs.length ? "warn" : undefined}
					to={<Link section="attendance">Regularization →</Link>} />
			</Stats>
			<Cols>
				<Panel title="Today" ico="🕒" cov="live">
					<Donut label="Today's attendance" caption="active" total={gate.of} parts={[
						{ key: "p", label: "Punched in", n: gate.present, c: 1 },
						{ key: "l", label: "On leave", n: gate.leave, c: 2 },
						{ key: "n", label: "Not in yet", n: gate.notIn, c: 3 },
					]} />
				</Panel>
				<Panel title={`Month — ${month}`} ico="📅" cov="live">
					<ReadNote st={att} what="attendance" />
					{att.rows && !m.marked ? (
						<Note>No submitted Attendance for this month. It is generated from punches by the shift job,
							so an empty month usually means shifts are not assigned yet.</Note>
					) : null}
					{m.marked ? (
						<>
							<Bars pairs={Object.entries(m.by)} />
							<Meter label="Attendance rate" n={m.rate} of={100} tone={m.rate >= 90 ? "good" : "warn"}
								hint={`${fmt(m.late)} late entries · ${fmt(m.early)} early exits`} />
						</>
					) : null}
				</Panel>
				<Panel title="Present per day" ico="📊" cov="live">
					<Columns rows={daily} label="Present per day" />
				</Panel>
			</Cols>
		</>
	);
}

/* ----------------------------------------------------------- Payroll ---- */

export function PayrollDash() {
	const { s, list, co } = useCompany();
	const [month, setMonth] = useState(thisMonth());
	const [from, to] = monthBounds(month);
	const act = (s.employees || []).filter((e) => e.company === co && e.status === "Active");

	const slips = useRead(
		() => listAll("Salary Slip",
			["name", "employee", "employee_name", "department", "start_date", "gross_pay",
				"total_deduction", "net_pay", "leave_without_pay", "docstatus"],
			[["company", "=", co], ["start_date", ">=", from], ["start_date", "<=", to]], 500),
		[co, month],
	);
	const ssa = useRead(
		() => listAll("Salary Structure Assignment", ["name", "employee", "docstatus"],
			[["company", "=", co], ["docstatus", "=", 1]], 500),
		[co],
	);
	const runs = useRead(
		() => listAll("Payroll Entry", ["name", "posting_date", "start_date", "end_date", "docstatus"],
			[["company", "=", co]]),
		[co],
	);

	const p = payrollSummary(slips.rows);
	const missing = withoutStructure(act, ssa.rows);

	return (
		<>
			<CompanyStrip list={list} co={co} title="Payroll Dashboard" month={month} onMonth={setMonth} />
			<Stats>
				<Stat ico="💰" k="Net Pay (submitted)" n={slips.rows ? inr(p.net) : "…"} tone="good"
					s={`${fmt(p.submitted)} slips`} />
				<Stat ico="📥" k="Gross Pay" n={slips.rows ? inr(p.gross) : "…"} tone="info" />
				<Stat ico="📤" k="Deductions" n={slips.rows ? inr(p.deductions) : "…"} />
				<Stat ico="📝" k="Draft Slips" n={fmt(p.draft)} tone={p.draft ? "warn" : undefined}
					s={p.draft ? `${inr(p.draftNet)} not yet approved` : ""} />
			</Stats>
			<Cols>
				<Panel title={`Salary slips — ${month}`} ico="🧾" cov="live">
					<ReadNote st={slips} what="salary slips" />
					{slips.rows && !p.slips ? <Note>No salary slips for this month yet.</Note> : null}
					{p.slips ? (
						<Donut label="Slips by state" caption="slips" total={p.slips} parts={[
							{ key: "s", label: "Submitted", n: p.submitted, c: 1 },
							{ key: "d", label: "Draft", n: p.draft, c: 2 },
						]} />
					) : null}
					{p.lwp ? <Note>{fmt(p.lwp)} days of leave without pay in this month's slips.</Note> : null}
				</Panel>
				<Panel title="Net pay by department" ico="🏭" cov="live">
					{netByDept(slips.rows).length
						? <Bars pairs={netByDept(slips.rows)} />
						: <Note>Nothing submitted for this month.</Note>}
				</Panel>
				<Panel title="Salary structure coverage" ico="📐" cov="live">
					<ReadNote st={ssa} what="salary structure assignments" />
					{/* A person with no structure is skipped by a payroll run without a
					    word — this is the list that says who. */}
					<Meter label="Active with a salary structure" n={act.length - missing.length} of={act.length}
						tone={missing.length ? "warn" : "good"} />
					{ssa.rows && missing.length ? (
						<Note>No structure: {missing.slice(0, 8).map((e) => e.employee_name || e.name).join(", ")}
							{missing.length > 8 ? ` and ${fmt(missing.length - 8)} more` : ""}.</Note>
					) : null}
				</Panel>
				<Panel title="Payroll runs" ico="⚙️" cov="live">
					<ReadNote st={runs} what="payroll entries" />
					{runs.rows && runs.rows.length ? (
						<div className="rows">
							{runs.rows.slice(0, 8).map((r) => (
								<div className="row" key={r.name}>
									<span>{r.start_date} → {r.end_date}</span>
									<span className="val">{Number(r.docstatus) === 1 ? "Submitted" : Number(r.docstatus) === 2 ? "Cancelled" : "Draft"}</span>
								</div>
							))}
						</div>
					) : runs.rows ? <Note>No payroll has been run for {co}.</Note> : null}
				</Panel>
			</Cols>
		</>
	);
}
