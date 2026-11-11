import { useEffect, useState } from "react";
import { useApp } from "@/store";
import { deskUrl } from "@/lib/desk";
import { CRITERIA_FIELDS, criteriaOf, hasCriteria } from "@/lib/resumescore";
import { openingFor } from "@/lib/vacancy";
import { createOpening, loadApplicants, readCriteriaNote, rescore, saveCriteria, storedScore } from "@/api/recruitment";
import { Modal } from "@/components/ui";

/* ---------------------------------------------------------------------------
   A seat's scoring criteria, from its box on the hierarchy chart (asked for
   by HR, 11 November 2026) — and the same form inside Resumes, so the two are
   one form and one save, not two that can drift.

   The criteria belong to the seat's Job Opening (lib/vacancy.js finds it by
   title): in its `custom_*` fields where the site has them, else the latest
   "Resume scoring criteria" comment on it (api/recruitment.js). A seat with
   no opening yet is offered "Open this position" first — the criteria need
   something to be kept on.
   --------------------------------------------------------------------------- */

export const BLANK = { must: "", good: "", experience: "", qualification: "", location: "" };

/* A position that never set a minimum reads back as 0, which is a box
   showing "0" that nobody typed; it is drawn empty. */
export const draftOf = (o) => Object.fromEntries(Object.entries(CRITERIA_FIELDS)
	.map(([k, f]) => [k, k === "experience" && !Number(o?.[f]) ? "" : o?.[f] ?? ""]));

export const sameDraft = (a, b) => Object.keys(BLANK).every((k) => String(a[k] ?? "").trim() === String(b[k] ?? "").trim());

/** One line for a seat's box: what its criteria ask for, or "" when none are
    set. Pure. */
export function criteriaSummary(opening) {
	const c = criteriaOf(opening);
	if (!hasCriteria(c)) return "";
	/* Each term is `{label, alts}` (lib/resumescore.js parseList); the label is
	   what HR typed. */
	const said = (terms) => terms.map((t) => t.label);
	return [
		c.must.length ? `Must: ${said(c.must).join(", ")}` : "",
		c.years ? `${c.years}+ yrs` : "",
		c.qualification.length ? said(c.qualification).join(", ") : "",
		c.good.length ? `Good: ${said(c.good).join(", ")}` : "",
		c.location.length ? said(c.location).join(", ") : "",
	].filter(Boolean).join(" · ");
}

/** The five boxes and Save — drawn the same wherever the criteria are kept. */
export function CriteriaForm({ draft, setDraft, dirty, busy, onSave }) {
	return (
		<section className="rcrit" aria-label="Scoring criteria">
			<h4>Scoring criteria</h4>
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
					<button className="embtn pri" disabled={!dirty || !!busy} onClick={() => void onSave()}>
						{busy === "criteria" ? "Saving…" : "Save"}
					</button>
				</div>
			</div>
		</section>
	);
}

/**
 * The criteria alone, for one seat — opened from its box on the chart.
 *
 * @param {{seat: object, openings: object[], criteriaOk: boolean,
 *          onOpenings: () => Promise<void>, onClose: () => void}} props
 *   `onOpenings` rereads the openings (and their criteria), so the box's
 *   summary behind this agrees with what was saved.
 */
export default function SeatCriteria({ seat, openings, criteriaOk, onOpenings, onClose }) {
	const s = useApp();
	const listed = openingFor(openings, seat.title, seat.company);
	const [noted, setNoted] = useState({});
	const opening = listed && !criteriaOk ? { ...listed, ...noted } : listed;
	const [desig, setDesig] = useState(seat.designation || "");
	const [draft, setDraft] = useState(BLANK);
	const [busy, setBusy] = useState("");
	const [msg, setMsg] = useState({ ok: "", bad: "" });
	const say = (ok, bad = "") => setMsg({ ok, bad });
	/* The candidates already on this job, so saved criteria can reach them:
	   a resume is scored when it is added, and one added before there were
	   criteria stays "Not scored" until it is rescored. */
	const [apps, setApps] = useState({ rows: [], detail: false });
	const readApps = (name) => (name
		? loadApplicants(name).then((r) => setApps({ rows: r.rows, detail: r.detail })).catch(() => setApps({ rows: [], detail: false }))
		: Promise.resolve(setApps({ rows: [], detail: false })));

	useEffect(() => {
		let dead = false;
		setNoted({});
		setDraft(draftOf(listed));
		void readApps(listed?.name);
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

	async function keep() {
		setBusy("criteria");
		const r = await saveCriteria(opening, draft, criteriaOk);
		if (r.ok) {
			if (!criteriaOk) setNoted((n) => ({ ...n, ...r.patch }));
			await onOpenings();
			say(apps.rows.length ? "Criteria saved. Rescore to apply them to the candidates already here." : "Criteria saved. Resumes added from now on are scored against them.");
		} else {
			say("", `Not saved: ${r.error}`);
		}
		setBusy("");
	}

	async function runRescore() {
		setBusy("rescore:0");
		say("");
		try {
			const r = await rescore(opening, apps.rows, apps.detail, (i) => setBusy(`rescore:${i}`));
			say(`${r.changed} rescored${r.same ? `, ${r.same} unchanged` : ""}.`,
				r.unread.length ? `Could not be read, score kept: ${r.unread.join(", ")}.` : "");
			await readApps(opening.name);
			await onOpenings();
		} catch (e) {
			say("", e.message || String(e));
		}
		setBusy("");
	}

	const scoring = hasCriteria(criteriaOf(opening));
	const unscored = apps.rows.filter((a) => storedScore(a) == null).length;

	const body = (
		<div className="recruit">
			<p className="rseat">
				{seat.company}
				{seat.who ? ` · ${seat.who.status === "Left" ? "vacated by" : "replacing"} ${seat.who.employee_name || seat.who.name}` : ""}
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
				<>
					<p className="rseat">This seat has no job opening yet. Open it to keep scoring criteria on it.</p>
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
				</>
			) : (
				<>
					<CriteriaForm draft={draft} setDraft={setDraft} dirty={dirty} busy={busy} onSave={keep} />
					{apps.rows.length ? (
						<div className="onbbar rcrescore">
							<span className="rseat">
								{apps.rows.length} candidate{apps.rows.length === 1 ? "" : "s"} on this job
								{unscored ? ` · ${unscored} not scored` : ""}
							</span>
							<button className="embtn" disabled={!scoring || dirty || !!busy}
								title={!scoring ? "Set and save criteria first." : dirty ? "Save the criteria first." : "Score every candidate on this job against these criteria."}
								onClick={() => void runRescore()}>
								{busy.startsWith("rescore") ? `Rescoring… ${busy.split(":")[1]}` : "Rescore"}
							</button>
						</div>
					) : null}
				</>
			)}
		</div>
	);

	return <Modal title={`Scoring criteria — ${seat.label}`} wide extra={body} onClose={busy ? () => {} : onClose} />;
}
