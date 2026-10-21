/** My Time Off, as the HRDashboard reference draws it (21 October 2026): the
 *  signed-in person's balance of each leave type and their requests, for a
 *  login an Employee is linked to (D3).
 *
 *  The balance is hrms's own `get_leave_details` (api/load.js
 *  loadLeaveBalance) — the number an application is measured against — and New
 *  request is Apply Leave, opened on them, which raises an Open draft.
 */

import { useEffect } from "react";
import { getState, patch, useApp } from "@/store";
import { navigate } from "@/routes/router";
import { loadLeaveBalance } from "@/api/load";
import { loadLeaveList } from "@/api/leavelist";
import { ownEmployee } from "@/features/attendance/attstate";
import { typeTone } from "@/features/leave/TeamTimeOff";
import { dmy } from "@/lib/format";
import KitIcon from "@/components/kit/KitIcon";
import { EmptyState, PageHead, Pill, stagger } from "@/components/kit/ui";

const STATUS = { Open: "Pending", Approved: "Approved", Rejected: "Rejected", Cancelled: "Cancelled" };
const day10 = (v) => String(v || "").slice(0, 10);

export default function MyTimeOff() {
	const s = useApp();
	const me = ownEmployee(s);
	useEffect(() => {
		if (!me) return;
		/* The balance read answers only for the person Apply Leave is on. */
		if (getState().apply.emp !== me) patch("apply", { emp: me });
		void loadLeaveBalance(me);
		void loadLeaveList();
	}, [me]);

	const request = () => { patch("apply", { emp: me }); navigate("leave", "overview"); };
	const head = (
		<PageHead title="My Time Off" sub="Your balances and requests">
			{me ? (
				<button type="button" className="k-btn k-btn-ink" onClick={request}>
					<KitIcon name="plus" size={18} stroke={2} />New request
				</button>
			) : null}
		</PageHead>
	);
	if (!me) {
		return (
			<div className="kit k-enter">
				{head}
				<div className="k-card"><EmptyState icon="user" title="No employee record for this login" sub="My Time Off is for a login an Employee record is linked to." /></div>
			</div>
		);
	}

	const bal = s.applyBal;
	const mine = (s.lvAll.rows || []).filter((r) => r.employee === me)
		.sort((a, b) => day10(b.from_date).localeCompare(day10(a.from_date)));

	return (
		<div className="kit k-enter">
			{head}
			<div className="k-mini-grid">
				{!bal ? <div className="k-sk" style={{ height: 110 }} /> : bal.rows.length ? bal.rows.map((r, i) => {
					const total = (r.taken || 0) + (r.remaining || 0);
					const tone = typeTone(r.type);
					return (
						<div className="k-mini k-anim" style={stagger(i)} key={r.type}>
							<div className="k-mini-t">
								<span style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<i style={{ width: 10, height: 10, borderRadius: "50%", background: `rgb(var(--av${tone}-ink))` }} />{r.type}
								</span>
							</div>
							<div className="k-mini-v"><b>{r.remaining}</b>days left</div>
							<div className="k-bar" style={{ marginTop: 12 }}>
								<i style={{ width: `${total ? Math.min(100, (r.taken / total) * 100) : 0}%`, background: `rgb(var(--av${tone}-ink))` }} />
							</div>
							<div className="k-muted" style={{ fontSize: 12, marginTop: 6 }}>{r.taken} of {total} used{r.pending ? ` · ${r.pending} pending` : ""}</div>
						</div>
					);
				}) : <div className="k-card"><EmptyState icon="clock" title="No leave given yet" sub={bal.err || "The site has not allocated you any leave."} /></div>}
			</div>
			<div className="k-card">
				<div className="k-card-h"><h3>Requests</h3></div>
				{mine.length ? (
					<div className="k-tbl-wrap">
						<table className="k-rt">
							<thead><tr>{["Type", "From", "To", "Days", "Note", "Status"].map((c) => <th key={c}><span>{c}</span></th>)}</tr></thead>
							<tbody>
								{mine.map((r) => (
									<tr key={r.name}>
										<td className="k-title-cell"><b>{r.leave_type}</b></td>
										<td data-label="From">{dmy(day10(r.from_date))}</td>
										<td data-label="To">{dmy(day10(r.to_date))}</td>
										<td data-label="Days" className="k-num">{r.total_leave_days ?? "—"}</td>
										<td data-label="Note" className="k-muted">{r.description || "—"}</td>
										<td data-label="Status"><Pill status={STATUS[r.status] || r.status} /></td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<EmptyState icon="clock" title="No requests yet" sub="When you request time off it will show up here.">
						<button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={request}><KitIcon name="plus" size={16} stroke={2} />New request</button>
					</EmptyState>
				)}
			</div>
		</div>
	);
}
