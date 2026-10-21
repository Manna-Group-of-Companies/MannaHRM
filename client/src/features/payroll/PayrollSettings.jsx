/** Payroll Settings, as the HRDashboard reference draws it (21 October 2026),
 *  read and not written (D6).
 *
 *  The reference's form is a currency, one tax rate, one insurance rate and an
 *  overtime multiple. Here PF and ESI are by salary structure (Salary Setup),
 *  and what decides pay is the site's Payroll Settings — above all *Payroll
 *  Based On*, which must be Attendance or every absent day is paid. So this
 *  page shows those settings, says where each differs from what payroll here
 *  is built on (manna_hr/payrollsetup.py PAYROLL_SETTINGS); IT sets them with
 *  tools/setup_payroll.py --apply. The reference's pay cycle has no home on this site and
 *  is not drawn.
 */

import { useEffect, useState } from "react";
import { navigate } from "@/routes/router";
import { getDoc, listAll } from "@/api/client";
import KitIcon from "@/components/kit/KitIcon";
import { EmptyState, PageHead, Pill } from "@/components/kit/ui";

/** What payroll here is built on — manna_hr/payrollsetup.py, kept in step by
    hand and pinned by tests/payrollkit.test.jsx. */
export const PAYROLL_EXPECTS = [
	["payroll_based_on", "Attendance", "Payroll based on", "An absent day is a salary cut only when this is Attendance."],
	["consider_unmarked_attendance_as", "Present", "Unmarked days count as", "A day nobody marked is paid, not cut."],
];
const ALSO = [
	["include_holidays_in_total_working_days", "Holidays in working days"],
	["daily_wages_fraction_for_half_day", "A half day pays"],
	["max_working_hours_against_timesheet", "Most hours on a timesheet"],
	["email_salary_slip_to_employee", "Email payslips to employees"],
];
const shown = (v) => (v === 1 || v === "1" ? "Yes" : v === 0 || v === "0" ? "No" : v == null || v === "" ? "—" : String(v));

function General() {
	const [doc, setDoc] = useState(undefined);
	useEffect(() => { getDoc("Payroll Settings", "Payroll Settings").then(setDoc); }, []);
	if (doc === undefined) return <div className="k-sk" style={{ height: 200 }} />;
	if (doc === null) return <EmptyState icon="lock" title="Payroll Settings could not be read" sub="This login may not read them on the site." />;
	const gaps = PAYROLL_EXPECTS.filter(([f, want]) => doc[f] !== want);
	return (
		<>
			{gaps.length ? (
				<div className="k-alert" role="status" style={{ marginBottom: 18 }}>
					<span className="k-a-ic"><KitIcon name="info" size={18} stroke={2} /></span>
					<p><b>{gaps.length} setting{gaps.length === 1 ? " differs" : "s differ"}</b> from what payroll here is built on.</p>
				</div>
			) : null}
			<div className="k-sec">
				<div className="k-sec-h"><h3>What decides pay</h3></div>
				{PAYROLL_EXPECTS.map(([f, want, label, why]) => (
					<div className="k-kv" key={f} style={{ gridTemplateColumns: "200px 1fr auto" }}>
						<dt>{label}</dt>
						<dd title={why}>{shown(doc[f])}</dd>
						<dd>{doc[f] === want ? <Pill status="Done">As built</Pill> : <Pill status="Overdue">Should be {want}</Pill>}</dd>
					</div>
				))}
			</div>
			<div className="k-sec">
				<div className="k-sec-h"><h3>Also on the site</h3></div>
				{ALSO.map(([f, label]) => (
					<div className="k-kv" key={f}><dt>{label}</dt><dd>{shown(doc[f])}</dd></div>
				))}
			</div>
		</>
	);
}

function Components() {
	const [rows, setRows] = useState(null);
	useEffect(() => {
		listAll("Salary Component", ["name", "type", "salary_component_abbr", "disabled"]).then(setRows).catch(() => setRows([]));
	}, []);
	if (rows === null) return <div className="k-sk" style={{ height: 200 }} />;
	if (!rows.length) return <EmptyState icon="wallet" title="No salary components" sub="Salary Setup makes Basic, Provident Fund and ESI when it first saves a structure." />;
	return (
		<div className="k-tbl-wrap">
			<table className="k-rt">
				<thead><tr>{["Component", "Abbr", "Kind", "In use"].map((c) => <th key={c}><span>{c}</span></th>)}</tr></thead>
				<tbody>
					{rows.sort((a, b) => String(a.type).localeCompare(String(b.type)) || a.name.localeCompare(b.name)).map((r) => (
						<tr key={r.name}>
							<td className="k-title-cell"><b>{r.name}</b></td>
							<td data-label="Abbr" className="k-num">{r.salary_component_abbr || "—"}</td>
							<td data-label="Kind"><Pill status={r.type === "Deduction" ? "Rejected" : "Approved"} dot={false}>{r.type || "—"}</Pill></td>
							<td data-label="In use">{Number(r.disabled) ? "No" : "Yes"}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default function PayrollSettings() {
	const [tab, setTab] = useState("general");
	return (
		<div className="kit k-enter">
			<PageHead title="Payroll Settings" sub="What decides pay on this site, read from it">
				<button type="button" className="k-btn k-btn-line" onClick={() => navigate("payroll", "setup")}>
					<KitIcon name="gear" size={18} stroke={2} />Salary Setup
				</button>
			</PageHead>
			<div className="k-card">
				<div className="k-vtabs" role="tablist" aria-label="Payroll settings">
					{[["general", "General"], ["components", "Salary components"]].map(([k, l]) => (
						<button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "k-on" : undefined}
							onClick={() => setTab(k)}>{l}</button>
					))}
				</div>
				{tab === "general" ? <General /> : <Components />}
			</div>
		</div>
	);
}
