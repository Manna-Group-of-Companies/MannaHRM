/** Recruitment, as the HRDashboard reference draws it (21 October 2026): the
 *  jobs as cards with their funnel, one job's applicants as a pipeline or a
 *  table, everybody who applied, one applicant's page, Post a job, and the
 *  settings — on hrms's Job Opening and Job Applicant (api/jobs.js).
 *
 *  The resumes come in the way they always have: the Resumes panel
 *  (features/employees/SeatResumes), which reads, scores and files them —
 *  here behind each job's Bulk upload CVs as well as on the hierarchy chart.
 *  Scores are out of ten and decide nothing; nobody is rejected by them.
 */

import { useEffect, useState } from "react";
import { set, useApp } from "@/store";
import { navigate } from "@/routes/router";
import { createOpening, storedScore } from "@/api/recruitment";
import {
	JOB_STATUS, REJECTED, STAGES, STAGE_LABEL, addNote, addSource, loadRecruitment, readNotes, readSources,
	readTemplates, saveJob, setApplicantStatus, setJobStatus,
} from "@/api/jobs";
import { loadOpenings } from "@/api/recruitment";
import { dmy, tidyDept } from "@/lib/format";
import SeatResumes from "@/features/employees/SeatResumes";
import KitIcon from "@/components/kit/KitIcon";
import KitAvatar from "@/components/kit/KitAvatar";
import { EmptyState, PageHead, Pill, Seg, SegTabs, Who, stagger } from "@/components/kit/ui";
import { Confirm, DotsMenu, KitModal, ModalFoot, toast } from "@/components/kit/overlay";

const day10 = (v) => String(v || "").slice(0, 10);
const why = (e) => String(e?.message || e || "The site would not do that.").slice(0, 240);
const PILL_OF = { Open: "In progress", Replied: "In progress", Hold: "On hold", Accepted: "Hired", Rejected: "Rejected" };
const textOf = (html) => new DOMParser().parseFromString(String(html || ""), "text/html").body.textContent || "";

function useRec() {
	const s = useApp();
	useEffect(() => { void loadRecruitment(); }, []);
	return s.rec;
}

/** Five stars from a score out of ten, read-only — hrms keeps it as a rating. */
function Stars({ score }) {
	if (score == null) return <span className="k-muted">Not scored</span>;
	const n = Math.round(score / 2);
	return (
		<span className="k-stars k-ro" title={`${score} / 10`} aria-label={`${score} out of 10`}>
			{[1, 2, 3, 4, 5].map((i) => <button type="button" key={i} tabIndex={-1} className={i <= n ? "k-on" : undefined}><KitIcon name="star" size={14} stroke={2} /></button>)}
		</span>
	);
}

/** The status menu the reference hangs on a pill. */
function StatusMenu({ a, onDone }) {
	const move = async (st) => {
		try { await setApplicantStatus(a.name, st); toast(st === "Accepted" ? `${a.applicant_name} hired` : `Moved to ${STAGE_LABEL[st]}`); onDone?.(); } catch (e) { toast(why(e)); }
	};
	return (
		<DotsMenu label={`Move ${a.applicant_name}`} items={[
			...STAGES.filter((st) => st !== a.status).map((st) => ({ label: STAGE_LABEL[st], icon: "arrow", onClick: () => void move(st) })),
			"-",
			...(a.status === REJECTED ? [] : [{ label: "Reject", icon: "x", danger: true, onClick: () => void move(REJECTED) }]),
		]} />
	);
}

/* ------------------------------------------------------------------ Jobs --- */

