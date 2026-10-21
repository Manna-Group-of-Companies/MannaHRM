/** Sign in — a Frappe session on the site, as the person's own ERPNext user.
 *  Everything the dashboard reads and writes afterwards runs under that
 *  user's roles, which is the whole security model now that there is no
 *  proxy in between.
 *
 *  Drawn as the HRDashboard reference's sign-in page (21 October 2026): the
 *  art panel on the left, the form on the right, only the form on a phone.
 *  Only the look moved — the same `login()` call, an email or a user id, the
 *  same messages. What the reference has and this does not, on purpose:
 *  Remember me (a Frappe session is a cookie the site keeps; there is nothing
 *  here to remember), Create account (sign-up is off), and Google and Apple —
 *  the site has no Social Login Key, and a signed-out visitor cannot ask it
 *  for one, so they would be buttons to nowhere.
 */

import { useState } from "react";
import { apiCall, login } from "@/api/client";
import { set } from "@/store";
import mannaLogo from "@/assets/manna-logo.png";
import KitIcon from "@/components/kit/KitIcon";
import { KitModal } from "@/components/kit/overlay";
import { PRIVACY, TERMS } from "@/data/policies";

/* The art panel's cards say what the app does. The reference's carry a
   headcount and a named person checking in; before sign-in there is no data to
   show, and a made-up person on the door is the one thing this must not do. */
function Art() {
	return (
		<div className="k-auth-art">
			<div className="k-art" aria-hidden="true">
				<div className="k-art-card" style={{ left: "12%", top: "18%" }}>
					<KitIcon name="users" size={18} stroke={2} /><b>Employees</b>every company, one list
				</div>
				<div className="k-art-card" style={{ right: "12%", top: "30%", animationDelay: "-2s" }}>
					<span className="k-pill k-p-green">Approved</span>
					<div style={{ marginTop: 8, fontWeight: 600 }}>Leave request</div>
				</div>
				<div className="k-art-card" style={{ left: "30%", top: "58%", animationDelay: "-4s", display: "flex", gap: 10, alignItems: "center" }}>
					<span className="k-icon-sq"><KitIcon name="clock" size={18} stroke={2} /></span>
					<div><b style={{ fontSize: 14 }}>Checked in</b>at the gate</div>
				</div>
			</div>
			<div className="k-auth-brand"><span className="k-auth-logo"><img src={mannaLogo} alt="Manna Group" /></span>HRMS</div>
			<h2>Let’s empower your employees today.</h2>
			<p>Attendance, time off and payroll in one place.</p>
		</div>
	);
}

/** The footer's two documents, both drafts for HR to review (D18). */
function Doc({ title, rows, onClose }) {
	return (
		<KitModal title={title} wide onClose={onClose}>
			<p className="k-muted" style={{ margin: "0 0 8px" }}>Draft — HR to review</p>
			<div className="k-prose">{rows.map(([h, p]) => <div key={h}><h3>{h}</h3><p>{p}</p></div>)}</div>
			<div className="k-modal-f"><button type="button" className="k-btn k-btn-ink" onClick={onClose}>Close</button></div>
		</KitModal>
	);
}

function Foot() {
	const [doc, setDoc] = useState("");
	return (
		<div className="k-auth-foot">
			<span>© {new Date().getFullYear()} Manna Group. All rights reserved.</span>
			<span style={{ display: "flex", gap: 16 }}>
				<button type="button" onClick={() => setDoc("terms")}>Terms &amp; Conditions</button>
				<button type="button" onClick={() => setDoc("privacy")}>Privacy Policy</button>
			</span>
			{doc === "terms" ? <Doc title="Terms & Conditions" rows={TERMS} onClose={() => setDoc("")} /> : null}
			{doc === "privacy" ? <Doc title="Privacy Policy" rows={PRIVACY} onClose={() => setDoc("")} /> : null}
		</div>
	);
}

function Err({ children }) {
	return <div className="k-auth-err" role="alert"><KitIcon name="info" size={18} stroke={2} />{children}</div>;
}

/* The site's own reset: Frappe mails a link to the address on the account, and
   its page sets the new password. Its answers, said in words. */
const RESET_SAID = {
	404: "No account with that email or user id.",
	429: "Too many reset requests. Try again in an hour.",
};
const RESET_REPLY = {
	disabled: "That account is disabled. Ask IT to enable it.",
	"not allowed": "This account’s password can’t be reset here.",
	"not found": RESET_SAID[404],
};

