/** Time Off Settings, as the HRDashboard reference draws it (21 October 2026),
 *  on this site's records.
 *
 *  Holidays: each Holiday List's days that are not the weekly off, newest list
 *  first. They are made and changed on Employees → Calendar, which is where the
 *  lists already are; this tab reads them.
 *
 *  Types & policies (D17): the site's Leave Types and Leave Policies, read and
 *  not edited — a policy is what gives people leave, and changing one from here
 *  would change what everybody is owed. Casual Leave's monthly rule is
 *  tools/setup_monthly_leave.py or Give monthly leave on Apply Leave.
 */

import { useEffect, useState } from "react";
import { useApp } from "@/store";
import { navigate } from "@/routes/router";
import { listAll } from "@/api/client";
import { dmy } from "@/lib/format";
import KitIcon from "@/components/kit/KitIcon";
import { EmptyState, PageHead, Pill } from "@/components/kit/ui";
import { typeTone } from "@/features/leave/TeamTimeOff";

const day10 = (v) => String(v || "").slice(0, 10);

function Holidays() {
	const s = useApp();
	const lists = (s.holidayLists || []).map((h) => h.name);
	const [pick, setPick] = useState("");
	const name = pick || lists[0] || "";
	const today = new Date().toISOString().slice(0, 10);
	const rows = (s.holidays?.[name] || []).filter((h) => !Number(h.weekly_off))
		.slice().sort((a, b) => day10(a.holiday_date).localeCompare(day10(b.holiday_date)));
	return (
		<>
			<div className="k-sec-h">
				<h3>Holidays</h3>
				<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
					{lists.length > 1 ? (
						<select className="k-sel" aria-label="Holiday list" value={name} style={{ width: "auto", height: 34 }} onChange={(e) => setPick(e.target.value)}>
							{lists.map((l) => <option key={l}>{l}</option>)}
						</select>
					) : null}
					<button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={() => navigate("settings", "calendar")}>
						<KitIcon name="edit" size={14} stroke={2} />Edit on Calendar
					</button>
				</div>
			</div>
			{rows.length ? (
				<div className="k-tbl-wrap">
					<table className="k-rt">
						<thead><tr>{["Date", "Day", "Holiday", "List"].map((c) => <th key={c}><span>{c}</span></th>)}</tr></thead>
						<tbody>
							{rows.map((h) => (
								<tr key={h.holiday_date + h.description} style={day10(h.holiday_date) < today ? { opacity: 0.55 } : undefined}>
									<td className="k-title-cell">{dmy(day10(h.holiday_date))}</td>
									<td data-label="Day">{new Date(day10(h.holiday_date) + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" })}</td>
									<td data-label="Holiday"><b>{h.description || "Holiday"}</b></td>
									<td data-label="List"><Pill status="Closed" dot={false}>{name}</Pill></td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<EmptyState icon="calendar" title="No holidays yet" sub={name ? `${name} has no holidays besides the weekly off.` : "There is no holiday list on this site yet."} />
			)}
		</>
	);
}

function Types() {
	const s = useApp();
	const [policies, setPolicies] = useState(null);
	useEffect(() => {
		listAll("Leave Policy", ["name", "title", "docstatus"]).then(setPolicies).catch(() => setPolicies([]));
	}, []);
	const types = s.leaveTypes || [];
	return (
		<>
			<div className="k-sec-h"><h3>Time off types</h3></div>
			{types.length ? (
				<div className="k-jobs" style={{ marginBottom: 24 }}>
					{types.map((t) => (
						<div className="k-sec" style={{ margin: 0, display: "flex", gap: 12, alignItems: "center" }} key={t.name}>
							<span className="k-icon-sq" style={{ background: `rgb(var(--av${typeTone(t.name)}))`, color: `rgb(var(--av${typeTone(t.name)}-ink))` }}>
								<KitIcon name="clock" size={18} stroke={2} />
							</span>
							<div style={{ flex: 1 }}>
								<b>{t.name}</b>
								<small style={{ display: "block", color: "rgb(var(--ink-2))" }}>
									{Number(t.is_earned_leave) ? `Earned ${String(t.earned_leave_frequency || "").toLowerCase() || "over the year"}` : "Given as allocated"}
								</small>
							</div>
						</div>
					))}
				</div>
			) : <EmptyState icon="clock" title="No leave types" sub="The site has no Leave Type yet." />}
			<div className="k-sec-h"><h3>Policies</h3></div>
			{policies === null ? <div className="k-sk" style={{ height: 80 }} /> : policies.length ? (
				<div className="k-tbl-wrap">
					<table className="k-rt">
						<thead><tr>{["Policy", "State"].map((c) => <th key={c}><span>{c}</span></th>)}</tr></thead>
						<tbody>
							{policies.map((p) => (
								<tr key={p.name}>
									<td className="k-title-cell"><b>{p.title || p.name}</b></td>
									<td data-label="State"><Pill status={Number(p.docstatus) === 1 ? "Submitted" : Number(p.docstatus) === 2 ? "Cancelled" : "Draft"} /></td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : <EmptyState icon="file" title="No policies" sub="Give monthly leave on Apply Leave makes Casual Leave's." />}
		</>
	);
}

export default function TimeOffSettings() {
	const [tab, setTab] = useState("holidays");
	return (
		<div className="kit k-enter">
			<PageHead title="Time Off Settings"
				sub={tab === "holidays" ? "Public and company holidays aren’t counted as time off" : "Types of time off and how much people get"} />
			<div className="k-card">
				<div className="k-vtabs" role="tablist" aria-label="Time off settings">
					{[["holidays", "Holidays"], ["types", "Types & policies"]].map(([k, l]) => (
						<button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "k-on" : undefined}
							onClick={() => setTab(k)}>{l}</button>
					))}
				</div>
				{tab === "holidays" ? <Holidays /> : <Types />}
			</div>
		</div>
	);
}