function JobCard({ j, apps, i }) {
	const live = apps.filter((a) => a.status !== REJECTED);
	const open = () => { set({ recJob: j.name }); navigate("recruitment", "job"); };
	const status = async (st) => {
		try { await setJobStatus(j.name, st); toast(`${j.job_title} is now ${st}`); } catch (e) { toast(why(e)); }
	};
	return (
		<div className="k-card k-job k-lift k-anim" style={stagger(i)}>
			<div className="k-card-h" style={{ margin: 0, alignItems: "flex-start" }}>
				<button type="button" style={{ textAlign: "left" }} onClick={open}>
					<h3>{j.job_title}</h3>
					<div className="k-muted" style={{ marginTop: 4, fontSize: 13 }}>{[tidyDept(j.department), j.company].filter(Boolean).join(" · ")}</div>
				</button>
				<DotsMenu label={`Status of ${j.job_title}`} items={JOB_STATUS.map((st) => ({
					label: st === j.status ? `${st} ✓` : st, icon: st === "Open" ? "check" : "lock", onClick: () => void status(st),
				}))} />
			</div>
			<div className="k-job-meta">
				<Pill status={j.status === "Open" ? "Open" : "Closed"} />
				{j.designation ? <span className="k-pill k-p-grey k-nodot">{j.designation}</span> : null}
			</div>
			<div className="k-funnel">
				{STAGES.map((st, idx) => {
					const n = live.filter((a) => STAGES.indexOf(a.status) >= idx).length;
					return (
						<div key={st} title={`${STAGE_LABEL[st]}: ${n}`}>
							<div className="k-bar"><i style={{ width: `${live.length ? (n / live.length) * 100 : 0}%` }} /></div>
							<small>{n}</small>
						</div>
					);
				})}
			</div>
			<div className="k-job-f">
				<span>{apps.length} applicant{apps.length === 1 ? "" : "s"}{j.posted_on ? ` · posted ${dmy(day10(j.posted_on))}` : ""}</span>
				<button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={open}>Candidates <KitIcon name="arrow" size={14} stroke={2} /></button>
			</div>
		</div>
	);
}

