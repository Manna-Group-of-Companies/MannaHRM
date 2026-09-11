import { getState, set, useApp } from "@/store";
import { load } from "@/api/load";
import { exportLog, logDecision, otherRows, qExport, qFilter, qTemplate, queueOf, reqId }
	from "@/features/approvals/queue";
import { APPROVED, OPEN, REJECTED, decideCorrection, punchesFor } from "@/features/approvals/decide";
import { otherCols } from "@/features/approvals/OtherGrid";
import { scoped } from "@/lib/scope";
import { dayOf, dmy } from "@/lib/format";
import { APPROVALS, QBULK, QGROUPS, QSCOPES, READ_ONLY } from "@/data/approvals";

import { Empty, Html, Modal, Note, Panel, Scroll, panelProps, tabProps } from "@/components/ui";

import OtherGrid from "./OtherGrid";
import RequestRow from "./RequestCards";

/* Factor HR's own toolbar, above the queue and shared by every tab:
   select-all · bulk action · search · refresh · how many activities · grouping.
   Everything here that only reads is wired. The two that write are not, and say
   so when pressed rather than looking broken. */
function QToolbar({ total, shown }) {
	const s = useApp();
	const sel = s.appsel.size;
	const allOn = shown.length > 0 && shown.every((r) => s.appsel.has(reqId(r)));

	const toggleAll = (on) => {
		// Select-all covers what is shown, never the rows a search has hidden.
		const next = new Set(s.appsel);
		shown.forEach((r) => (on ? next.add(reqId(r)) : next.delete(reqId(r))));
		set({ appsel: next });
	};

	const bulk = (v) => {
		/* Of Factor HR's two bulk actions, one reads and one writes. The one that
		   reads is done here and now; the one that writes says why it cannot be. */
		if (v === "decide") {
			set({ appmsg: `${sel || "No"} request${sel === 1 ? "" : "s"} selected. `
				+ (s.apptab === "attendance"
					? "Bulk decisions are not wired: approving in bulk writes punches for every row at once. "
						+ "Decide each card with its own tick or cross, which says what it writes first."
					: READ_ONLY) });
		}
		if (v === "data") set({ appdialog: "data", dlgmsg: "" });
	};

	return (
		<>
			<div className="qbar">
				<input type="checkbox" aria-label="Select everything shown" checked={allOn}
					onChange={(e) => toggleAll(e.target.checked)} />

				<select aria-label="Bulk action" value="" onChange={(e) => bulk(e.target.value)}>
					{QBULK.map((o) => (
						<option key={o[0]} value={o[0]}>{o[1]}</option>
					))}
				</select>

				<input type="search" placeholder="Search" aria-label="Search this queue"
					value={s.appq} onChange={(e) => set({ appq: e.target.value })} />

				<button className="icon" title="Reload from the site" aria-label="Refresh"
					onClick={() => { set({ appmsg: "" }); void load(); }}>
					↻
				</button>

				<select aria-label="How many activities" value={s.appscope}
					onChange={(e) => set({ appscope: e.target.value })}>
					{QSCOPES.map((o) => (
						<option key={o[0]} value={o[0]}>{o[1]}</option>
					))}
				</select>

				<select aria-label="Grouping" value={s.appgroup}
					onChange={(e) => set({ appgroup: e.target.value })}>
					{QGROUPS.map((o) => (
						<option key={o[0]} value={o[0]}>{o[1]}</option>
					))}
				</select>

				<span className="picked">
					{shown.length} of {total} shown
					{sel ? <> · <b>{sel} selected</b></> : null}
				</span>
			</div>
			{s.appmsg ? <Note>{s.appmsg}</Note> : null}
		</>
	);
}

function groupKey(s, r, t) {
	if (s.appgroup === "type") return t.kind || t.l;
	if (s.appgroup === "manager") return s.byName[r.employee]?.reports_to || "";
	return r.employee || "—";
}

