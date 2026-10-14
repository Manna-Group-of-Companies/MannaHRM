import { useEffect, useState } from "react";
import { useApp } from "@/store";
import { deskUrl } from "@/lib/desk";
import { dmy } from "@/lib/format";
import { CRITERIA_FIELDS, criteriaOf, hasCriteria } from "@/lib/resumescore";
import { ACCEPT } from "@/lib/resumetext";
import { openingFor } from "@/lib/vacancy";
import {
	DETAIL_FIELD, SOURCES, addApplicant, createOpening, ensureSources, loadApplicants,
	problemOf, readCriteriaNote, readResume, removeApplicant, rescore, saveCriteria, storedScore,
} from "@/api/recruitment";
import { Empty, Modal, Scroll } from "@/components/ui";

/* ---------------------------------------------------------------------------
   Resumes for one open seat on the hierarchy chart (12 October 2026).

   Opened from the seat's card on Employees → Hierarchy Chart → a company —
   HR asked for resumes to be added there, on the vacancy, rather than on a
   page of their own. The seat's Job Opening is made here the first time
   (lib/vacancy.js names it); after that this is the opening's criteria, the
   resumes being added, and everybody who has applied, best score first.

   The score is lib/resumescore.js and the writes are api/recruitment.js.
   --------------------------------------------------------------------------- */

const BLANK = { must: "", good: "", experience: "", qualification: "", location: "" };

/* A position that never set a minimum reads back as 0, which is a box
   showing "0" that nobody typed; it is drawn empty. */
const draftOf = (o) => Object.fromEntries(Object.entries(CRITERIA_FIELDS)
	.map(([k, f]) => [k, k === "experience" && !Number(o?.[f]) ? "" : o?.[f] ?? ""]));

const sameDraft = (a, b) => Object.keys(BLANK).every((k) => String(a[k] ?? "").trim() === String(b[k] ?? "").trim());

const band = (score) => (score == null ? "" : score >= 7 ? "hi" : score >= 4 ? "mid" : "lo");

function Score({ score }) {
	if (score == null) return <span className="rscore none">Not scored</span>;
	return (
		<span className={"rscore " + band(score)}>
			<i aria-hidden="true"><b style={{ width: `${score * 10}%` }} /></i>
			<span className="v">{score.toFixed(1)}</span><span className="of">/10</span>
		</span>
	);
}

function Why({ text }) {
	if (!text) return null;
	return <ul className="rwhy">{String(text).split("\n").map((l) => <li key={l}>{l}</li>)}</ul>;
}

/**
 * @param {{seat: object, openings: object[], criteriaOk: boolean,
 *          onOpenings: () => Promise<void>, onClose: () => void}} props
 *   `seat` is lib/vacancy.js's; `onOpenings` rereads the openings after one
 *   is made or changed, so the chart behind this agrees with it.
 */
