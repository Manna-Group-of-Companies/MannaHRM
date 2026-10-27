import { useEffect, useState } from "react";
import { set } from "@/store";
import { NEW_EMP_BLANK } from "@/lib/newemp";
import { go } from "@/routes/router";
import { apiCall } from "@/api/client";
import { dmy, initials } from "@/lib/format";

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
			</header>
			<div className="onblist">
				{st.rows.map((r) => {
					const who = r.name_on_device || `Machine no. ${r.pin}`;
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
								<button className="embtn pri ml-auto"
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