function GroupHead({ k, rows, t }) {
	const s = useApp();
	const waiting = <span className="code">{rows.length} waiting</span>;

	if (s.appgroup === "type") {
		return (
			<>
				<b>{t.kind || t.l}</b>
				<span className="code">{t.src}</span>
				{waiting}
			</>
		);
	}
	if (s.appgroup === "manager") {
		const m = s.byName[k];
		/* No reporting line is not a tidy edge case: it is a request nobody owns,
		   and grouping is where that becomes visible instead of staying buried. */
		return k ? (
			<>
				<b>{m ? m.employee_name : k}</b>
				<span className="code">{m?.employee_number || k}</span>
				<span className="code">reporting manager</span>
				{waiting}
			</>
		) : (
			<>
				<b>No reporting manager</b>
				<span className="code">nobody owns these</span>
				{waiting}
			</>
		);
	}
	const e = s.byName[k] || {};
	const first = rows[0];
	return (
		<>
			<b>{e.employee_name || first.employee_name || k}</b>
			<span className="code">{e.employee_number || k}</span>
			<span className="code">{e.company || first.company || ""}</span>
		</>
	);
}

/* The tick or the cross on a time correction, one step before it is written.

   A confirmation rather than a one-click decision because approving puts
   punches on somebody's day, and the dialog says which ones — a misclick on
   the wrong card is exactly the mistake a queue of fifty invites. The note is
   the approver's, kept apart from the employee's reason, and it is what the
   employee sees back on a rejection. */
function DecideDialog({ close }) {
	const s = useApp();
	const d = s.appdecide;
	const r = (s.approvals.attendance || []).find((x) => x.name === d.name);
	const approve = d.action === "Approve";
	const e = (r && s.byName[r.employee]) || {};
	const punches = r ? punchesFor(r) : [];

	const go = async () => {
		set({ appdecide: { ...d, busy: true }, dlgmsg: "" });
		const res = await decideCorrection(r, d.action, d.note);
		logDecision({ ref: d.name, employee: r.employee, action: d.action,
			status: res.ok ? (approve ? APPROVED : REJECTED) : OPEN,
			persisted: res.persisted, note: res.msg, queue: "Attendance" });
		if (res.ok) {
			set({ appdialog: "", dlgmsg: "", appmsg: res.msg,
				appdecide: { name: "", action: "", note: "", busy: false } });
		} else {
			set({ appdecide: { ...getState().appdecide, busy: false }, dlgmsg: res.msg });
		}
	};

	return (
		<Modal
			title={(approve ? "Approve " : "Reject ") + (d.name || "")}
			msg={s.dlgmsg ? <span className="deerr" role="alert"><b>{s.dlgmsg}</b></span> : ""}
			onClose={close}
			extra={
				r ? (
					<div className="ctform">
						<div className="cvwho">
							<b>{dmy(r.attendance_date)} {dayOf(String(r.attendance_date || "").slice(0, 10))}</b>
							<span>
								{e.employee_name || r.employee_name || r.employee} · {e.employee_number || r.employee}
							</span>
						</div>
						<Note>
							{approve ? (
								<>
									Writes {punches.length === 1 ? "this punch" : "these punches"} to{" "}
									<b>Employee Checkin</b>, as you:{" "}
									<b>{punches.map((p) => `${p.log_type} ${p.time.slice(11, 16)}`).join(", ")}</b>.
									Attendance for the day is then built from them by the shift job — it is
									never written directly.
								</>
							) : (
								<>Nothing is written to attendance. The note below is what the employee sees.</>
							)}
						</Note>
						<div className="ctf">
							<label className="k" htmlFor="dc_note">Decision note</label>
							<input id="dc_note" value={d.note}
								placeholder={approve ? "Optional" : "Why it is refused"}
								onChange={(ev) => set({ appdecide: { ...d, note: ev.target.value } })} />
						</div>
					</div>
				) : (
					<Note>This request is no longer in the queue — somebody may already have decided it.</Note>
				)
			}
			foot={
				<button type="button" className={"btn " + (approve ? "go" : "imp")}
					disabled={!r || d.busy} onClick={go}>
					{d.busy ? "Saving…" : approve ? "✓ Approve" : "✕ Reject"}
				</button>
			}
		/>
	);
}