export default function SeatResumes({ seat, openings, criteriaOk, onOpenings, onClose }) {
	const s = useApp();
	const listed = openingFor(openings, seat.title, seat.company);
	/* Criteria kept as a comment, where the site has no fields for them
	   (api/recruitment.js). Merged over the opening so everything below reads
	   one shape. */
	const [noted, setNoted] = useState({});
	const opening = listed && !criteriaOk ? { ...listed, ...noted } : listed;
	/* Breakdowns worked out by Rescore this visit, for a site with no field
	   to keep them. */
	const [shown, setShown] = useState({});
	/* The applicant waiting on Yes / No. Asked in the row rather than in a
	   second dialog over this one: a delete cannot be undone, and the question
	   belongs beside the name it is about. */
	const [asking, setAsking] = useState("");
	const [desig, setDesig] = useState(seat.designation || "");
	const [draft, setDraft] = useState(BLANK);
	const [apps, setApps] = useState({ state: "", rows: [], detail: false, err: "" });
	const [source, setSource] = useState(SOURCES[0]);
	const [batch, setBatch] = useState([]);
	const [busy, setBusy] = useState("");
	const [msg, setMsg] = useState({ ok: "", bad: "" });
	const say = (ok, bad = "") => setMsg({ ok, bad });

	async function readApplicants(name) {
		if (!name) { setApps({ state: "", rows: [], detail: false, err: "" }); return; }
		setApps((a) => ({ ...a, state: "loading" }));
		try {
			const r = await loadApplicants(name);
			setApps({ state: "ok", rows: r.rows, detail: r.detail, err: "" });
		} catch (e) {
			setApps({ state: "error", rows: [], detail: false, err: e.message || String(e) });
		}
	}

	useEffect(() => {
		let dead = false;
		setNoted({});
		setDraft(draftOf(listed));
		void readApplicants(listed?.name);
		if (listed && !criteriaOk) {
			readCriteriaNote(listed.name).then((f) => {
				if (dead) return;
				setNoted(f);
				setDraft(draftOf({ ...listed, ...f }));
			}).catch(() => {});
		}
		return () => { dead = true; };
	}, [listed?.name, criteriaOk]);

	async function makeOpening() {
		setBusy("opening");
		try {
			await createOpening({ job_title: seat.title, designation: desig, company: seat.company, department: seat.department });
			await onOpenings();
			say("");
		} catch (e) {
			say("", `Not created: ${e.message || e}`);
		}
		setBusy("");
	}

	const dirty = opening && !sameDraft(draft, draftOf(opening));

	async function keepCriteria() {
		setBusy("criteria");
		const r = await saveCriteria(opening, draft, criteriaOk);
		if (r.ok) {
			if (!criteriaOk) setNoted((n) => ({ ...n, ...r.patch }));
			await onOpenings();
			say(apps.rows.length ? "Criteria saved. Rescore to apply them to the resumes already here." : "Criteria saved.");
		} else {
			say("", `Not saved: ${r.error}`);
		}
		setBusy("");
	}

	async function pick(e) {
		const files = [...(e.target.files || [])];
		e.target.value = "";
		if (!files.length || !opening) return;
		setBusy("reading");
		say("");
		const have = new Set(batch.map((r) => r.key));
		const got = [];
		for (const f of files) {
			const row = await readResume(f, opening, source);
			if (!have.has(row.key)) { have.add(row.key); got.push(row); }
		}
		setBatch((b) => b.concat(got));
		setBusy("");
	}

	const edit = (key, field, value) => setBatch((b) => b.map((r) => (r.key === key ? { ...r, [field]: value, err: "" } : r)));

	const taken = new Set(apps.rows.map((r) => String(r.email_id || "").toLowerCase()));
	const checked = batch.map((r) => ({ ...r, problem: problemOf(r, taken, batch) }));
	const ready = checked.filter((r) => !r.problem);

	async function addAll() {
		setBusy("adding");
		try {
			await ensureSources();
		} catch (e) {
			say("", `LinkedIn and Indeed could not be set up as applicant sources: ${e.message || e}`);
			setBusy("");
			return;
		}
		let made = 0;
		const unattached = [];
		const failed = {};
		for (const r of ready) {
			try {
				const res = await addApplicant(r, opening, apps.detail);
				made++;
				if (!res.attached) unattached.push(`${r.name} (${res.name})`);
			} catch (e) {
				failed[r.key] = e.message || String(e);
			}
		}
		setBatch((b) => b.filter((r) => failed[r.key] || !ready.some((x) => x.key === r.key))
			.map((r) => (failed[r.key] ? { ...r, err: failed[r.key] } : r)));
		const n = Object.keys(failed).length;
		say(made ? `${made} resume${made === 1 ? "" : "s"} added.` : "",
			[n ? `${n} not added — see the rows below.` : "",
				unattached.length ? `Added without the resume attached: ${unattached.join(", ")}.` : ""].filter(Boolean).join(" "));
		await readApplicants(opening.name);
		await onOpenings();
		setBusy("");
	}

	async function deleteOne(r) {
		const who = r.applicant_name || r.name;
		setBusy(`delete:${r.name}`);
		say("");
		try {
			await removeApplicant(r.name);
			say(`${who} deleted.`);
		} catch (e) {
			say("", `${who} was not deleted: ${e.message || e}`);
		}
		setAsking("");
		await readApplicants(opening.name);
		await onOpenings();
		setBusy("");
	}

	async function runRescore() {
		setBusy("rescore:0");
		say("");
		try {
			const r = await rescore(opening, apps.rows, apps.detail, (i) => setBusy(`rescore:${i}`));
			setShown(r.details || {});
			say(`${r.changed} rescored${r.same ? `, ${r.same} unchanged` : ""}.`,
				r.unread.length ? `Could not be read, score kept: ${r.unread.join(", ")}.` : "");
		} catch (e) {
			say("", e.message || String(e));
		}
		await readApplicants(opening.name);
		setBusy("");
	}

	const scoring = hasCriteria(criteriaOf(opening));

	const body = (
		<div className="recruit">
			<p className="rseat">
				{seat.company}
				{seat.who ? ` · ${seat.who.status === "Left" ? "vacated by" : "replacing"} ${seat.who.employee_name || seat.who.name}` : ""}
				{seat.who?.relieving_date ? ` · ${seat.who.status === "Left" ? "left" : "leaves"} ${dmy(seat.who.relieving_date)}` : ""}
				{opening && s.site ? (
					<> · <a className="fhname" href={deskUrl(s.site, "Job Opening", opening.name)} target="_blank" rel="noopener noreferrer">{opening.name}</a></>
				) : null}
				{opening?.status === "Closed" ? " · Closed" : ""}
			</p>

			{msg.ok || msg.bad ? (
				<div className="onbmsg" role="status">
					<span>{msg.ok}{msg.ok && msg.bad ? " " : ""}{msg.bad ? <b>{msg.bad}</b> : null}</span>
					<button className="x" aria-label="Dismiss" onClick={() => say("")}>×</button>
				</div>
			) : null}

			{!opening ? (
				<div className="onbbar rnew">
					<label className="lbl">Designation
						<select aria-label="Designation" value={desig} onChange={(e) => setDesig(e.target.value)}>
							<option value="">— choose —</option>
							{(s.designations || []).map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
						</select>
					</label>
					<button className="embtn pri" disabled={busy === "opening" || !desig || !seat.company}
						onClick={() => void makeOpening()}>
						{busy === "opening" ? "Opening…" : "Open this position"}
					</button>
				</div>
			) : (
				<>
					<section className="rcrit" aria-label="Scoring criteria">
						<h4>Scoring criteria</h4>
						{(
							<div className="rcgrid">
								<label>Must have
									<input aria-label="Must have" value={draft.must} placeholder="AutoCAD, Tally / Tally Prime"
										onChange={(e) => setDraft({ ...draft, must: e.target.value })} />
								</label>
								<label>Good to have
									<input aria-label="Good to have" value={draft.good} placeholder="SAP, GST"
										onChange={(e) => setDraft({ ...draft, good: e.target.value })} />
								</label>
								<label>Minimum experience (years)
									<input aria-label="Minimum experience (years)" type="number" min="0" step="0.5" value={draft.experience}
										onChange={(e) => setDraft({ ...draft, experience: e.target.value })} />
								</label>
								<label>Qualification
									<input aria-label="Qualification" value={draft.qualification} placeholder="B.Tech / Diploma / ITI"
										onChange={(e) => setDraft({ ...draft, qualification: e.target.value })} />
								</label>
								<label>Location
									<input aria-label="Location" value={draft.location} placeholder="Kottayam, Ernakulam"
										onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
								</label>
								<div className="racts">
									<button className="embtn pri" disabled={!dirty || !!busy} onClick={() => void keepCriteria()}>
										{busy === "criteria" ? "Saving…" : "Save"}
									</button>
								</div>
							</div>
						)}
					</section>

					<div className="onbbar">
						<span className="segs" role="group" aria-label="Source">
							{SOURCES.map((src) => (
								<button key={src} className="embtn" aria-pressed={source === src} disabled={!!busy}
									onClick={() => setSource(src)}>
									{src}
								</button>
							))}
						</span>
						<label className={"embtn pri" + (busy ? " off" : "")}>
							{busy === "reading" ? "Reading…" : "Upload Resumes"}
							<input type="file" multiple accept={ACCEPT} hidden disabled={!!busy}
								aria-label="Upload resumes" onChange={(e) => void pick(e)} />
						</label>
						<button className="embtn" disabled={!!busy || !apps.rows.length || !scoring}
							onClick={() => void runRescore()}>
							{busy.startsWith("rescore:") ? `Rescoring ${busy.split(":")[1]} of ${apps.rows.length}…` : "Rescore"}
						</button>
						{!scoring && criteriaOk ? <span className="text-fine text-ink-3">Not scored until criteria are saved</span> : null}
					</div>

					{checked.length ? (
						<div className="rbatch">
							<Scroll>
								<table>
									<thead>
										<tr>
											<th>File</th><th>Score</th><th>Status</th><th>Name</th><th>Email</th><th>Phone</th>
											<th>Source</th><th aria-label="Remove" />
										</tr>
									</thead>
									<tbody>
										{checked.map((r) => (
											<tr key={r.key}>
												<td className="rfile">{r.file.name}</td>
												<td><Score score={r.score} /><Why text={r.detail} /></td>
												<td>
													{r.err ? <span className="cov none" title={r.err}>Refused</span>
														: r.problem ? <span className="cov part">{r.problem}</span>
															: <span className="cov live">Ready</span>}
													{r.err ? <div className="rerr">{r.err}</div> : null}
												</td>
												<td><input aria-label={`Name for ${r.file.name}`} value={r.name}
													onChange={(e) => edit(r.key, "name", e.target.value)} /></td>
												<td><input aria-label={`Email for ${r.file.name}`} value={r.email}
													onChange={(e) => edit(r.key, "email", e.target.value)} /></td>
												<td><input aria-label={`Phone for ${r.file.name}`} value={r.phone}
													onChange={(e) => edit(r.key, "phone", e.target.value)} /></td>
												<td>
													<select aria-label={`Source for ${r.file.name}`} value={r.source}
														onChange={(e) => edit(r.key, "source", e.target.value)}>
														{SOURCES.map((src) => <option key={src} value={src}>{src}</option>)}
													</select>
												</td>
												<td className="act">
													<button className="fhact on" aria-label={`Remove ${r.file.name}`} disabled={!!busy}
														onClick={() => setBatch((b) => b.filter((x) => x.key !== r.key))}>×</button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</Scroll>
							<div className="fhfoot">
								<button className="embtn pri" disabled={!!busy || !ready.length} onClick={() => void addAll()}>
									{busy === "adding" ? "Adding…" : `Add ${ready.length} resume${ready.length === 1 ? "" : "s"}`}
								</button>
								<button className="embtn" disabled={!!busy} onClick={() => setBatch([])}>Cancel</button>
							</div>
						</div>
					) : null}

					{apps.state === "loading" && !apps.rows.length ? (
						<Empty title="Reading resumes…" />
					) : apps.state === "error" ? (
						<Empty title="Resumes could not be read">{apps.err}</Empty>
					) : !apps.rows.length ? (
						<Empty title="No resumes for this position yet" />
					) : (
						<Scroll>
							<table className="rlist">
								<thead>
									<tr>
										<th className="num">#</th><th>Applicant</th><th>Source</th><th>Score</th>
										<th>Breakdown</th><th>Status</th><th>Applied</th><th>Resume</th><th aria-label="Delete" />
									</tr>
								</thead>
								<tbody>
									{apps.rows.map((r, i) => (
										<tr key={r.name}>
											<td className="num">{i + 1}</td>
											<td>
												{s.site ? (
													<a className="fhname" href={deskUrl(s.site, "Job Applicant", r.name)} target="_blank" rel="noopener noreferrer">
														{r.applicant_name || r.name}
													</a>
												) : <b>{r.applicant_name || r.name}</b>}
												<div className="rsub">{[r.email_id, r.phone_number].filter(Boolean).join(" · ")}</div>
											</td>
											<td>{r.source || "-"}</td>
											<td><Score score={storedScore({ ...r, [DETAIL_FIELD]: r[DETAIL_FIELD] || shown[r.name] })} /></td>
											<td><Why text={r[DETAIL_FIELD] || shown[r.name]} /></td>
											<td><span className="pill off">{r.status || "Open"}</span></td>
											<td>{r.creation ? dmy(String(r.creation).slice(0, 10)) : "-"}</td>
											<td>
												{r.resume_attachment ? (
													<a className="fhname" href={r.resume_attachment} target="_blank" rel="noopener noreferrer">Open</a>
												) : "-"}
											</td>
											<td className="act rdel">
												{asking === r.name ? (
													<>
														<span className="rask">Delete?</span>
														<button className="embtn bad" disabled={!!busy}
															aria-label={`Yes, delete ${r.applicant_name || r.name}`}
															onClick={() => void deleteOne(r)}>
															{busy === `delete:${r.name}` ? "Deleting…" : "Yes"}
														</button>
														<button className="embtn" disabled={!!busy} onClick={() => setAsking("")}>No</button>
													</>
												) : (
													<button className="embtn" disabled={!!busy}
														aria-label={`Delete ${r.applicant_name || r.name}`}
														onClick={() => setAsking(r.name)}>
														Delete
													</button>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</Scroll>
					)}
				</>
			)}
		</div>
	);

	return <Modal title={`Resumes — ${seat.label}`} wide extra={body} onClose={busy ? () => {} : onClose} />;
}
