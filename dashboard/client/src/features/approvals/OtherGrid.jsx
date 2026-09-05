import { set, useApp } from "@/store";
import { load } from "@/api/load";
import { otherRows, qExport, reqId, saveApprovals } from "@/features/approvals/queue";
import { dmy } from "@/lib/format";
import { OTHER_BUTTONS, OTHER_TYPES, QSCOPES } from "@/data/approvals";

import { Note, Scroll } from "@/components/ui";

/* ---------------------------------------------------------------------------
   Factor HR's Other queue, which is a different screen from the card queues:
   a grid with a filter box under every heading, an activity-type filter that
   lets one grid serve several kinds of request — Nominee in the screenshot —
   and a "Your Action" per row that is staged rather than applied. Nothing is
   decided until Save Approval Changes, which is a good model and the reason the
   button exists at all.
   --------------------------------------------------------------------------- */

export const otherCols = (s) => [
	["ref", "Reference No.", (r) => r.name || ""],
	["date", "Date", (r) => dmy(r.date || r.attendance_date || r.creation)],
	["employee", "Employee", (r) => {
		const e = s.byName[r.employee] || {};
		return (e.employee_name || r.employee_name || r.employee || "")
			+ (e.employee_number ? ` (${e.employee_number})` : "");
	}],
	["description", "Description", (r) => r.description || r.reason || ""],
	["remarks", "Remarks", (r) => r.remarks || ""],
	["status", "Current Status", (r) => r.status || ""],
	["action", "Your Action", null], // a staged decision, not a value
	["lastby", "Last Action By", (r) => r.decided_by || r.modified_by || r.owner || ""],
];

export default function OtherGrid({ t }) {
	const s = useApp();
	const cols = otherCols(s);
	/* Select-all covers what this grid shows, never rows a filter has hidden —
	   the select-all that quietly includes filtered-out rows is how the wrong
	   person gets approved. */
	const rows = otherRows(s, t, cols);

	const allOn = rows.length > 0 && rows.every((r) => s.appsel.has(reqId(r)));

	/* The five buttons across the top. All five do their job; what Save can
	   reach depends on whether there is a document behind the row and whether
	   the proxy has been started with writes on. */
	const press = (k) => {
		if (k === "refresh") { set({ othmsg: "" }); void load(); return; }
		if (k === "export") { set({ othmsg: qExport(rows) }); return; }
		if (k === "bulk") { set({ appdialog: "bulk", dlgmsg: "" }); return; }
		if (k === "log") { set({ appdialog: "log", dlgmsg: "" }); return; }
		if (k === "save") void saveApprovals();
	};

	const toggleAll = (on) => {
		const next = new Set(s.appsel);
		rows.forEach((r) => (on ? next.add(reqId(r)) : next.delete(reqId(r))));
		set({ appsel: next });
	};

	return (
		<>
			<div className="gbar">
				{OTHER_BUTTONS.map((b) => (
					<button key={b[0]} className="gbtn" onClick={() => press(b[0])}>
						{b[2]} {b[1]}
					</button>
				))}
			</div>

			<div className="gfil">
				<label>
					Filter Activity Type:{" "}
					<select value={s.othtype} onChange={(e) => set({ othtype: e.target.value })}>
						{OTHER_TYPES.map((o) => (
							<option key={o[0]} value={o[0]}>{o[1]}</option>
						))}
					</select>
				</label>
				<label>
					Filter By Period:{" "}
					<select value={s.appscope} onChange={(e) => set({ appscope: e.target.value })}>
						{QSCOPES.map((o) => (
							<option key={o[0]} value={o[0]}>{o[1]}</option>
						))}
					</select>
				</label>
				<span className="muted ml-auto font-mono text-mini">
					{rows.length} shown{s.appsel.size ? ` · ${s.appsel.size} selected` : ""}
				</span>
			</div>

			{s.othmsg ? <Note>{s.othmsg}</Note> : null}

			<Scroll>
				<table className="grid">
					<thead>
						<tr>
							<th>
								<input type="checkbox" aria-label="Select everything shown" checked={allOn}
									onChange={(e) => toggleAll(e.target.checked)} />
							</th>
							{cols.map((c) => (
								<th key={c[0]}>{c[1]}</th>
							))}
						</tr>
						{/* Factor HR puts a filter box under every heading, and so does
						    this: eight independent contains-filters, combined. */}
						<tr className="fil">
							<th />
							{cols.map((c) => (
								<th key={c[0]}>
									<input
										value={s.othf[c[0]] || ""}
										aria-label={"Filter " + c[1]}
										onChange={(e) => set({ othf: { ...s.othf, [c[0]]: e.target.value } })}
									/>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => {
							const id = reqId(r);
							return (
								<tr key={id}>
									<td>
										<input
											type="checkbox"
											aria-label="Select this request"
											checked={s.appsel.has(id)}
											onChange={(e) => {
												const next = new Set(s.appsel);
												if (e.target.checked) next.add(id);
												else next.delete(id);
												set({ appsel: next });
											}}
										/>
									</td>
									{cols.map((c) =>
										c[0] === "action" ? (
											<td key={c[0]}>
												{/* Staged, not applied — Factor HR's model too. Save is the write. */}
												<select
													value={s.othact[id] || ""}
													onChange={(e) =>
														set({ othact: { ...s.othact, [id]: e.target.value }, othmsg: "" })
													}
												>
													{["", "Approve", "Reject"].map((v) => (
														<option key={v} value={v}>{v || "—"}</option>
													))}
												</select>
											</td>
										) : (
											<td key={c[0]} className={c[0] === "description" ? "desc" : undefined}>
												{c[2](r)}
											</td>
										),
									)}
								</tr>
							);
						})}
					</tbody>
				</table>
			</Scroll>

			{/* Factor HR's own wording, and it is better than "no results": it says
			    whose queue is empty, not that nothing exists. */}
			{!rows.length && <div className="nopend">No pending at your end</div>}
		</>
	);
}
