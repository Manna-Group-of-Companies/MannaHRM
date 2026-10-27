import { useEffect, useState } from "react";

import { apiCall } from "@/api/client";
import { EmptyState, Pill } from "@/components/kit/ui";
import { KitModal, ModalFoot, toast } from "@/components/kit/overlay";

/* Employee Profile → Apps & access (27 October 2026, asked for by HR): every
   app this person's one ERPNext login opens, each with its own switch. What a
   switch writes, and who may flip it, is decided by the site —
   manna_hr/appaccess.py — so this page only asks and draws the answer. Shown to
   HR Manager and System Manager alone (`can_manage`). */

const why = (e) => String(e?.message || e || "The site would not do that.").slice(0, 240);

export const loadAccess = (employee) => apiCall("manna_hr.appaccess_site.get_access", { employee });
const setAccess = (employee, key, value) => apiCall("manna_hr.appaccess_site.set_access", { employee, key, value });

const optLabel = (o) => (typeof o === "string" ? o : o.label);
const optValue = (o) => (typeof o === "string" ? o : o.value);

export default function AppAccess({ emp }) {
	const [st, setSt] = useState({ state: "loading", data: null, err: "" });
	const [busy, setBusy] = useState("");
	const [ask, setAsk] = useState(null);

	useEffect(() => {
		let dead = false;
		setSt({ state: "loading", data: null, err: "" });
		loadAccess(emp)
			.then((data) => { if (!dead) setSt({ state: "ok", data, err: "" }); })
			.catch((e) => { if (!dead) setSt({ state: "error", data: null, err: why(e) }); });
		return () => { dead = true; };
	}, [emp]);

	async function change(key, value) {
		setAsk(null);
		setBusy(key);
		try {
			const data = await setAccess(emp, key, value);
			setSt({ state: "ok", data, err: "" });
			toast("Access changed.");
		} catch (e) {
			toast(why(e));
		}
		setBusy("");
	}

	if (st.state === "loading") return <EmptyState title="Reading access…" />;
	if (st.state === "error") return <EmptyState title="Access could not be read">{st.err}</EmptyState>;
	const { login, why: locked, apps } = st.data || {};
	if (!login) return <EmptyState title="No login">This employee has no login on the site.</EmptyState>;

	return (
		<div>
			<p style={{ margin: "0 0 12px" }}><b>{login}</b>{locked ? <small style={{ display: "block", color: "rgb(var(--ink-3))" }}>{locked}</small> : null}</p>
			<table className="k-rt" aria-label="Apps & access">
				<thead><tr>{["App", "Access", ""].map((c, i) => <th key={i}><span>{c}</span></th>)}</tr></thead>
				<tbody>
					{apps.map((a) => {
						const fixed = a.kind === "desk" || a.kind === "follows_login";
						const chosen = a.options.find((o) => optValue(o) === a.value);
						return (
							<tr key={a.key}>
								<td className="k-title-cell"><b>{a.label}</b></td>
								<td data-label="Access">
									{a.on ? <Pill status="Active">On{chosen ? ` · ${optLabel(chosen)}` : ""}</Pill> : <Pill status="Suspended">Off</Pill>}
								</td>
								<td data-label="">
									{locked || fixed ? null : a.options.length ? (
										<select aria-label={`${a.label} access`} value={a.value} disabled={busy === a.key}
											onChange={(e) => change(a.key, e.target.value)}>
											<option value="">Off</option>
											{a.options.map((o) => <option key={optValue(o)} value={optValue(o)}>{optLabel(o)}</option>)}
										</select>
									) : (
										<button type="button" className={`k-btn k-btn-sm ${a.on ? "k-btn-line" : "k-btn-ink"}`}
											aria-label={`${a.on ? "Turn off" : "Turn on"} ${a.label}`} disabled={busy === a.key}
											onClick={() => (a.key === "login" && a.on ? setAsk(a) : change(a.key, !a.on))}>
											{a.on ? "Turn off" : "Turn on"}
										</button>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			{ask ? (
				<KitModal title="Turn off the login?" onClose={() => setAsk(null)}>
					<form noValidate onSubmit={(e) => { e.preventDefault(); void change("login", false); }}>
						<p style={{ margin: "0 0 12px" }}>{login} will be signed out of every app and website.</p>
						<ModalFoot ok="Turn off" danger onCancel={() => setAsk(null)} busy={busy === "login"} />
					</form>
				</KitModal>
			) : null}
		</div>
	);
}
