/** Download report: the eleven attendance reports as Excel or PDF, from one
 *  dialog (21 October 2026). What each reads is features/attendance/reportrun.js.
 *
 *  A login sees only the reports its own menu gave it a page for — the four
 *  company logins keep their five and are offered nothing else.
 */

import { useState } from "react";
import { useApp } from "@/store";
import { allowedFor } from "@/data/menus";
import { dmy, todayIso } from "@/lib/format";
import KitIcon from "@/components/kit/KitIcon";
import { Seg } from "@/components/kit/ui";
import { KitModal } from "@/components/kit/overlay";
import { ATT_REPORTS, askFor, runReport } from "@/features/attendance/reportrun";

/** The reports this login may download: those its attendance menu names, or
    all of them where its menu is the whole module. */
export function reportsFor(user, admin) {
	const only = allowedFor("attendance", user, admin);
	return ATT_REPORTS.filter((r) => !only || only.includes(r[0]));
}

function DownloadDialog({ onClose }) {
	const s = useApp();
	const list = reportsFor(s.user, s.admin);
	const [key, setKey] = useState(list[0]?.[0] || "");
	const [kind, setKind] = useState("Excel");
	const [ask, setAsk] = useState(askFor);
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState({ ok: true, text: "" });
	const row = list.find((r) => r[0] === key);
	const asks = row?.[2] || "none";
	const put = (k) => (e) => { setAsk({ ...ask, [k]: e.target.value }); setMsg({ ok: true, text: "" }); };

	const submit = async (e) => {
		e.preventDefault();
		if (!row) return;
		setBusy(true);
		setMsg({ ok: true, text: "" });
		try {
			setMsg({ ok: true, text: await runReport(key, kind, ask) });
		} catch (x) {
			setMsg({ ok: false, text: String(x?.message || x) });
		} finally {
			setBusy(false);
		}
	};

	return (
		<KitModal title="Download report" sub="Pick a report and its dates, then Excel or PDF." onClose={onClose}>
			<form onSubmit={submit} noValidate>
				<div className="k-form-grid">
					<div className="k-field k-full">
						<label htmlFor="dlr-report">Report</label>
						<select id="dlr-report" className="k-sel" value={key} onChange={(e) => { setKey(e.target.value); setMsg({ ok: true, text: "" }); }}>
							{list.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
						</select>
					</div>
					{asks === "range" ? (
						<>
							<div className="k-field">
								<label htmlFor="dlr-from">From</label>
								<input id="dlr-from" className="k-inp" type="date" value={ask.from} onChange={put("from")} />
							</div>
							<div className="k-field">
								<label htmlFor="dlr-to">To</label>
								<input id="dlr-to" className="k-inp" type="date" value={ask.to} onChange={put("to")} />
							</div>
						</>
					) : asks === "day" || asks === "week" ? (
						<div className="k-field k-full">
							<label htmlFor="dlr-day">{asks === "week" ? "Any day in the week" : "Date"}</label>
							<input id="dlr-day" className="k-inp" type="date" value={ask.day} onChange={put("day")} />
						</div>
					) : (
						<p className="k-muted k-full" style={{ margin: 0 }}>
							{asks === "today" ? `Today, ${dmy(todayIso())} — this report reads today's punches.` : "Everybody, as they stand now."}
						</p>
					)}
					<div className="k-field k-full">
						<label id="dlr-kind">Format</label>
						<div><Seg label="Format" value={kind} options={[["Excel", "Excel"], ["PDF", "PDF"]]} onChange={setKind} /></div>
					</div>
				</div>
				{msg.text ? <p className={msg.ok ? "k-muted" : "k-err"} role="status" style={{ marginTop: 14 }}>{msg.text}</p> : null}
				<div className="k-modal-f">
					<button type="button" className="k-btn k-btn-line" onClick={onClose}>Close</button>
					<button type="submit" className="k-btn k-btn-ink" disabled={busy || !row}>
						<KitIcon name="upload" size={16} stroke={2} />{busy ? "Building…" : "Download"}
					</button>
				</div>
			</form>
		</KitModal>
	);
}

/** The page-head button that opens the dialog — or nothing, for a login that
    may download none of them. */
export default function DownloadReport() {
	const s = useApp();
	const [open, setOpen] = useState(false);
	if (!reportsFor(s.user, s.admin).length) return null;
	return (
		<>
			<button type="button" className="k-btn k-btn-line" onClick={() => setOpen(true)}>
				<KitIcon name="upload" size={18} stroke={2} />Download report
			</button>
			{open ? <DownloadDialog onClose={() => setOpen(false)} /> : null}
		</>
	);
}
