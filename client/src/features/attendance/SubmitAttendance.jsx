import { useEffect, useState } from "react";

import { useApp } from "@/store";
import { dmy, dmyTime, fmt, todayIso } from "@/lib/format";
import { download, toCsv } from "@/lib/csv";
import { Cols, Empty, Gap, Modal, Note, Panel, Scroll, Tile, Tiles } from "@/components/ui";
import {
	COUNTED, blockers, closeMonth, discardDraft, isAbsent, lastMonth, liveFor, overlaps, periodBounds,
	periodLabel, periodProblem, readMonth, readSubmissions, reopenMonth, stateOf, submitDraft, summarise,
} from "@/features/attendance/submit";

/* Submit Attendance — Factor HR's monthly close. HR submits one company's month,
   payroll runs from it, and it cannot be reopened once salary has been
   processed. Frappe HR has no equivalent gate; this one is `Attendance
   Submission` and `manna_hr/freeze.py`, and **everything that makes it a gate
   is on the server**. From the moment a month is submitted the site refuses any
   attendance, approved leave or approved correction that would change a day in
   it.

   So this page asks and explains; it does not decide. Add and Preview Data
   read the month the way the controller will, and say beforehand what it will
   refuse — in the controller's own words, from `submit.js` — so the refusal is
   never the first anybody hears of it (CLAUDE.md §1). */

const PER_PAGE = [10, 25, 50, 100];

/** The chip on a readiness row. `unread` is its own state: a check nobody has
    run is not a pass, and drawing it green would be the page inventing one. */
const CHIP = { ok: ["live", "ready"], no: ["none", "not yet"], unread: ["part", "not read"] };

