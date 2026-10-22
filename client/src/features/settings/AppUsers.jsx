import { useEffect, useMemo, useState } from "react";

import { useApp } from "@/store";
import { loadAppUsers, setLoginEnabled } from "@/api/appusers";
import { appUserCounts, appUserRows, toggleQuestion, toggleWhy } from "@/lib/appusers";
import { SettingsFrame } from "@/features/settings/SettingsKit";
import { EmptyState, Pill } from "@/components/kit/ui";
import { KitModal, ModalFoot, toast } from "@/components/kit/overlay";

/* SETTINGS → APP USERS (22 October 2026, asked for by HR). Everybody who can
   use the phone app, and Stop / Allow on each: the login switched off or on.
   The rules are lib/appusers.js, which says why the login is the switch. */

const when = (v) => (v ? String(v).slice(0, 16).replace("T", " ") : "—");
const why = (e) => String(e?.message || e || "The site would not do that.").slice(0, 240);

export default function AppUsers() {
	const s = useApp();
	const [data, setData] = useState(undefined);
	const [err, setErr] = useState("");
	const [find, setFind] = useState("");
	const [show, setShow] = useState("all");
	const [ask, setAsk] = useState(null);
	const [busy, setBusy] = useState(false);

	const read = () => loadAppUsers().then((d) => { setData(d); setErr(""); }, (e) => { setData(null); setErr(why(e)); });
	useEffect(() => { void read(); }, []);

	const rows = useMemo(() => (data ? appUserRows({ ...data, me: s.user }) : []), [data, s.user]);
	const n = appUserCounts(rows);
	const q = find.trim().toLowerCase();
	const shown = rows
		.filter((r) => show === "all" || (show === "active" ? r.enabled === true : r.enabled === false))
		.filter((r) => !q || `${r.name} ${r.code} ${r.login} ${r.company}`.toLowerCase().includes(q));

	async function onConfirm(e) {
		e.preventDefault();
		const { row, on } = ask;
		setBusy(true);
		const r = await setLoginEnabled(row.login, on);
		setBusy(false);
		setAsk(null);
		if (!r.ok) return toast(`${row.login} was not changed: ${r.error}`);
		toast(on ? `${row.name} can use the app again` : `${row.name} is stopped from the app`);
		await read();
	}

	return (
		<SettingsFrame>
			<div className="k-card">
				<div className="k-sec-h">
					<h3>App users</h3>
					<button type="button" className="k-btn k-btn-line k-btn-sm" onClick={() => void read()}>Refresh</button>
				</div>

				<div className="k-au-tiles">
					{[["all", "With a login", n.all], ["active", "Active", n.active], ["stopped", "Stopped", n.stopped]].map(([k, l, v]) => (
						<button key={k} type="button" className={show === k ? "k-on" : undefined} aria-pressed={show === k} onClick={() => setShow(k)}>
							<b>{data === undefined ? "…" : v}</b><span>{l}</span>
						</button>
					))}
					<div><b>{data === undefined ? "…" : n.usedApp}</b><span>Punched from the app, last 120 days</span></div>
				</div>

				<div className="k-field" style={{ maxWidth: 360, marginBottom: 12 }}>
					<label htmlFor="au-find">Search</label>
					<input id="au-find" className="k-inp" type="search" placeholder="name, code, login or company" value={find} onChange={(e) => setFind(e.target.value)} />
				</div>

				{data === undefined ? <div className="k-sk" style={{ height: 240 }} /> : data === null ? (
					<EmptyState icon="phone" title="App users could not be read" sub={err} />
				) : !shown.length ? (
					<EmptyState icon="phone" title={rows.length ? "Nobody matches" : "Nobody has a login yet"} sub="" />
				) : (
					<div className="k-tbl-wrap">
						<table className="k-rt" aria-label="App users">
							<thead><tr>{["Employee", "Login", "Last sign-in", "Last app punch", "", ""].map((c, i) => <th key={i}><span>{c}</span></th>)}</tr></thead>
							<tbody>
								{shown.map((r) => {
									const blocked = toggleWhy(r);
									return (
										<tr key={r.employee}>
											<td className="k-title-cell">
												<b>{r.name}</b>
												<small style={{ display: "block", color: "rgb(var(--ink-3))" }}>{r.code} · {r.company}</small>
											</td>
											<td data-label="Login">
												{r.login}
												{r.website ? <small style={{ display: "block", color: "rgb(var(--ink-3))" }}>Also HR on the website</small> : null}
											</td>
											<td data-label="Last sign-in">{when(r.lastSignIn)}</td>
											<td data-label="Last app punch">{when(r.lastAppPunch)}</td>
											<td data-label="">
												{r.enabled === true ? <Pill status="Active" /> : r.enabled === false ? <Pill status="Suspended">Stopped</Pill> : <Pill status="Unknown">Not known</Pill>}
											</td>
											<td data-label="">
												{blocked ? <small style={{ color: "rgb(var(--ink-3))" }} title={blocked}>{r.self ? "You" : "—"}</small> : (
													<button type="button" className={`k-btn k-btn-sm ${r.enabled ? "k-btn-line" : "k-btn-ink"}`}
														aria-label={`${r.enabled ? "Stop" : "Allow"} ${r.name}`} onClick={() => setAsk({ row: r, on: !r.enabled })}>
														{r.enabled ? "Stop" : "Allow"}
													</button>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{ask ? (
				<KitModal title={ask.on ? "Allow the app" : "Stop the app"} onClose={() => { if (!busy) setAsk(null); }}>
					<form noValidate onSubmit={onConfirm}>
						<p style={{ margin: "0 0 12px" }}>{toggleQuestion(ask.row, ask.on)}</p>
						<ModalFoot ok={ask.on ? "Allow" : "Stop"} busy={busy} danger={!ask.on} onCancel={() => setAsk(null)} />
					</form>
				</KitModal>
			) : null}
		</SettingsFrame>
	);
}