function Forgot({ usr, onBack }) {
	const [who, setWho] = useState(usr);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const [sent, setSent] = useState(false);

	const submit = async (e) => {
		e.preventDefault();
		const user = who.trim();
		if (!user || busy) return;
		setBusy(true);
		setErr("");
		try {
			const reply = await apiCall("frappe.core.doctype.user.user.reset_password", { user });
			if (typeof reply === "string" && RESET_REPLY[reply]) setErr(RESET_REPLY[reply]);
			else setSent(true);
		} catch (ex) {
			setErr(RESET_SAID[ex.status] || ex.message || "Could not send the reset link.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<button type="button" className="k-back" style={{ fontSize: 14, marginBottom: 24 }} onClick={onBack}>
				<KitIcon name="left" size={18} stroke={2} />Back to login
			</button>
			{sent ? (
				<>
					<h1>Check your email</h1>
					<p className="k-lead">A link to set a new password is on its way to the email on that account.</p>
					<button type="button" className="k-btn k-btn-ink k-btn-big" style={{ width: "100%", justifyContent: "center" }} onClick={onBack}>
						Back to login
					</button>
				</>
			) : (
				<>
					<h1>Forgot password?</h1>
					<p className="k-lead">Enter your email and we’ll send you a link to reset it.</p>
					{err ? <Err>{err}</Err> : null}
					<form onSubmit={submit} noValidate>
						<div className="k-field">
							<label htmlFor="fp-user">Email Address</label>
							<input id="fp-user" className="k-inp" type="text" autoComplete="username" autoFocus value={who}
								onChange={(e) => setWho(e.target.value)} disabled={busy} />
						</div>
						<button type="submit" className="k-btn k-btn-ink k-btn-big" style={{ width: "100%", justifyContent: "center" }}
							disabled={busy || !who.trim()}>
							{busy ? "Sending…" : "Send reset link"}
						</button>
					</form>
				</>
			)}
		</>
	);
}

export default function Login() {
	const [usr, setUsr] = useState("");
	const [pwd, setPwd] = useState("");
	const [show, setShow] = useState(false);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const [forgot, setForgot] = useState(false);

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
		<div className="kit">
			{/* The window's height, on the element: kit.css is unlayered, so its
			    `min-height: 100%` wins over any rule in index.css's layers. */}
			<div className="k-auth" style={{ minHeight: "100dvh" }}>
				<Art />
				<div className="k-auth-form">
					<div className="k-auth-box">
						{/* The art panel, and the logo on it, is not drawn on a phone. */}
						<div className="k-auth-mlogo"><span className="k-auth-logo"><img src={mannaLogo} alt="Manna Group" /></span></div>
						{forgot ? <Forgot usr={usr} onBack={() => setForgot(false)} /> : (
							<>
								<h1>Login first to your account</h1>
								<p className="k-lead">Welcome back! Please enter your details.</p>
								{err ? <Err>{err}</Err> : null}
								<form onSubmit={submit} noValidate>
									<div className="k-field">
										<label htmlFor="li-user">Email Address</label>
										{/* `text`, not `email`: a user id is a sign-in too. */}
										<input id="li-user" className="k-inp" type="text" autoComplete="username" autoFocus value={usr}
											onChange={(e) => setUsr(e.target.value)} disabled={busy} />
									</div>
									<div className="k-field">
										<label htmlFor="li-pass">Password</label>
										<div className="k-pw">
											<input id="li-pass" className="k-inp" type={show ? "text" : "password"} autoComplete="current-password"
												value={pwd} onChange={(e) => setPwd(e.target.value)} disabled={busy} />
											<button type="button" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
												onClick={() => setShow(!show)}>
												<KitIcon name={show ? "eyeoff" : "eye"} size={18} stroke={2} />
											</button>
										</div>
									</div>
									<div className="k-auth-row" style={{ justifyContent: "flex-end" }}>
										<button type="button" className="k-link" onClick={() => { setErr(""); setForgot(true); }}>Forgot password</button>
									</div>
									<button type="submit" className="k-btn k-btn-ink k-btn-big" style={{ width: "100%", justifyContent: "center" }}
										disabled={busy || !usr || !pwd}>
										{busy ? "Signing in…" : "Login"}
									</button>
								</form>
							</>
						)}
					</div>
					<Foot />
				</div>
			</div>
		</div>
	);
}