export default function SubmitAttendance() {
	const s = useApp();
	const today = todayIso();
	const names = s.companies.map((c) => c.name);

	/* The company follows the header's picker until somebody picks one here —
	   a month is closed one company at a time, so "All companies" still has to
	   land on one. */
	const [pick, setPick] = useState("");
	const company = pick || s.company || names[0] || "";
	const [ym, setYm] = useState(() => lastMonth(today));

	const [list, setList] = useState({ state: "", rows: [], err: "", absent: false });
	const [find, setFind] = useState("");
	const [per, setPer] = useState(10);
	const [page, setPage] = useState(0);
	const [only, setOnly] = useState(false);

	const [month, setMonth] = useState({ key: "", state: "" });
	const [showing, setShowing] = useState(false);
	const [adding, setAdding] = useState(false);
	const [remarks, setRemarks] = useState("");
	const [ask, setAsk] = useState(null);
	const [busy, setBusy] = useState(false);
	const [said, setSaid] = useState({ text: "", bad: false });

	async function loadList() {
		setList((l) => ({ ...l, state: "loading" }));
		try {
			setList({ state: "ok", rows: await readSubmissions(), err: "", absent: false });
		} catch (e) {
			setList({ state: "ok", rows: [], err: e?.message || "The site would not answer.", absent: isAbsent(e) });
		}
	}

	useEffect(() => { loadList(); /* eslint-disable-next-line */ }, []);

	const key = `${company}|${ym}`;
	/* A read for another company or month is not this month's, however recent.
	   Keyed rather than cleared, so paging back to a month already read costs
	   nothing and a slow answer for the old month cannot paint the new one. */
	const got = month.key === key && month.state === "ok" ? month : null;

	async function readThisMonth() {
		const k = key;
		setMonth({ key: k, state: "loading" });
		const r = await readMonth(company, ym, s.regDoctype);
		setMonth((m) => (m.key === k ? { key: k, state: "ok", ...r } : m));
	}

	const label = periodLabel(ym);
	const bounds = periodBounds(ym);
	const problem = periodProblem(ym, today);
	const live = liveFor(list.rows, company, ym);

	/* Before Preview Data has read the month, corrections and leave are counted
	   off the approval queues the dashboard already holds. Those are narrower
	   than what the site counts — the queue has no Approved corrections — so
	   the row says which it is reading. */
	const inMonth = (d) => Boolean(bounds) && String(d || "").slice(0, 10) >= bounds[0]
		&& String(d || "").slice(0, 10) <= bounds[1];
	const queued = {
		corrections: (s.approvals.attendance || []).filter((r) => r.company === company && inMonth(r.attendance_date)).length,
		leave: (s.approvals.leave || []).filter((r) => r.company === company && bounds
			&& overlaps(r.from_date, r.to_date, bounds)).length,
	};
	const corrections = got && got.corrections != null ? got.corrections : queued.corrections;
	const leave = got && got.leave != null ? got.leave : queued.leave;
	const rows = got && got.read ? got.rows.length : null;

	/* What the site will refuse, as far as this page can already tell. An unread
	   month is passed to `blockers` as one row rather than none: the site counts
	   it either way, and a page claiming "no attendance" before it had looked
	   would be inventing a refusal. */
	const wont = [
		problem,
		live ? `${label} for ${company} already has a submission — ${live.name}, ${stateOf(live)}.` : "",
		...blockers(rows == null ? 1 : rows, corrections, leave),
	].filter(Boolean);

	/* ---------------------------------------------------------------- the list */

	const scopedRows = list.rows
		.filter((r) => !s.company || r.company === s.company)
		.filter((r) => !only || r.period === ym)
		.filter((r) => {
			const q = find.trim().toLowerCase();
			if (!q) return true;
			return [r.name, r.company, r.period, periodLabel(r.period), stateOf(r), r.submitted_by, r.reopened_by]
				.join(" ").toLowerCase().includes(q);
		})
		.slice()
		.sort((a, b) => String(b.period).localeCompare(String(a.period)) || String(a.company).localeCompare(String(b.company)));
	const pages = Math.max(1, Math.ceil(scopedRows.length / per));
	const at = Math.min(page, pages - 1);
	const shown = scopedRows.slice(at * per, at * per + per);

	/* ------------------------------------------------------------------ writes */

	async function doClose() {
		setBusy(true);
		setSaid({ text: "", bad: false });
		const r = await closeMonth({ company, period: ym, remarks });
		setBusy(false);
		if (r.ok) {
			setAdding(false);
			setRemarks("");
			setSaid({
				text: `${label} for ${company} is submitted as ${r.name}. Until it is reopened, the site refuses `
					+ "any attendance, approved leave or approved correction that would change a day in it.",
				bad: false,
			});
		} else if (r.stage === "submit") {
			setSaid({
				text: `Saved as draft ${r.name}, but the site would not submit it: ${r.error} The draft is in `
					+ "the list — submit it from there once that is settled.",
				bad: true,
			});
		} else {
			setSaid({ text: `The site refused it: ${r.error} Nothing has been written.`, bad: true });
		}
		loadList();
	}

	async function doAsk() {
		const { kind, row } = ask;
		setBusy(true);
		const r = kind === "submit" ? await submitDraft(row.name)
			: kind === "reopen" ? await reopenMonth(row.name)
				: await discardDraft(row.name);
		setBusy(false);
		setAsk(null);
		const what = `${periodLabel(row.period)} for ${row.company}`;
		if (!r.ok) {
			setSaid({ text: `The site refused it: ${r.error} ${row.name} is as it was.`, bad: true });
		} else {
			setSaid({
				text: kind === "submit" ? `${what} is submitted as ${row.name}.`
					: kind === "reopen" ? `${what} is open again. ${row.name} stays, marked cancelled, as the `
						+ "record that it was closed and reopened."
						: `Draft ${row.name} is deleted. Nothing was frozen by it.`,
				bad: false,
			});
		}
		loadList();
	}

	/* ----------------------------------------------------------- the readiness */

	const staff = s.employees.filter((e) => e.company === company && e.status === "Active");
	const shifted = staff.filter((e) => e.default_shift).length;

	/** label · what it reads · ok | no | unread · why it matters */
	const enforced = [
		["The month has ended",
			!bounds ? "not a month" : problem ? `ends ${dmy(bounds[1])}` : `ended ${dmy(bounds[1])}`,
			problem ? "no" : "ok",
			"a day not yet worked would be frozen as a day nobody attended"],
		["Attendance generated",
			rows == null ? "Preview Data reads it" : `${fmt(rows)} rows`,
			rows == null ? "unread" : rows > 0 ? "ok" : "no",
			"written by the shift job from punches, never by hand"],
		["Corrections settled",
			`${corrections ? `${fmt(corrections)} open` : "none open"}${got ? "" : " in the queue"}`,
			corrections ? "no" : "ok",
			"an open correction changes a day after it was counted"],
		["Leave decided",
			`${leave ? `${fmt(leave)} Open` : "none Open"}${got ? "" : " in the queue"}`,
			leave ? "no" : "ok",
			"leave in a frozen month can no longer be approved"],
		["Not already submitted",
			list.absent ? "the site has not got the doctype" : live ? `${live.name}, ${stateOf(live)}` : "nothing yet",
			list.absent || list.state !== "ok" ? "unread" : live ? "no" : "ok",
			"one live submission per company per month"],
	];
	const advice = [
		["Shift Types defined", `${fmt(s.counts.shift || 0)} of 23`, (s.counts.shift || 0) >= 23 ? "ok" : "no",
			"a shift is what a punch is measured against"],
		["Active people with a shift", `${fmt(shifted)} of ${fmt(staff.length)}`,
			staff.length > 0 && shifted === staff.length ? "ok" : "no",
			"somebody with no shift generates nothing, and says nothing about it"],
		["Punches arriving", s.checkins.length ? `${fmt(s.checkins.length)} today` : "none today",
			s.checkins.length > 0 ? "ok" : "no",
			"the fingerprint bridge and the phone app both feed Employee Checkin"],
	];

	const pickers = (
		<>
			<label className="rfield">
				<span className="k">Company</span>
				<select aria-label="Company" value={company} onChange={(e) => setPick(e.target.value)}>
					{names.length ? null : <option value="">No company loaded</option>}
					{names.map((n) => <option key={n} value={n}>{n}</option>)}
				</select>
			</label>
			<label className="rfield">
				<span className="k">Month</span>
				<input type="month" aria-label="Month" value={ym} onChange={(e) => setYm(e.target.value)} />
			</label>
		</>
	);

	return (
		<>
			<div className="legend">
				<b className="font-display">Submit Attendance</b>
				<span>
					Closing <b>{label}</b>{company ? <> for <b>{company}</b></> : null}. Submitting freezes the month
					on the site, and payroll runs from what was frozen.
				</span>
			</div>

			{list.absent ? (
				<Gap>
					<b>Attendance Submission is not on the site yet.</b> It arrives with the app install — the
					freeze is its controller, and a custom doctype would save and submit and freeze nothing
					(CLAUDE.md §7). Until then Preview Data works and Add is refused by the site.
				</Gap>
			) : null}

			<Panel title="Submit Attendance List" cov={list.absent ? "part" : "live"} ico="▤">
				<div className="atsubbar">
					{pickers}
					<span className="grow" />
					<button type="button" className="embtn" aria-pressed={only}
						title={`Show only ${label} in the list below`}
						onClick={() => { setOnly(!only); setPage(0); }}>
						▼ Filter{only ? `: ${label}` : ""}
					</button>
					<button type="button" className="embtn pri"
						onClick={() => { setSaid({ text: "", bad: false }); setAdding(true); if (!got) readThisMonth(); }}>
						+ Add
					</button>
					<button type="button" className="embtn" disabled={!company || !bounds}
						title="The month as it stands, before it is frozen"
						onClick={() => { setShowing(true); readThisMonth(); }}>
						Preview Data
					</button>
				</div>

				{said.text && !adding ? (said.bad ? <Gap>{said.text}</Gap> : <Note>{said.text}</Note>) : null}

				<div className="dtbar mt-[.5rem]">
					<label>
						Show{" "}
						<select aria-label="Entries per page" value={per}
							onChange={(e) => { setPer(Number(e.target.value)); setPage(0); }}>
							{PER_PAGE.map((n) => <option key={n} value={n}>{n}</option>)}
						</select>{" "}
						entries
					</label>
					<label>
						Search:{" "}
						<input type="search" aria-label="Search submissions" value={find}
							onChange={(e) => { setFind(e.target.value); setPage(0); }} />
					</label>
				</div>

				{list.err && !list.absent ? <Gap>{list.err}</Gap> : null}

				{shown.length ? (
					<Scroll>
						<table>
							<thead>
								<tr>
									<th>ID</th><th>Company</th><th>Period</th><th>Status</th>
									<th className="num">Attendance rows</th><th>Submitted</th><th />
								</tr>
							</thead>
							<tbody>
								{shown.map((r) => (
									<tr key={r.name}>
										<td className="mono">{r.name}</td>
										<td>{r.company}</td>
										<td>{periodLabel(r.period)}</td>
										<td><span className={"cov " + ["part", "live", "skip"][Number(r.docstatus) || 0]}>{stateOf(r)}</span></td>
										<td className="num">{Number(r.docstatus) === 1 ? fmt(r.attendance_rows) : "—"}</td>
										<td>
											{Number(r.docstatus) === 2
												? <>reopened {dmyTime(r.reopened_on)}{r.reopened_by ? ` by ${r.reopened_by}` : ""}</>
												: r.submitted_on ? <>{dmyTime(r.submitted_on)}{r.submitted_by ? ` by ${r.submitted_by}` : ""}</> : "—"}
										</td>
										<td className="rowacts">
											{Number(r.docstatus) === 0 ? (
												<>
													<button type="button" className="embtn" onClick={() => setAsk({ kind: "submit", row: r })}>Submit</button>
													<button type="button" className="embtn bad" onClick={() => setAsk({ kind: "discard", row: r })}>Delete</button>
												</>
											) : Number(r.docstatus) === 1 ? (
												<button type="button" className="embtn" onClick={() => setAsk({ kind: "reopen", row: r })}>Reopen</button>
											) : null}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</Scroll>
				) : (
					<div className="mt-[.6rem]">
						<Empty title="No Data Found">
							{list.state !== "ok" ? "Reading the submissions…"
								: list.rows.length ? "Nothing in the list matches the filter and the search."
									: list.absent ? "There is nowhere on the site to keep one yet."
										: "No month has been submitted yet. Add closes one."}
						</Empty>
					</div>
				)}

				<div className="dtbar mt-[.5rem]">
					<span>
						Showing {scopedRows.length ? at * per + 1 : 0} to {Math.min(scopedRows.length, at * per + per)} of{" "}
						{scopedRows.length} entries
					</span>
					<span className="pager">
						<button type="button" disabled={at === 0} onClick={() => setPage(at - 1)}>Previous</button>
						<button type="button" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>Next</button>
					</span>
				</div>
			</Panel>

			{showing ? (
				<Preview s={s} company={company} ym={ym} month={month} got={got}
					onRefresh={readThisMonth} onClose={() => setShowing(false)} />
			) : null}

			<Cols>
				{/* `cov` is how much of the panel is built, not whether the month is
				    ready — "Not built" on a blocked month read as the page broken. */}
				<Panel title={`Can ${label} be closed?`} cov="live" ico="🔒">
					<Checks title="The site refuses without these" rows={enforced} />
					<div className="mt-[.8rem]">
						<Checks title="Advice — the site does not check these" rows={advice} />
					</div>
					<div className="mt-[.7rem]">
						{wont.length ? (
							<Gap>
								<b>The site would refuse {label} today.</b>
								<ul className="atsubwhy">{wont.map((w) => <li key={w}>{w}</li>)}</ul>
							</Gap>
						) : rows == null ? (
							<Note>Nothing the page can see is open. Preview Data reads the month itself — the site counts it
								again at the moment of submitting, either way.</Note>
						) : (
							<Note>Nothing the site checks is open. Add would submit {label} for {company}.</Note>
						)}
					</div>
				</Panel>
			</Cols>

			{adding ? (
				<Modal
					title={`Submit ${label}${company ? ` — ${company}` : ""}`}
					wide
					msg={said.bad ? said.text : ""}
					onClose={() => setAdding(false)}
					extra={
						<>
							<Note>
								Submitting freezes the month on the site. From then on it refuses any attendance, approved
								leave or approved correction that would change a day in it; a punch is still recorded, and
								the day it would have made waits until the month is reopened. Reopening is refused once
								salary has been processed from the month.
							</Note>
							{list.absent ? (
								<Gap>The site has not got <b>Attendance Submission</b> yet, so it will refuse this until the
									app is installed.</Gap>
							) : null}
							<div className="recform mt-[.7rem]">
								{pickers}
								<label className="rfield wide">
									<span className="k">Remarks</span>
									<textarea rows={2} aria-label="Remarks" value={remarks}
										onChange={(e) => setRemarks(e.target.value)} />
								</label>
							</div>
							<div className="mt-[.7rem]">
								{month.key === key && month.state === "loading" ? (
									<Note>Reading {label} for {company}…</Note>
								) : got ? (
									<Figures total={summarise(got.rows).total} />
								) : null}
								{wont.length ? (
									<Gap>
										<b>The site will refuse this:</b>
										<ul className="atsubwhy">{wont.map((w) => <li key={w}>{w}</li>)}</ul>
									</Gap>
								) : null}
							</div>
						</>
					}
					foot={
						<button type="button" className="embtn pri" onClick={doClose}
							disabled={busy || !company || Boolean(problem) || Boolean(live)
								|| (rows != null && blockers(rows, corrections, leave).length > 0)}>
							{busy ? "Submitting…" : `Submit ${label}`}
						</button>
					}
				/>
			) : null}

			{ask ? (
				<Modal
					title={ask.kind === "submit" ? `Submit ${periodLabel(ask.row.period)} — ${ask.row.company}?`
						: ask.kind === "reopen" ? `Reopen ${periodLabel(ask.row.period)} — ${ask.row.company}?`
							: `Delete draft ${ask.row.name}?`}
					onClose={() => setAsk(null)}
					extra={
						<p className="text-read">
							{ask.kind === "submit"
								? "From then on the site refuses any attendance, approved leave or approved correction that "
									+ "would change a day in it, until the month is reopened. It checks the month again as it "
									+ "submits, and says so if anything is still open."
								: ask.kind === "reopen"
									? "Attendance, leave and corrections in it can change again. The site refuses this once "
										+ `salary has been processed from the month. ${ask.row.name} stays, marked cancelled, as `
										+ "the record that the month was closed and reopened, and the punches the shift job set "
										+ "aside while it was closed go back to it."
									: "Only a draft can be deleted. Nothing was frozen by it."}
						</p>
					}
					foot={
						<button type="button" className={"embtn " + (ask.kind === "discard" ? "bad" : "pri")}
							disabled={busy} onClick={doAsk}>
							{busy ? "Working…" : ask.kind === "submit" ? "Submit it" : ask.kind === "reopen" ? "Reopen it" : "Delete it"}
						</button>
					}
				/>
			) : null}
		</>
	);
}

function Checks({ title, rows }) {
	return (
		<>
			<div className="text-fine text-ink-3 mb-[.3rem]">{title}</div>
			<div className="rows">
				{rows.map(([name, value, state, why]) => (
					<div className="row" key={name}>
						<span>
							{name} <span className={"cov " + CHIP[state][0]}>{CHIP[state][1]}</span>
						</span>
						<span className="val">{value}</span>
						<span className="col-[1/-1] text-fine text-ink-3">{why}</span>
					</div>
				))}
			</div>
		</>
	);
}

function Figures({ total }) {
	return (
		<Tiles>
			<Tile k="Attendance rows" n={fmt(total.rows)} />
			<Tile k="Employees" n={fmt(total.employees)} />
			{COUNTED.map(([name, k]) => <Tile key={k} k={name} n={fmt(total[k])} />)}
			{total.other ? <Tile k="Other" n={fmt(total.other)} s="a status none of these name" /> : null}
		</Tiles>
	);
}

/** Preview Data — the month as it stands, one row per person, before anything
    is frozen. People with no row at all are listed too, and counted: they are
    the ones a close would quietly pay nothing. */
function Preview({ s, company, ym, month, got, onRefresh, onClose }) {
	const label = periodLabel(ym);
	const loading = month.key === `${company}|${ym}` && month.state === "loading";
	const sum = got ? summarise(got.rows) : null;

	const people = [];
	if (got) {
		const seen = new Set();
		for (const e of s.employees) {
			if (e.company !== company) continue;
			if (e.status !== "Active" && !sum.byEmp[e.name]) continue;
			seen.add(e.name);
			people.push({ id: e.name, code: e.employee_number || e.name, name: e.employee_name || e.name });
		}
		/* Somebody with rows this month who is not in the loaded list — left
		   since, or in a company the header is not showing. Their days are in
		   the total, so they are in the table. */
		for (const r of got.rows) {
			if (seen.has(r.employee)) continue;
			seen.add(r.employee);
			people.push({ id: r.employee, code: r.employee, name: r.employee_name || r.employee });
		}
		people.sort((a, b) => String(a.name).localeCompare(String(b.name)));
	}
	const unmarked = people.filter((p) => !sum?.byEmp[p.id]).length;
	const cols = ["Emp code", "Name", ...COUNTED.map((c) => c[0]), "Other", "Days marked"];
	const line = (p) => {
		const e = sum.byEmp[p.id] || {};
		return [p.code, p.name, ...COUNTED.map((c) => e[c[1]] || 0), e.other || 0, e.rows || 0];
	};

	return (
		<Panel title={`Preview — ${label}, ${company || "no company"}`} cov="live" ico="👁">
			<div className="repbar gap-[.4rem]">
				<button type="button" className="embtn" onClick={onRefresh} disabled={loading}>
					{loading ? "Reading…" : "Refresh"}
				</button>
				<button type="button" className="embtn" disabled={!got || !people.length}
					onClick={() => download(`submit-attendance-${company}-${ym}.csv`,
						toCsv(cols, people.map(line)))}>
					Export CSV
				</button>
				<button type="button" className="embtn" onClick={onClose}>Close</button>
			</div>

			{loading && !got ? <Note>Reading {label} for {company}…</Note> : null}
			{got && got.err ? <Gap>{got.err}</Gap> : null}

			{got ? (
				<>
					<Figures total={sum.total} />
					{unmarked ? (
						<Gap>
							<b>{fmt(unmarked)} {unmarked === 1 ? "person has" : "people have"} no attendance at all</b> in
							{" "}{label}. Submitted as it stands, the month would pay {unmarked === 1 ? "them" : "each of them"}
							{" "}for nothing — check their shift and their punches before closing it.
						</Gap>
					) : null}
					{people.length ? (
						<Scroll>
							<table>
								<thead>
									<tr>{cols.map((c, i) => <th key={c} className={i > 1 ? "num" : undefined}>{c}</th>)}</tr>
								</thead>
								<tbody>
									{people.map((p) => (
										<tr key={p.id}>
											{line(p).map((v, i) => (
												<td key={cols[i]} className={i === 0 ? "mono" : i > 1 ? "num" : undefined}>
													{i > 1 && !v ? <span className="text-ink-3">—</span> : v}
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</Scroll>
					) : (
						<Empty title="Nobody here">No active employee in {company || "this company"} and no attendance
							in {label}.</Empty>
					)}
				</>
			) : null}
		</Panel>
	);
}