/** The dialogs, sharing one shell so they close the same way. */
function Dialogs({ t, shown }) {
	const s = useApp();
	const close = () => set({ appdialog: "", dlgmsg: "" });
	if (!s.appdialog) return null;

	if (s.appdialog === "decide") return <DecideDialog close={close} />;

	/* Factor HR's Import / Export dialog: Export · Download Template · Import
	   Data, and Close. Two of the three only read and work here. The third writes
	   attendance from a spreadsheet, which is the single most dangerous button in
	   any HR system, so it is drawn and refused rather than quietly omitted —
	   somebody who used it in Factor HR should find out here, not discover the
	   gap during a payroll run. */
	if (s.appdialog === "data") {
		return (
			<Modal
				title="Import / Export Data"
				msg={s.dlgmsg}
				onClose={close}
				actions={
					<>
						<button className="btn go" onClick={() => set({ dlgmsg: qExport(shown) })}>⇩ Export</button>
						<button className="btn tpl" onClick={() => set({ dlgmsg: qTemplate() })}>⇩ Download Template</button>
						<button
							className="btn imp"
							onClick={() =>
								set({
									dlgmsg:
										"Import is not built. " + READ_ONLY
										+ " Importing attendance from a spreadsheet is also the one action here that"
										+ " can pay somebody the wrong amount silently, so it wants a server rule in"
										+ " front of it, not a file picker.",
								})
							}
						>
							⇧ Import Data
						</button>
					</>
				}
				why={
					<>
						{t.l} queue · {shown.length} shown
						{s.appsel.size ? `, ${s.appsel.size} selected — Export takes the selection` : ""}
					</>
				}
			/>
		);
	}

	/* Bulk Approval. It sets Your Action on the selection and nothing more —
	   Factor HR's own two-step, kept: marking fifty rows is not deciding fifty
	   rows, and the gap between the two is where somebody notices row nineteen. */
	if (s.appdialog === "bulk") {
		const n = s.appsel.size;
		const mark = (v) => {
			if (!n) return set({ dlgmsg: "Nothing selected." });
			const othact = { ...s.othact };
			s.appsel.forEach((id) => {
				if (v) othact[id] = v;
				else delete othact[id];
			});
			set({
				othact,
				dlgmsg: `${n} row${n === 1 ? "" : "s"}`
					+ (v ? ` marked ${v}. Save Approval Changes decides them.` : " cleared."),
			});
		};
		return (
			<Modal
				title="Bulk Approval"
				msg={s.dlgmsg}
				onClose={close}
				actions={
					<>
						<button className="btn go" onClick={() => mark("Approve")}>✓ Approve selected</button>
						<button className="btn imp" onClick={() => mark("Reject")}>✕ Reject selected</button>
						<button className="btn ghost" onClick={() => mark("")}>Clear staged actions</button>
					</>
				}
				why={
					n
						? `${n} row${n === 1 ? "" : "s"} selected. This marks them only — Save Approval Changes is what decides.`
						: "Nothing selected. Tick the rows first, or use the box in the header to take everything shown."
				}
			/>
		);
	}

	/* The Approval Activities Log: what has been decided from this page, newest
	   first, and whether it reached the site. Session-scoped and said so —
	   Frappe's own version log is the durable record, per document. */
	const log = s.othlog;
	return (
		<Modal
			title="Approval Activities Log"
			wide
			msg={s.dlgmsg}
			onClose={close}
			actions={
				<>
					<button className="btn tpl" onClick={() => set({ dlgmsg: exportLog() })}>⇩ Export log</button>
					<button className="btn ghost" onClick={() => set({ othlog: [], dlgmsg: "Log cleared." })}>
						Clear log
					</button>
				</>
			}
			why={
				`${log.length} decision${log.length === 1 ? "" : "s"} this session. `
				+ "Frappe keeps the durable record per document in its version log; this list is the page's own."
			}
			extra={
				log.length ? (
					<Scroll style={{ maxHeight: "46vh" }}>
						<table style={{ minWidth: 640 }}>
							<thead>
								<tr><th>When</th><th>Reference</th><th>Action</th><th>Written</th><th>Note</th></tr>
							</thead>
							<tbody>
								{log.map((e, i) => (
									<tr key={e.at + e.ref + i}>
										<td className="mono">{e.at}</td>
										<td className="mono">{e.ref}</td>
										<td>{e.action} → {e.status}</td>
										<td>
											{e.persisted
												? <span className="cov live">Site</span>
												: <span className="cov none">Screen</span>}
										</td>
										<td className="muted" style={{ whiteSpace: "normal", minWidth: 220 }}>{e.note || ""}</td>
									</tr>
								))}
							</tbody>
						</table>
					</Scroll>
				) : (
					<Empty title="Nothing decided yet">
						Decisions made on this page appear here, with whether they reached the site.
					</Empty>
				)
			}
		/>
	);
}

