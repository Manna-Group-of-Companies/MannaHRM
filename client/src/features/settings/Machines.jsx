import { useEffect, useState } from "react";

import { loadMachines } from "@/api/machines";
import { machineRows } from "@/lib/machines";
import { SettingsFrame } from "@/features/settings/SettingsKit";
import { EmptyState, Pill } from "@/components/kit/ui";

/* SETTINGS → MACHINES (2 November 2026, asked for by HR): every fingerprint
   machine, whether it is on ADMS or the bridge, and when each was last heard
   from. Which road is which is lib/machines.js. */

const when = (v) => (v ? String(v).slice(0, 16).replace("T", " ") : "—");
const PILL = { ADMS: "Active", Bridge: "Pending", Quiet: "Suspended" };

export default function Machines() {
	const [data, setData] = useState(undefined);
	const [err, setErr] = useState("");
	const [now, setNow] = useState(() => new Date());

	const read = () => loadMachines().then(
		(d) => { setData(d); setErr(""); setNow(new Date()); },
		(e) => { setData(null); setErr(String(e?.message || e)); },
	);
	useEffect(() => {
		void read();
		const t = setInterval(() => void read(), 60000);
		return () => clearInterval(t);
	}, []);

	const rows = data ? machineRows(data.devices, data.last, now) : [];

	return (
		<SettingsFrame>
			<div className="k-card">
				<div className="k-sec-h">
					<h3>Machines</h3>
					<button type="button" className="k-btn k-btn-line k-btn-sm" onClick={() => void read()}>Refresh</button>
				</div>
				{data === undefined ? <EmptyState title="Reading machines…" /> : null}
				{err ? <EmptyState title="Machines could not be read">{err}</EmptyState> : null}
				{data && !rows.length ? <EmptyState title="No machines registered" /> : null}
				{rows.length ? (
					<div className="k-tbl-wrap">
					<table className="k-rt" aria-label="Machines">
						<thead>
							<tr>{["Machine", "Company", "Connection", "ADMS last seen", "Last punch", "Reached site"].map((c) => <th key={c}><span>{c}</span></th>)}</tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.name}>
									<td className="k-title-cell"><b>{r.name}</b><small style={{ display: "block", color: "rgb(var(--ink-3))" }}>{r.deviceId}</small></td>
									<td data-label="Company">{r.company || "—"}</td>
									<td data-label="Connection"><Pill status={PILL[r.route]}>{r.route}</Pill></td>
									<td data-label="ADMS last seen">{when(r.lastSeen)}</td>
									<td data-label="Last punch">{when(r.lastPunch)}</td>
									<td data-label="Reached site">{when(r.reached)}</td>
								</tr>
							))}
						</tbody>
					</table>
					</div>
				) : null}
			</div>
		</SettingsFrame>
	);
}
