import { useEffect, useState } from "react";
import { set } from "@/store";
import { NEW_EMP_BLANK } from "@/lib/newemp";
import { go } from "@/routes/router";
import { apiCall } from "@/api/client";
import { dmy, initials } from "@/lib/format";
import { NAME, NUMBER, formLinkFor, isFormLink, shareText, submittedBy, whatsappLink } from "@/lib/formshare";
import { GOOGLE_CLIENT_ID, JOINING_FORM, JOINING_SHEET, loadGoogle, readGoogleSheet } from "@/lib/googlesheet";

/* The joining Form's pre-filled link; a build can name another
   (VITE_EMPLOYEE_FORM), and a link pasted at the prompt lasts the session —
   not localStorage, which lib/mode.js alone owns. */
let formLink = import.meta.env.VITE_EMPLOYEE_FORM || JOINING_FORM;

function askFormLink() {
	const got = window.prompt(`Google Form pre-filled link (Machine number = ${NUMBER}, Full name = ${NAME})`, formLink);
	if (got == null) return "";
	if (!isFormLink(got)) {
		window.alert(`That is not a Google Form pre-filled link with ${NUMBER} in it.`);
		return "";
	}
	formLink = got.trim();
	return formLink;
}

function shareForm(r) {
	const link = formLink || askFormLink();
	if (!link) return;
	const name = r.name_on_device || "";
	const text = shareText({ pin: r.pin, name, company: r.company }, formLinkFor(link, { pin: r.pin, name }));
	window.open(whatsappLink(text), "_blank", "noopener");
}

/* ---------------------------------------------------------------------------
   New on the machine — somebody enrolled on a fingerprint machine whom no
   Employee carries yet. Their punches wait on the site (`adms_site.py`), HR is
   notified once, and the notification opens this page. Creating the Employee
   with the machine number is what delivers the waiting punches: the site does
   that on save, not this file.
   --------------------------------------------------------------------------- */

/** Create Employee with what the machine knows, and the first punch as the
    date of joining — the earliest day anybody can say they were at work. */
export function toWizardFromMachine(r) {
	const blank = NEW_EMP_BLANK();
	set({ newemp: { ...blank, f: {
		...blank.f,
		company: r.company || "",
		custom_punch_method: "Fingerprint Machine",
		attendance_device_id: r.pin,
		first_name: r.first_name || "",
		last_name: r.last_name || "",
		date_of_joining: String(r.first || "").slice(0, 10),
	} } });
	go({ section: "employees", subtab: "new" });
}

export default function NewOnMachine() {
	const [st, setSt] = useState({ state: "loading", rows: [], err: "" });
	/* Who has sent the form back, read from its Sheet on a click: reading it
	   signs in to Google, and a popup outside a click is blocked. */
	const [sent, setSent] = useState({ state: "unread", by: {}, err: "" });
	useEffect(() => { if (GOOGLE_CLIENT_ID) loadGoogle().catch(() => {}); }, []);
	const checkForm = () => {
		setSent({ state: "reading", by: {}, err: "" });
		readGoogleSheet(JOINING_SHEET).then(
			(rows) => setSent({ state: "ok", by: submittedBy(rows), err: "" }),
			(e) => setSent({ state: "error", by: {}, err: String(e?.message || e) }),
		);
	};

	useEffect(() => {
		let dead = false;
		apiCall("manna_hr.adms_site.new_on_machine")
			.then((rows) => { if (!dead) setSt({ state: "ok", rows: Array.isArray(rows) ? rows : [], err: "" }); })
			.catch((e) => { if (!dead) setSt({ state: "error", rows: [], err: String(e?.message || e) }); });
		return () => { dead = true; };
	}, []);

	/* A site without the app has nobody waiting either — the list is the app's. */
	if (st.state === "error" && /not installed/i.test(st.err)) return null;
	if (st.state === "error") return <div className="onbmsg">New on the machine could not be read: {st.err}</div>;
	if (!st.rows.length) return null;

	return (
		<section aria-label="New on the machine">
			<header>
				<h3>New on the machine</h3>
				<span className="n">{st.rows.length}</span>
				<button className="embtn ml-auto" onClick={checkForm} disabled={sent.state === "reading" || !GOOGLE_CLIENT_ID}>
					{sent.state === "reading" ? "Checking…" : sent.state === "ok" ? "Check again" : "Check form"}
				</button>
			</header>
			{sent.state === "error" ? <div className="onbmsg">The form's responses could not be read: {sent.err}</div> : null}
			<div className="onblist">
				{st.rows.map((r) => {
					const who = r.name_on_device || `Machine no. ${r.pin}`;
					const back = sent.by[String(r.pin).trim()];
					return (
						<article className="onbcard" key={`${r.attendance_device}-${r.pin}`}>
							<div className="top">
								<i className="onbav" aria-hidden="true">{initials(who)}</i>
								<span className="who">
									<b>{who}</b>
									<span className="sub">
										{[r.device_name, `No. ${r.pin}`, `${r.punches} punch(es) since ${dmy(String(r.first).slice(0, 10))}`].join(" · ")}
									</span>
								</span>
								<span className="cov part">Waiting</span>
								{sent.state === "ok" ? (back
									? <span className="cov live" title={back.name}>Form submitted {dmy(back.at.slice(0, 10))} {back.at.slice(11)}</span>
									: <span className="cov none">Form not submitted</span>) : null}
								<button className="embtn ml-auto"
									aria-label={`Share the form on WhatsApp, no. ${r.pin}`}
									onClick={() => shareForm(r)}>
									Share form
								</button>
								<button className="embtn pri"
									aria-label={`Create Employee for machine no. ${r.pin}`}
									onClick={() => toWizardFromMachine(r)}>
									Create Employee
								</button>
							</div>
						</article>
					);
				})}
			</div>
		</section>
	);
}
