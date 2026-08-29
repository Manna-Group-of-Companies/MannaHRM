import { set, useApp } from "@/state/store";
import { reqId } from "@/sections/approvals/queue";
import { clock, dayOf, dmy, dmyTime, spanOf } from "@/lib/format";
import { READ_ONLY } from "@/data/approvals";

/* The grey strip Factor HR puts above every card: what kind of request it is,
   its document number, and who touched it last. The approver quotes the DocNo
   on the phone, so it is not decoration. */
function ReqHead({ r, kind }) {
	const by = r.decided_by || r.modified_by || r.owner;
	const on = r.decided_on || r.modified || r.creation;
	return (
		<div className="reqhead">
			<span className="kind">{kind}</span>
			<span className="meta">
				DocNo : {r.name || "—"}, Status : {r.status || "—"}, Last Action On :{" "}
				{on ? dmyTime(on) : <span className="muted">—</span>}, Last Action By :{" "}
				{by ? by : <span className="muted">—</span>}
			</span>
		</div>
	);
}

function Pick({ r }) {
	const { appsel } = useApp();
	const id = reqId(r);
	return (
		<input
			type="checkbox"
			aria-label="Select this request"
			checked={appsel.has(id)}
			onChange={(e) => {
				const next = new Set(appsel);
				if (e.target.checked) next.add(id);
				else next.delete(id);
				set({ appsel: next });
			}}
		/>
	);
}

/* Approve and reject are drawn exactly where Factor HR draws them and do not
   act. A tick that silently does nothing would be worse than no tick at all, so
   pressing one says why — deciding a correction writes Employee Checkin rows,
   and that has to happen on the server, not in a page anybody can open.

   Enabled rather than disabled on purpose: a control that reports itself
   disabled never fires, so a screen-reader user would get silence instead of
   the reason. */
function Decide({ r }) {
	const say = (what) => set({ appmsg: `Cannot ${what} ${reqId(r)} from here. ${READ_ONLY}` });
	return (
		<div className="act">
			<div className="yn">
				<button className="ok" title={READ_ONLY} onClick={() => say("approve")}>✓</button>
				<button className="no" title={READ_ONLY} onClick={() => say("reject")}>✕</button>
			</div>
			<span className="link" title="Every field on the request, and its decision trail. Not built.">
				View Details
			</span>
		</div>
	);
}

/* What the employee is actually asking for. Factor HR carries this as its own
   field — "Overtime marking" in the 24 Aug screenshot — and until the doctype
   has one it is inferred from which punch is missing. Inference is shown as
   inference: the label says "inferred" rather than pretending to be the field. */
function correctionFor(r) {
	if (r.correction_for) return [r.correction_for, null];
	const inferred = <span className="muted"> (inferred)</span>;
	if (r.requested_in && r.requested_out) return ["Both punches", inferred];
	if (r.requested_out) return ["Missed punch-out", inferred];
	if (r.requested_in) return ["Missed punch-in", inferred];
	return ["Not stated", null];
}

function AttRow({ r, kind }) {
	const s = useApp();
	const e = s.byName[r.employee] || {};
	const shift = e.default_shift || null;
	const planned = "—"; // the shift window; no Shift Type has times yet
	const worked = spanOf(r.requested_in, r.requested_out);
	const [what, tail] = correctionFor(r);

	return (
		<>
			<ReqHead r={r} kind={kind || "Time Correction"} />
			<div className="reqx">
				<Pick r={r} />
				<div className="day">
					<b>{dmy(r.attendance_date)}</b>
					<span>{dayOf(r.attendance_date || "")}</span>
					<span className="applied">Applied On : {dmy(r.applied_on || r.creation)}</span>
				</div>
				<div>
					<div className="pa">
						<span className="h" />
						<span className="h">Planned</span>
						<span className="h">Attended</span>
						<span className="lab">In</span>
						<span>{planned}</span>
						<span className="att">{clock(r.requested_in)}</span>
						<span className="lab">Out</span>
						<span>{planned}</span>
						<span className="att">{clock(r.requested_out)}</span>
					</div>
					<div className="shift">
						{r.company || e.company || ""}
						{shift ? "-" + shift : <span className="muted"> — no shift set</span>}
					</div>
				</div>
				<div className="hrs">
					Working: <b>{worked || "—"}</b>
					<br />
					Overtime: <b className="muted">needs the shift window</b>
					<br />
					<span className="link" title="The day's Employee Checkin rows, raw. Loaded for today only.">
						Time Log
					</span>
				</div>
				<div className="ask">
					Correction for: <b>{what}</b>
					{tail}
					<br />
					Hours: <b>{r.overtime_hours || "—"}</b>
					<br />
					Reason: <b>{r.reason || "—"}</b>
					<br />
					Remarks: {r.remarks ? r.remarks : <span className="muted">—</span>}
				</div>
				<Decide r={r} />
			</div>
		</>
	);
}

function LeaveRow({ r, kind }) {
	const s = useApp();
	const half = r.half_day ? " · half day" + (r.half_day_date ? " " + dmy(r.half_day_date) : "") : "";
	const approver = r.leave_approver_name || r.leave_approver;

	return (
		<>
			<ReqHead r={r} kind={kind || "Leave Request"} />
			<div className="reqx">
				<Pick r={r} />
				<div className="day">
					<b>{dmy(r.from_date)}</b>
					<span>to {dmy(r.to_date)}</span>
					<span className="applied">Applied On : {dmy(r.posting_date || r.creation)}</span>
				</div>
				<div>
					<div className="pa">
						<span className="h" />
						<span className="h">Days</span>
						<span className="h">Balance</span>
						<span className="lab">Leave</span>
						<span className="att">{r.total_leave_days == null ? "—" : r.total_leave_days}</span>
						<span>{r.leave_balance == null ? "—" : r.leave_balance}</span>
					</div>
					<div className="shift">{r.company || s.byName[r.employee]?.company || ""}</div>
				</div>
				<div className="hrs">
					Type: <b>{(r.leave_type || "—") + half}</b>
					<br />
					Approver: <b>{approver || "not set"}</b>
				</div>
				<div className="ask">
					Reason: <b>{r.description || "—"}</b>
					<br />
					Remarks: <span className="muted">—</span>
				</div>
				<Decide r={r} />
			</div>
		</>
	);
}

/* A queue with rows but no renderer of its own. None of the five unbuilt ones
   can produce rows today, but a queue that silently renders nothing when data
   finally arrives is the failure that goes unnoticed longest. */
function PlainRow({ r, kind }) {
	return (
		<>
			<ReqHead r={r} kind={kind || "Request"} />
			<div className="reqx">
				<Pick r={r} />
				<div className="day">
					<b>{String(r.creation || "").slice(0, 10)}</b>
				</div>
				<div className="ask">{r.name || ""}</div>
				<div />
				<div />
				<Decide r={r} />
			</div>
		</>
	);
}

/** Which card a queue draws. Dispatching on the tab rather than carrying a
    renderer in the data keeps `src/data/approvals.ts` free of JSX — it is a
    field list somebody argues about, not a component. */
export default function RequestRow({ r, t }) {
	if (t.k === "leave") return <LeaveRow r={r} kind={t.kind} />;
	if (t.k === "attendance") return <AttRow r={r} kind={t.kind} />;
	return <PlainRow r={r} kind={t.kind} />;
}
