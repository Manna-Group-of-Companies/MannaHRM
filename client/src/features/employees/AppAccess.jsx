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
const allowPhone = (employee) => apiCall("manna_hr.appaccess_site.allow_phone_punch", { employee });

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

	async function phoneOn() {
		setAsk(null);
		setBusy("phone");
		try {
			const data = await allowPhone(emp);
			setSt({ state: "ok", data, err: "" });
			toast("Phone punch allowed.");
		} catch (e) {
			toast(why(e));
		}
		setBusy("");
	}

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
	const { login, why: locked, apps, phone } = st.data || {};
	const phoneCard = phone ? (
		<PhonePunch phone={phone} locked={login ? locked : ""} busy={busy === "phone"} onAsk={() => setAsk({ key: "phone" })} />
	) : null;
	const phoneAsk = ask?.key === "phone" ? (
		<KitModal title="Allow phone punch?" onClose={() => setAsk(null)}>
			<form noValidate onSubmit={(e) => { e.preventDefault(); void phoneOn(); }}>
				<ul style={{ margin: "0 0 12px", paddingLeft: 18, lineHeight: 1.6 }}>
					<li>Punch Method: <b>{phone.method || "not set"}</b> → <b>{phone.method === "Mobile App" ? "Mobile App" : "Both"}</b>. The machine keeps working.</li>
					{phone.make_login ? (
						<li>A new login <b>{phone.login}</b> is made with the Employee role. They sign in to the Manna HR app with <b>{phone.sign_in_as}</b> and their date of birth (DDMMYYYY), and choose a new password the first time.</li>
					) : (
						<li>Their login <b>{phone.login}</b> is linked. Its user name and password are not changed: they sign in as <b>{phone.sign_in_as}</b> with their own password.</li>
					)}
				</ul>
				<ModalFoot ok="Allow phone punch" onCancel={() => setAsk(null)} busy={busy === "phone"} />
			</form>
		</KitModal>
	) : null;
	if (!login) {
		return (
			<div>
				{phoneCard}
				<EmptyState title="No login">This employee has no login on the site.</EmptyState>
				{phoneAsk}
			</div>
		);
	}

	return (
		<div>
			{phoneCard}
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
			{phoneAsk}
			{ask && ask.key !== "phone" ? (
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

/** Phone punch (25 November 2026, asked for by HR): somebody who punches on
    the machine can punch on the phone as well. What it needs and what it does
    are the site's answer (manna_hr/appaccess.py phone_punch); this draws it
    and offers the one button. */
function PhonePunch({ phone, locked, busy, onAsk }) {
	const { on, method, sign_in_as: as, problems = [], warnings = [] } = phone;
	return (
		<section aria-label="Phone punch" style={{ border: "1px solid rgb(var(--line))", borderRadius: 14, padding: "14px 16px", margin: "0 0 16px" }}>
			<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
				<div style={{ flex: "1 1 220px" }}>
					<b>Phone punch</b>{" "}
					{on ? <Pill status="Active">On · {method}</Pill> : <Pill status="Suspended">Off</Pill>}
					<small style={{ display: "block", color: "rgb(var(--ink-3))", marginTop: 4 }}>
						{on
							? <>Signs in to the Manna HR app as <b>{as}</b>.</>
							: <>Punches on <b>{method || "nothing set"}</b>.</>}
					</small>
				</div>
				{on || locked ? null : (
					<button type="button" className="k-btn k-btn-sm k-btn-ink" disabled={busy || problems.length > 0} onClick={onAsk}>
						{busy ? "Allowing…" : "Allow phone punch too"}
					</button>
				)}
			</div>
			{!on && problems.length ? (
				<ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "rgb(var(--bad))" }}>
					{problems.map((p) => <li key={p}>{p}</li>)}
				</ul>
			) : null}
			{warnings.length ? (
				<ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "rgb(var(--ink-3))" }}>
					{warnings.map((w) => <li key={w}>{w}</li>)}
				</ul>
			) : null}
		</section>
	);
}

/** The Who card's Apps row: the names of the apps this login opens, from the
    same answer the Apps & access tab draws. Empty for a login with none. */
export function AppNames({ emp }) {
	const [names, setNames] = useState(null);
	useEffect(() => {
		let dead = false;
		setNames(null);
		loadAccess(emp)
			.then((d) => {
				if (dead) return;
				const on = (d?.apps || []).filter((a) => a.on && a.key !== "login");
				setNames(d?.login ? on.map((a) => a.label) : []);
			})
			.catch(() => { if (!dead) setNames(undefined); });
		return () => { dead = true; };
	}, [emp]);
	if (names === undefined) return null;
	return (
		<div className="profield long">
			<span className="k">Apps</span>
			<span className={names && names.length ? "v" : "v off"}>
				{names === null ? "…" : names.length ? names.join(" · ") : "none"}
			</span>
		</div>
	);
}