export default function Approvals() {
	const s = useApp();
	const t = queueOf(s.apptab);
	const A = s.approvals;

	const tabs = (
		<div className="tabs" role="tablist" aria-label="Approval queues">
			{APPROVALS.map((x) => {
				const n = (A[x.k] || []).length;
				return (
					<button
						key={x.k}
						className="tab"
						{...tabProps("apptab-" + x.k, "appqueue", s.apptab === x.k)}
						onClick={() =>
							// A selection made on one queue means nothing on the next one.
							set({ apptab: x.k, appsel: new Set(), appmsg: "", appq: "", othf: {}, othmsg: "" })
						}
					>
						{x.l} <span className={"n " + (n ? "hot" : "")}>{n}</span>
					</button>
				);
			})}
		</div>
	);

	// The Other queue is Factor HR's grid screen, toolbar and all, so it replaces
	// the card toolbar rather than sitting under it.
	if (t.view === "grid") {
		return (
			<>
				{tabs}
				<div className="flex flex-col gap-[1.1rem] min-w-0" {...panelProps("appqueue", "apptab-" + s.apptab)}>
					<OtherGrid t={t} />
					<Dialogs t={t} shown={otherRows(s, t, otherCols(s))} />
				</div>
			</>
		);
	}

	const rows = A[t.k] || [];
	const shown = qFilter(s, rows);

	/* Grouped the way the toolbar says. Employee Wise is Factor HR's default and
	   the one that matches how approving actually happens — an approver decides
	   about a person, not about a row. Reporting Manager Wise is the one that
	   matters most here: it is the queue an approver actually owns. */
	const groups = new Map();
	shown.forEach((r) => {
		const k = groupKey(s, r, t);
		if (!groups.has(k)) groups.set(k, []);
		groups.get(k).push(r);
	});

	return (
		<>
			{tabs}
			<div className="flex flex-col gap-[1.1rem] min-w-0" {...panelProps("appqueue", "apptab-" + s.apptab)}>
			<QToolbar total={rows.length} shown={shown} />

			{!shown.length ? (
				<Empty title="Nothing waiting">
					{rows.length ? (
						<>Nothing matches “{s.appq}”. {rows.length} waiting in all.</>
					) : (
						t.empty
					)}
				</Empty>
			) : (
				[...groups.entries()].map(([k, g]) => (
					<div className="person" key={k || "none"}>
						<div className="who">
							<GroupHead k={k} rows={g} t={t} />
						</div>
						{g.map((r) => (
							<RequestRow key={reqId(r)} r={r} t={t} />
						))}
					</div>
				))
			)}

			<Dialogs t={t} shown={shown} />
			</div>

		</>
	);
}
