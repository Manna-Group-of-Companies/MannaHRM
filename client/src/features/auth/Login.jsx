/** Sign in — a Frappe session on the site, as the person's own ERPNext user.
 *  Everything the dashboard reads and writes afterwards runs under that
 *  user's roles, which is the whole security model now that there is no
 *  proxy in between. */

import { useState } from "react";
import { login } from "@/api/client";
import { set } from "@/store";
import mannaLogo from "@/assets/manna-logo.png";

export default function Login() {
	const [usr, setUsr] = useState("");
	const [pwd, setPwd] = useState("");
	/* The eye on the password box (17 October 2026): shows what was typed, so
	   a long password can be checked before Sign in rather than refused after. */
	const [show, setShow] = useState(false);
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
				{/* Its own class, not the rail's `.brand`: the rail's narrow-screen
				    rules hide `.brandtext` wherever it is, which took the logo off
				    this card on a tablet. */}
				<div className="loginbrand">
					<img className="brandlogo" src={mannaLogo} alt="Manna Group" />
					<small>HRMS</small>
				</div>
				<h1>Sign in</h1>
				<label className="lvf">
					<span className="lab">Email / user id</span>
					<span className="ctl">
						<input type="text" autoComplete="username" autoFocus value={usr}
							onChange={(e) => setUsr(e.target.value)} disabled={busy} />
					</span>
				</label>
				<div className="lvf">
					<label className="lab" htmlFor="login-pwd">Password</label>
					<span className="ctl pwdbox">
						<input id="login-pwd" type={show ? "text" : "password"} autoComplete="current-password" value={pwd}
							onChange={(e) => setPwd(e.target.value)} disabled={busy} />
						<button type="button" className="pwdeye" aria-pressed={show} disabled={busy}
							aria-label={show ? "Hide password" : "Show password"} title={show ? "Hide password" : "Show password"}
							onClick={() => setShow(!show)}>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
								<circle cx="12" cy="12" r="3" />
								{show ? <path d="M4 4l16 16" /> : null}
							</svg>
						</button>
					</span>
				</div>
				{err ? <div className="gap" role="alert">{err}</div> : null}
				<button type="submit" className="btn tpl" disabled={busy || !usr || !pwd}>
					{busy ? "Signing in…" : "Sign in"}
				</button>
			</form>
		</div>
	);
}