export function Jobs() {
	const rec = useRec();
	const s = useApp();
	const [tab, setTab] = useState("Open");
	const [q, setQ] = useState("");
	const jobs = (rec.jobs || []).filter((j) => !s.company || j.company === s.company);
	const shown = jobs.filter((j) => (tab === "All" || j.status === tab) && (!q || String(j.job_title).toLowerCase().includes(q.toLowerCase())));
	return (
		<div className="kit k-enter">
			<PageHead title="Jobs" sub="Open roles and how far applicants have got">
				<button type="button" className="k-btn k-btn-ink" onClick={() => navigate("recruitment", "new")}>
					<KitIcon name="plus" size={18} stroke={2} />Post a job
				</button>
			</PageHead>
			<div className="k-card" style={{ marginBottom: 20 }}>
				<div className="k-card-h" style={{ margin: 0 }}>
					<SegTabs label="Status" value={tab} onChange={setTab} tabs={["All", ...JOB_STATUS]}
						count={(t) => (t === "All" ? jobs.length : jobs.filter((j) => j.status === t).length)} />
					<div className="k-inp-ic" style={{ minWidth: 240 }}>
						<KitIcon name="search" size={18} stroke={2} />
						<input className="k-inp" placeholder="Search jobs" value={q} aria-label="Search jobs" onChange={(e) => setQ(e.target.value)} />
					</div>
				</div>
			</div>
			{rec.state === "error" ? <div className="k-card"><EmptyState icon="info" title="Recruitment could not be read" sub={rec.err} /></div> : null}
			{rec.state === "error" ? null : rec.state !== "ok" ? <div className="k-sk" style={{ height: 220 }} /> : (
				<div className="k-jobs">
					{shown.length ? shown.map((j, i) => <JobCard key={j.name} j={j} i={i} apps={(rec.apps || []).filter((a) => a.job_title === j.name)} />) : (
						<div className="k-card" style={{ gridColumn: "1/-1" }}>
							<EmptyState icon="brief" title="No jobs here" sub="Post a role to start collecting applicants.">
								<button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={() => navigate("recruitment", "new")}>Post a job</button>
							</EmptyState>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

/* ------------------------------------------------------------- one job --- */

function EditJob({ j, onClose }) {
	const [f, setF] = useState({ job_title: j.job_title || "", description: textOf(j.description || "") });
	const [err, setErr] = useState("");
	return (
		<KitModal title="Edit job" onClose={onClose}>
			<form noValidate onSubmit={async (e) => {
				e.preventDefault();
				if (!f.job_title.trim()) { setErr("Enter a job title"); return; }
				try { await saveJob(j.name, { job_title: f.job_title.trim(), description: f.description }); toast("Job saved"); onClose(); } catch (x) { setErr(why(x)); }
			}}>
				<div className="k-form-grid">
					<div className={`k-field k-full${err ? " k-bad" : ""}`}>
						<label htmlFor="ej-title">Job title</label>
						<input id="ej-title" className="k-inp" value={f.job_title} onChange={(e) => { setF({ ...f, job_title: e.target.value }); setErr(""); }} />
						{err ? <small className="k-err">{err}</small> : null}
					</div>
					<div className="k-field k-full">
						<label htmlFor="ej-desc">Job description</label>
						<textarea id="ej-desc" className="k-inp" rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
					</div>
				</div>
				<ModalFoot ok="Save job" onCancel={onClose} />
			</form>
		</KitModal>
	);
}

export function Job() {
	const rec = useRec();
	const s = useApp();
	const [view, setView] = useState("pipeline");
	const [q, setQ] = useState("");
	const [upload, setUpload] = useState(false);
	const [edit, setEdit] = useState(false);
	const [drag, setDrag] = useState("");
	const j = (rec.jobs || []).find((x) => x.name === s.recJob);
	const back = () => navigate("recruitment", "overview");
	if (rec.state === "ok" && !j) {
		return <div className="kit"><div className="k-card"><EmptyState icon="brief" title="This job is not there" sub="It may have been closed or renamed."><button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={back}>Go to Jobs</button></EmptyState></div></div>;
	}
	if (!j) return <div className="kit"><div className="k-sk" style={{ height: 320 }} /></div>;
	const apps = (rec.apps || []).filter((a) => a.job_title === j.name && (!q || `${a.applicant_name} ${a.email_id}`.toLowerCase().includes(q.toLowerCase())));
	const openApp = (a) => { set({ recApp: a.name }); navigate("recruitment", "applicant"); };
	const move = async (a, st) => {
		if (a.status === st) return;
		try { await setApplicantStatus(a.name, st); toast(st === "Accepted" ? `${a.applicant_name} hired` : `Moved to ${STAGE_LABEL[st]}`); } catch (e) { toast(why(e)); }
	};
	const seat = { title: j.job_title, label: j.designation || j.job_title, company: j.company, designation: j.designation || "", department: j.department || "", who: null };

	return (
		<div className="kit k-enter">
			<div className="k-ph">
				<div>
					<h1>Recruitment</h1>
					<div className="k-crumbs"><button type="button" onClick={back}>List job</button><KitIcon name="right" size={14} stroke={2} /><b>{j.job_title}</b> <Pill status={j.status === "Open" ? "Open" : "Closed"} /></div>
				</div>
				<div className="k-ph-act" style={{ alignItems: "center" }}>
					<div className="k-inp-ic" style={{ minWidth: 220 }}>
						<KitIcon name="search" size={18} stroke={2} />
						<input className="k-inp" placeholder="Search candidates" value={q} aria-label="Search candidates" onChange={(e) => setQ(e.target.value)} />
					</div>
					<button type="button" className="k-btn k-btn-ink" onClick={() => setUpload(true)}>
						<KitIcon name="upload" size={18} stroke={2} />Bulk upload CVs
					</button>
					<Seg label="View" value={view} onChange={setView} options={[["table", "Table"], ["pipeline", "Pipeline"]]} />
					<button type="button" className="icon-btn" aria-label="Edit job" title="Edit job" onClick={() => setEdit(true)}><KitIcon name="edit" size={20} stroke={2} /></button>
				</div>
			</div>
			{view === "table" ? (
				<div className="k-card">
					{apps.length ? (
						<div className="k-tbl-wrap">
							<table className="k-rt">
								<thead><tr>{["Candidate", "Stage", "Source", "Applied", "Score", ""].map((c, i) => <th key={i}><span>{c}</span></th>)}</tr></thead>
								<tbody>
									{apps.map((a) => (
										<tr key={a.name} className="k-click" tabIndex={0} onClick={() => openApp(a)} onKeyDown={(ev) => { if (ev.key === "Enter") openApp(a); }}>
											<td className="k-title-cell"><Who name={a.applicant_name} sub={a.email_id} /></td>
											<td data-label="Stage"><Pill status={PILL_OF[a.status] || "Not started"}>{STAGE_LABEL[a.status] || a.status}</Pill></td>
											<td data-label="Source">{a.source || "—"}</td>
											<td data-label="Applied">{dmy(day10(a.creation))}</td>
											<td data-label="Score"><Stars score={storedScore(a)} /></td>
											<td data-label="" onClick={(ev) => ev.stopPropagation()}><StatusMenu a={a} /></td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : <EmptyState icon="users" title="No candidates yet" sub="Upload CVs to add people to this job." />}
				</div>
			) : (
				<>
					<div className="k-board" style={{ gridTemplateColumns: `repeat(${STAGES.length},minmax(240px,1fr))` }}>
						{STAGES.map((st, i) => {
							const col = apps.filter((a) => a.status === st);
							return (
								<div className="k-col" key={st} style={{ background: "rgb(var(--wash))" }}
									onDragOver={(e) => e.preventDefault()}
									onDrop={(e) => { e.preventDefault(); const a = apps.find((x) => x.name === drag); if (a) void move(a, st); setDrag(""); }}>
									<div className="k-col-h">{STAGE_LABEL[st]}<span className="k-pill k-p-green k-nodot" style={{ padding: "1px 8px" }}>{col.length}</span></div>
									{col.length ? col.map((a) => (
										<div className="k-cand" key={a.name} draggable onDragStart={() => setDrag(a.name)} style={{ background: "rgb(var(--card))" }}>
											<button type="button" style={{ width: "100%", textAlign: "left" }} onClick={() => openApp(a)}><Who name={a.applicant_name} sub={a.email_id} /></button>
											<div className="k-cand-m">
												<Stars score={storedScore(a)} />
												<div className="k-cand-mv">
													<button type="button" aria-label="Move back" disabled={i === 0} onClick={() => void move(a, STAGES[i - 1])}><KitIcon name="left" size={14} stroke={2} /></button>
													<button type="button" aria-label="Move forward" disabled={i === STAGES.length - 1} onClick={() => void move(a, STAGES[i + 1])}><KitIcon name="right" size={14} stroke={2} /></button>
												</div>
											</div>
										</div>
									)) : <div className="k-col-empty">Drop someone here</div>}
								</div>
							);
						})}
					</div>
					{apps.some((a) => a.status === REJECTED) ? (
						<div className="k-card" style={{ marginTop: 16 }}>
							<div className="k-card-h" style={{ marginBottom: 8 }}><h3>Rejected</h3><span className="k-muted">{apps.filter((a) => a.status === REJECTED).length}</span></div>
							<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
								{apps.filter((a) => a.status === REJECTED).map((a) => (
									<button type="button" className="k-tag" key={a.name} onClick={() => openApp(a)}><KitAvatar name={a.applicant_name} size={22} />{a.applicant_name}</button>
								))}
							</div>
						</div>
					) : null}
				</>
			)}
			{upload ? (
				<SeatResumes seat={seat} openings={rec.jobs || []} criteriaOk={rec.criteria}
					onOpenings={() => loadRecruitment({ fresh: true })}
					onClose={() => { setUpload(false); void loadRecruitment({ fresh: true }); }} />
			) : null}
			{edit ? <EditJob j={j} onClose={() => setEdit(false)} /> : null}
		</div>
	);
}

/* ----------------------------------------------------------- candidates --- */

export function Candidates() {
	const rec = useRec();
	const s = useApp();
	const [q, setQ] = useState("");
	const [job, setJob] = useState("");
	const [stage, setStage] = useState("");
	const [source, setSource] = useState("");
	const jobs = new Map((rec.jobs || []).map((j) => [j.name, j]));
	const all = (rec.apps || []).filter((a) => !s.company || jobs.get(a.job_title)?.company === s.company);
	const shown = all.filter((a) => (!q || `${a.applicant_name} ${a.email_id}`.toLowerCase().includes(q.toLowerCase()))
		&& (!job || a.job_title === job) && (!stage || a.status === stage) && (!source || a.source === source))
		.sort((a, b) => String(b.creation).localeCompare(String(a.creation)));
	const sources = [...new Set(all.map((a) => a.source).filter(Boolean))].sort();
	const openApp = (a) => { set({ recApp: a.name }); navigate("recruitment", "applicant"); };
	return (
		<div className="kit k-enter">
			<PageHead title="Candidates" sub="Everyone who applied, across all jobs" />
			<div className="k-card">
				<div className="k-filters">
					<div className="k-inp-ic">
						<KitIcon name="search" size={18} stroke={2} />
						<input className="k-inp" placeholder="Search candidates" value={q} aria-label="Search" onChange={(e) => setQ(e.target.value)} />
					</div>
					<select className="k-sel" aria-label="Job" value={job} onChange={(e) => setJob(e.target.value)}>
						<option value="">All jobs</option>
						{[...jobs.values()].map((j) => <option key={j.name} value={j.name}>{j.job_title}</option>)}
					</select>
					<select className="k-sel" aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)}>
						<option value="">All stages</option>
						{[...STAGES, REJECTED].map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}
					</select>
					<select className="k-sel" aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
						<option value="">All sources</option>
						{sources.map((x) => <option key={x}>{x}</option>)}
					</select>
				</div>
				{rec.state === "error" ? <EmptyState icon="info" title="Recruitment could not be read" sub={rec.err} />
					: rec.state !== "ok" ? <div className="k-sk" style={{ height: 220 }} /> : shown.length ? (
					<div className="k-tbl-wrap">
						<table className="k-rt">
							<thead><tr>{["Candidate", "Job", "Stage", "Source", "Applied", "Score", ""].map((c, i) => <th key={i}><span>{c}</span></th>)}</tr></thead>
							<tbody>
								{shown.map((a) => (
									<tr key={a.name} className="k-click" tabIndex={0} onClick={() => openApp(a)} onKeyDown={(ev) => { if (ev.key === "Enter") openApp(a); }}>
										<td className="k-title-cell"><Who name={a.applicant_name} sub={a.email_id} /></td>
										<td data-label="Job">{jobs.get(a.job_title)?.job_title || a.job_title || "—"}</td>
										<td data-label="Stage"><Pill status={PILL_OF[a.status] || "Not started"}>{STAGE_LABEL[a.status] || a.status}</Pill></td>
										<td data-label="Source">{a.source || "—"}</td>
										<td data-label="Applied">{dmy(day10(a.creation))}</td>
										<td data-label="Score"><Stars score={storedScore(a)} /></td>
										<td data-label=""><span className="k-row-go"><KitIcon name="right" size={16} stroke={2} /></span></td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : <EmptyState icon="users" title="No candidates" sub={all.length ? "Try another filter." : "Upload CVs on a job, or on the hierarchy chart's open seats."} />}
			</div>
		</div>
	);
}

/* ------------------------------------------------------------ applicant --- */

export function Applicant() {
	const rec = useRec();
	const s = useApp();
	const [tab, setTab] = useState("profile");
	const [notes, setNotes] = useState(null);
	const [note, setNote] = useState("");
	const a = (rec.apps || []).find((x) => x.name === s.recApp);
	useEffect(() => {
		if (!a) return undefined;
		let live = true;
		readNotes(a.name).then((r) => { if (live) setNotes(r); }).catch(() => { if (live) setNotes([]); });
		return () => { live = false; };
	}, [a?.name]);
	const back = () => navigate("recruitment", "candidates");
	if (rec.state === "ok" && !a) {
		return <div className="kit"><div className="k-card"><EmptyState icon="user" title="This applicant is not there" sub="They may have been removed."><button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={back}>Go to Candidates</button></EmptyState></div></div>;
	}
	if (!a) return <div className="kit"><div className="k-sk" style={{ height: 320 }} /></div>;
	const j = (rec.jobs || []).find((x) => x.name === a.job_title);
	const score = storedScore(a);
	const detail = String(a.custom_score_detail || "").split("\n").filter(Boolean);
	const resume = a.resume_attachment || "";
	const send = async (e) => {
		e.preventDefault();
		if (!note.trim()) return;
		try { await addNote(a.name, note.trim()); setNote(""); setNotes(await readNotes(a.name)); toast("Note added"); } catch (x) { toast(why(x)); }
	};
	return (
		<div className="kit k-enter">
			<div className="k-ph">
				<div>
					<button type="button" className="k-back" onClick={back}><KitIcon name="left" size={22} stroke={2} />Applicant</button>
					<div className="k-crumbs">
						<button type="button" onClick={() => navigate("recruitment", "overview")}>Jobs</button><KitIcon name="right" size={14} stroke={2} />
						{j ? <><button type="button" onClick={() => { set({ recJob: j.name }); navigate("recruitment", "job"); }}>{j.job_title}</button><KitIcon name="right" size={14} stroke={2} /></> : null}
						<b>{a.applicant_name}</b>
					</div>
				</div>
				<div className="k-ph-act">
					{a.status === "Accepted" ? (
						<button type="button" className="k-btn k-btn-green" onClick={() => navigate("employees", "new")}>
							<KitIcon name="user" size={18} stroke={2} />Create profile
						</button>
					) : null}
				</div>
			</div>
			<div className="k-split">
				<div className="k-card k-profile-card">
					<div style={{ display: "flex", justifyContent: "center", margin: "4px 0 14px" }}><KitAvatar name={a.applicant_name} size={96} /></div>
					<h2 style={{ margin: 0, fontSize: 19 }}>{a.applicant_name}</h2>
					<div className="k-muted" style={{ margin: "4px 0 12px" }}>{j?.job_title || a.job_title}</div>
					<div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}>
						<Pill status={PILL_OF[a.status] || "Not started"}>{STAGE_LABEL[a.status] || a.status}</Pill>
						<StatusMenu a={a} />
					</div>
					<div className="k-pc-list">
						<div className="k-r"><KitIcon name="mail" size={16} stroke={2} /><span style={{ overflowWrap: "anywhere" }}>{a.email_id || "—"}</span></div>
						<div className="k-r"><KitIcon name="phone" size={16} stroke={2} />{a.phone_number || "—"}</div>
						<div className="k-r"><KitIcon name="globe" size={16} stroke={2} />{a.source || "No source"}</div>
					</div>
					<div className="k-pc-list">
						{[["Applied", dmy(day10(a.creation))], ["Score", score == null ? "Not scored" : `${score} / 10`]].map(([k, v]) => (
							<div className="k-r" key={k} style={{ justifyContent: "space-between" }}><span className="k-muted">{k}</span><b>{v}</b></div>
						))}
					</div>
				</div>
				<div className="k-card">
					<div className="k-vtabs" role="tablist" aria-label="Applicant">
						{[["profile", "Profile"], ["evaluation", "Evaluation"], ["notes", "Notes"]].map(([k, l]) => (
							<button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "k-on" : undefined} onClick={() => setTab(k)}>{l}</button>
						))}
					</div>
					{tab === "profile" ? (
						<div className="k-sec">
							<div className="k-sec-h"><h3>Resume</h3></div>
							{resume ? (
								<a className="k-btn k-btn-line" href={resume} target="_blank" rel="noreferrer"><KitIcon name="file" size={16} stroke={2} />Open the resume</a>
							) : <p className="k-muted" style={{ margin: 0 }}>No resume on file.</p>}
						</div>
					) : tab === "evaluation" ? (
						<div className="k-sec">
							<div className="k-sec-h"><h3>Against the job's criteria</h3><Stars score={score} /></div>
							{detail.length ? detail.map((d) => <div className="k-kv" key={d} style={{ gridTemplateColumns: "1fr" }}><dd style={{ fontWeight: 500 }}>{d}</dd></div>)
								: <p className="k-muted" style={{ margin: 0 }}>{score == null ? "Not scored yet. Rescore on the job's Bulk upload CVs." : "The breakdown was not kept on this site."}</p>}
						</div>
					) : (
						<>
							<form onSubmit={send} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
								<input className="k-inp" placeholder="Add a note" aria-label="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
								<button type="submit" className="k-btn k-btn-ink" disabled={!note.trim()}>Add</button>
							</form>
							{notes === null ? <div className="k-sk" style={{ height: 80 }} /> : notes.length ? (
								<div className="k-tl">
									{notes.map((n) => <div className="k-tl-i" key={n.name}><b>{textOf(n.content)}</b><small>{n.owner} · {dmy(day10(n.creation))}</small></div>)}
								</div>
							) : <p className="k-muted">No notes yet.</p>}
						</>
					)}
				</div>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------ post a job --- */

export function PostJob() {
	const s = useApp();
	const [step, setStep] = useState(1);
	const [f, setF] = useState({ job_title: "", designation: "", department: "", company: s.company || "" });
	const [bad, setBad] = useState({});
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const put = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setBad({ ...bad, [k]: "" }); };
	const next = (e) => {
		e.preventDefault();
		if (step === 1) {
			const b = {};
			if (!f.job_title.trim()) b.job_title = "Enter a job title";
			if (!f.designation) b.designation = "Pick a designation";
			if (!f.company) b.company = "Pick a company";
			setBad(b);
			if (Object.values(b).some(Boolean)) return;
		}
		if (step < 3) { setStep(step + 1); return; }
		setBusy(true);
		createOpening(f).then(async (made) => {
			await loadRecruitment({ fresh: true });
			void loadOpenings();
			toast(`${f.job_title} posted`);
			set({ recJob: made?.name || "" });
			navigate("recruitment", "job");
		}).catch((x) => setErr(why(x))).finally(() => setBusy(false));
	};
	const field = (k, label, input) => (
		<div className={`k-field${bad[k] ? " k-bad" : ""}`}>
			<label htmlFor={`pj-${k}`}>{label}</label>{input}{bad[k] ? <small className="k-err">{bad[k]}</small> : null}
		</div>
	);
	return (
		<div className="kit k-enter">
			<div className="k-ph"><div><button type="button" className="k-back" onClick={() => navigate("recruitment", "overview")}><KitIcon name="left" size={22} stroke={2} />Post a new job</button></div></div>
			<form className="k-card" style={{ maxWidth: 820 }} noValidate onSubmit={next}>
				<div className="k-steps">
					{["Job details", "Hiring stages", "Review"].map((l, i) => (
						<div key={l} className={`k-step${i + 1 < step ? " k-done" : i + 1 === step ? " k-on" : ""}`}><i>{i + 1 < step ? "✓" : i + 1}</i>{l}</div>
					))}
				</div>
				{step === 1 ? (
					<div className="k-form-grid">
						<div className="k-full">{field("job_title", "Job title", <input id="pj-job_title" className="k-inp" value={f.job_title} onChange={put("job_title")} />)}</div>
						{field("designation", "Designation", (
							<select id="pj-designation" className="k-sel" value={f.designation} onChange={put("designation")}>
								<option value="">Pick one</option>
								{(s.designations || []).map((d) => <option key={d.name || d} value={d.name || d}>{d.name || d}</option>)}
							</select>
						))}
						{field("department", "Department", (
							<select id="pj-department" className="k-sel" value={f.department} onChange={put("department")}>
								<option value="">None</option>
								{(s.departments || []).map((d) => <option key={d.name || d} value={d.name || d}>{tidyDept(d.name || d)}</option>)}
							</select>
						))}
						{field("company", "Company", (
							<select id="pj-company" className="k-sel" value={f.company} onChange={put("company")}>
								<option value="">Pick one</option>
								{(s.companies || []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
							</select>
						))}
					</div>
				) : step === 2 ? (
					<div className="k-sec" style={{ margin: 0 }}>
						<div className="k-sec-h"><h3>Hiring stages</h3></div>
						{[...STAGES, REJECTED].map((st, i) => (
							<div className="k-list-row" key={st}><span className="k-icon-sq">{i + 1}</span><div className="k-grow"><b>{STAGE_LABEL[st]}</b></div></div>
						))}
					</div>
				) : (
					<div className="k-sec" style={{ margin: 0 }}>
						{[["Job title", f.job_title], ["Designation", f.designation], ["Department", tidyDept(f.department) || "—"], ["Company", f.company]].map(([k, v]) => (
							<div className="k-kv" key={k}><dt>{k}</dt><dd>{v}</dd></div>
						))}
					</div>
				)}
				{err ? <p className="k-err" role="alert" style={{ marginTop: 12 }}>{err}</p> : null}
				<div className="k-modal-f">
					{step > 1 ? <button type="button" className="k-btn k-btn-line" style={{ marginRight: "auto" }} onClick={() => setStep(step - 1)}><KitIcon name="left" size={16} stroke={2} />Back</button> : null}
					<button type="button" className="k-btn k-btn-line" onClick={() => navigate("recruitment", "overview")}>Cancel</button>
					<button type="submit" className="k-btn k-btn-ink" disabled={busy}>{step < 3 ? "Continue" : busy ? "Posting…" : "Post job"}</button>
				</div>
			</form>
		</div>
	);
}

/* ------------------------------------------------------------- settings --- */

export function RecruitSettings() {
	const [tab, setTab] = useState("workflow");
	const [sources, setSources] = useState(null);
	const [templates, setTemplates] = useState(null);
	const [name, setName] = useState("");
	const [ask, setAsk] = useState(false);
	useEffect(() => {
		readSources().then(setSources).catch(() => setSources([]));
		readTemplates().then(setTemplates);
	}, []);
	return (
		<div className="kit k-enter">
			<PageHead title="Recruitment Settings" sub="How hiring moves, and where applicants come from" />
			<div className="k-card">
				<div className="k-vtabs" role="tablist" aria-label="Recruitment settings">
					{[["workflow", "Hiring workflow"], ["sources", "Sources"], ["email", "Email templates"]].map(([k, l]) => (
						<button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "k-on" : undefined} onClick={() => setTab(k)}>{l}</button>
					))}
				</div>
				{tab === "workflow" ? (
					<>
						{[...STAGES, REJECTED].map((st, i) => (
							<div className="k-list-row" key={st}><span className="k-icon-sq">{i + 1}</span><div className="k-grow"><b>{STAGE_LABEL[st]}</b><small>{st}</small></div></div>
						))}
					</>
				) : tab === "sources" ? (
					<>
						<form style={{ display: "flex", gap: 8, marginBottom: 14, maxWidth: 480 }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) setAsk(true); }}>
							<input className="k-inp" placeholder="New source" aria-label="New source" value={name} onChange={(e) => setName(e.target.value)} />
							<button type="submit" className="k-btn k-btn-ink" disabled={!name.trim()}>Add</button>
						</form>
						{sources === null ? <div className="k-sk" style={{ height: 80 }} /> : (
							<div className="k-tagbox">{sources.map((x) => <span className="k-tag" key={x.name}>{x.source_name || x.name}</span>)}</div>
						)}
					</>
				) : templates === null ? <div className="k-sk" style={{ height: 80 }} /> : templates.length ? (
					templates.map((t) => <div className="k-list-row" key={t.name}><span className="k-icon-sq"><KitIcon name="mail" size={18} stroke={2} /></span><div className="k-grow"><b>{t.name}</b><small>{t.subject || ""}</small></div></div>)
				) : <EmptyState icon="mail" title="No email templates" sub="The site has none yet." />}
			</div>
			{ask ? (
				<Confirm title={`Add “${name.trim()}”?`} sub="Applicants can then be filed under it." ok="Add source" danger={false}
					onClose={() => setAsk(false)}
					onOk={async () => { try { await addSource(name); setName(""); setSources(await readSources()); toast("Source added"); } catch (x) { toast(why(x)); } setAsk(false); }} />
			) : null}
		</div>
	);
}

export default function Recruitment() {
	const { subtab } = useApp();
	if (subtab === "job") return <Job />;
	if (subtab === "candidates") return <Candidates />;
	if (subtab === "applicant") return <Applicant />;
	if (subtab === "new") return <PostJob />;
	if (subtab === "settings") return <RecruitSettings />;
	return <Jobs />;
}
