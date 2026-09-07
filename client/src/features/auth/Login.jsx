/** Sign in — a Frappe session on the site, as the person's own ERPNext user.
 *  Everything the dashboard reads and writes afterwards runs under that
 *  user's roles, which is the whole security model now that there is no
 *  proxy in between. */

import { useState } from "react";
import { login } from "@/api/client";
import { set } from "@/store";

export default function Login() {
	const [usr, setUsr] = useState("");
	const [pwd, setPwd] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");

	const submit = async (e) => {
		e.preventDefault();
		if (!usr || !pwd || busy) return;
		setBusy(true);
		setErr("");
		try {
			const user = await login(usr.trim(), pwd);
			setPwd("");
			set({ user: user === "Guest" ? "" : user });
		} catch (ex) {
			setErr(ex.status === 401 ? "Wrong user or password." : ex.message || "Could not sign in.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="login">
			<form className="loginbox" onSubmit={submit} noValidate>
				{/* The same two elements the rail's wordmark is built from, so the
				    door to the app and the app itself are the same mark. `.loginbox`
				    resets what belongs to the rail — see index.css. */}
				<div className="brand">
					<span className="mark" aria-hidden="true">
						<span className="o">M</span><span className="c">H</span>
					</span>
					<span className="brandtext">
						<b>Manna HR</b>
						<small>Group HRMS</small>
					</span>
				</div>
				<h1>Sign in</h1>
				<p className="muted">Use your ERPNext user. The dashboard reads and writes as you.</p>
				<label className="lvf">
					<span className="lab">Email / user id</span>
					<span className="ctl">
						<input type="text" autoComplete="username" autoFocus value={usr}
							onChange={(e) => setUsr(e.target.value)} disabled={busy} />
					</span>
				</label>
				<label className="lvf">
					<span className="lab">Password</span>
					<span className="ctl">
						<input type="password" autoComplete="current-password" value={pwd}
							onChange={(e) => setPwd(e.target.value)} disabled={busy} />
					</span>
				</label>
				{err ? <div className="gap" role="alert">{err}</div> : null}
				<button type="submit" className="btn tpl" disabled={busy || !usr || !pwd}>
					{busy ? "Signing in…" : "Sign in"}
				</button>
			</form>
		</div>
	);
}
