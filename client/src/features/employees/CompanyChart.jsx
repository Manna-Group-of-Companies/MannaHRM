import { useEffect, useState } from "react";
import { useApp } from "@/store";
import { go } from "@/routes/router";
import { dmy, fmt, tidyDept } from "@/lib/format";
import Avatar from "@/components/Avatar";
import { HEAD_OFFICE_CHART, LEVELS, flowOf, headOfficeOf, headOfficeSeats, peopleOf } from "@/lib/hierarchy";
import { casualLeaveGroup } from "@/lib/monthlyleave";
import { makeGrades, readGrades, saveSuggested } from "@/api/hierarchy";
import { loadSeparations } from "@/api/load";
import { applicantCounts, loadOpenings } from "@/api/recruitment";
import {
	guessDesignation, openingFor, resigning, seatOfPerson, seatOfRole, seatTitle, vacatedSeats,
} from "@/lib/vacancy";
import { blankChart, cleanChart, hasChart, startFrom } from "@/lib/orgchart";
import { readChart, saveChart } from "@/api/orgchart";
import SeatResumes from "@/features/employees/SeatResumes";
import DrawnChart from "@/features/employees/DrawnChart";
import { openEmployee } from "@/features/employees/openEmployee";
import { Empty, Note } from "@/components/ui";

/* One company's flow chart (10 October 2026, third ask) — the page a box on
   Employees → Hierarchy Chart opens, at `/employees/chart`, off the menu like
   Create Employee.

   Top down: a box per level that somebody is on — Executive Director first,
   Trainee last — with an arrow from each box to the next, and one last box
   for everybody the ladder has no rung for. The head office draws all its
   people; any other company draws **office staff only** (second ask).

   A person is in a box by their grade (`Employee.grade`, an hrms Employee
   Grade named for the level), or dashed where the box is only suggested from
   the designation. Saving the suggestions, and making the seven grades the
   site needs first, are the two buttons at the top; both go as the signed-in
   person and the site's answer is shown in its words. See lib/hierarchy.js.

   **Open seats take resumes here** (12 October 2026, asked for instead of a
   Recruitment page): a head-office seat nobody is on, a seat somebody left,
   and a person serving notice each carry a button that opens SeatResumes on
   that seat's Job Opening. Which seats are open is lib/vacancy.js.

   **HR can draw the chart instead** (14 October 2026): Edit chart starts from
   the chart as drawn here, cards are dragged where they belong, added and
   removed, and each says whom it reports to. Once saved, that chart is the
   company's chart (DrawnChart.jsx, lib/orgchart.js, api/orgchart.js);
   removing it brings this automatic one back. */

/* Each person as an ID card (asked for 10 October 2026): the photo, the name,
   the code and the job, company underneath like the footer of a badge. The
   same `Avatar` Employee Master uses, so a missing or broken photo falls back
   to initials rather than a blank frame. */
const Person = ({ e, dashed, role }) => (
	<button type="button" className={"hcid" + (dashed ? " hcsuggest" : "")}
		title={dashed ? `Suggested from the designation “${e.designation || ""}” — not saved yet` : "Open this record"}
		onClick={() => openEmployee(e.name)}>
		<Avatar className="hcidava" name={e.employee_name} image={e.image} />
		<span className="hcidname">{e.employee_name || e.name}</span>
		<span className="hcidjob">{e.designation || "—"}</span>
		<span className="hcidcode mono">{e.employee_number || e.name}</span>
		<span className="hcidfoot">{role || (e.department ? tidyDept(e.department) : e.company || "")}</span>
	</button>
);

/** "Add resumes", or how many the seat's opening already holds. */
const resumesLabel = (n) => (n ? `Resumes (${fmt(n)})` : "Add resumes");

/* A seat nobody fills: the card's shape with no person in it, so the row
   still shows every department HR named — and, where somebody left it, who.
   Its button opens the resumes for the seat. */
const Vacant = ({ role, left, n, onResumes }) => (
	<div className="hcid hcvacant">
		<span className="hcidava" aria-hidden="true">?</span>
		<span className="hcidname">{left ? "Vacated" : "Not assigned"}</span>
		<span className="hcidjob">{left ? `by ${left.employee_name || left.name}` : "\u00a0"}</span>
		<span className="hcidcode">{left?.relieving_date ? `left ${dmy(left.relieving_date)}` : "\u00a0"}</span>
		<button type="button" className="embtn pri hcseatbtn" aria-label={`${resumesLabel(n)} for ${role}`} onClick={onResumes}>
			{resumesLabel(n)}
		</button>
		<span className="hcidfoot">{role}</span>
	</div>
);

/* Somebody serving notice: their card as ever, and under it the way to start
   on their replacement. */
const Leaving = ({ e, sep, role, dashed, n, onResumes }) => (
	<div className="hcslot">
		<Person e={e} role={role} dashed={dashed} />
		<span className="hcleave">Resigned{sep.relieving_date ? ` · leaves ${dmy(sep.relieving_date)}` : ""}</span>
		<button type="button" className="embtn hcseatbtn" aria-label={`Find a replacement for ${e.employee_name || e.name}`}
			onClick={onResumes}>
			{n ? resumesLabel(n) : "Find replacement"}
		</button>
	</div>
);

/** A person's card, or their Leaving card when the record says they are going. */
function Card({ e, role, dashed, ctx }) {
	const sep = ctx.sepOf[e.name];
	if (!sep || !resigning(sep)) return <Person e={e} role={role} dashed={dashed} />;
	const seat = seatOfPerson({ ...e, ...sep });
	return <Leaving e={e} sep={sep} role={role} dashed={dashed} n={ctx.count(seat)} onResumes={() => ctx.open(seat)} />;
}

/** The head office: HR's two rows, GM over the department heads. */
function HeadOffice({ company, employees, back, ctx, seats, edit }) {
	const rows = headOfficeSeats(employees);
	const filled = rows.flatMap((r) => r.seats).filter((x) => x.e).length;
	return (
		<div className="hcflow">
			<div className="hcflowhead">
				<button type="button" className="embtn" onClick={back}>‹ All companies</button>
				<h1>{company}</h1>
				{edit}
			</div>
			<p className="hcsub" style={{ width: "100%", margin: "-.4rem 0 1rem" }}>
				Head office · {fmt(filled)} {filled === 1 ? "person" : "people"}
			</p>
			{rows.map((row, i) => (
				<div key={row.label} className="hcflow" style={{ width: "100%" }}>
					{i ? <Arrow /> : null}
					<Box title={row.label} n={i + 1} fit={row.seats.length > 1 ? row.seats.length : 0}>
						{row.seats.map(({ role, e }) => {
							if (e) return <Card key={role} e={e} role={role} ctx={ctx} />;
							const seat = seats[role];
							return <Vacant key={role} role={role} left={seat.who} n={ctx.count(seat)} onResumes={() => ctx.open(seat)} />;
						})}
					</Box>
				</div>
			))}
			{ctx.panel}
		</div>
	);
}

/* Cards only (asked 10 October 2026): no box round a level, no heading, no
   count — the level is the small label over the row, and the arrow between
   rows is the whole layout. */
const Box = ({ title, n, rest, fit, children }) => (
	<section className="hcrow" aria-label={title}>
		<span className="hcrowlabel">{!rest ? <i aria-hidden="true">{n}</i> : null}{title}</span>
		<div className={"hcpeople hcrowcards" + (fit ? " hcrowfit" : "")} style={fit ? { "--seats": fit } : undefined}>{children}</div>
	</section>
);

const Arrow = () => <div className="hcflowarrow" aria-hidden="true" />;

export default function CompanyChart() {
	const s = useApp();
	const head = headOfficeOf(s.companies);
	const company = s.hcCompany || head;
	const isHead = company === head;
	const people = peopleOf(s.employees, company, head);

	/* The open seats: who is serving notice and who has left (the separations
	   read, which carries every employee's dates), the openings they are
	   recruited under, and how many resumes each holds. */
	const [openings, setOpenings] = useState({ rows: [], criteria: false, counts: {} });
	const [seat, setSeat] = useState(null);
	const readOpenings = async () => {
		try {
			const r = await loadOpenings();
			const counts = await applicantCounts(r.rows).catch(() => ({}));
			setOpenings({ rows: r.rows, criteria: r.criteria, counts });
		} catch { /* no openings read; every seat still opens its panel */ }
	};
	useEffect(() => { void loadSeparations(); void readOpenings(); }, []);
	const seps = s.sepState === "ok" ? s.seps : [];
	const today = new Date().toISOString().slice(0, 10);
	const vacated = vacatedSeats(seps, company, today, openings.rows, { officeOnly: !isHead, officeGroup: casualLeaveGroup });
	const flow = flowOf(people, { officeOnly: !isHead, officeGroup: casualLeaveGroup, keep: vacated.map((v) => v.level) });

	const ctx = {
		sepOf: Object.fromEntries(seps.map((e) => [e.name, e])),
		count: (st) => {
			const o = openingFor(openings.rows, st.title, st.company);
			return o ? openings.counts[o.name] || 0 : 0;
		},
		open: setSeat,
		panel: seat ? (
			<SeatResumes seat={seat} openings={openings.rows} criteriaOk={openings.criteria}
				onOpenings={readOpenings} onClose={() => setSeat(null)} />
		) : null,
	};

	/* Head-office seats with nobody Active on them, each with whoever last
	   held its code if they have Left. */
	const hoSeats = {};
	if (isHead) {
		const byCode = new Map(seps.map((e) => [String(e.employee_number || ""), e]));
		for (const [, row] of HEAD_OFFICE_CHART) {
			for (const [role, code] of row) {
				const left = code && byCode.get(code)?.status === "Left" ? byCode.get(code) : null;
				hoSeats[role] = seatOfRole(role, company, left?.designation || guessDesignation(role, s.designations), left);
			}
		}
	}

	const [grades, setGrades] = useState(undefined);
	const [busy, setBusy] = useState("");
	const [msg, setMsg] = useState("");
	useEffect(() => { readGrades().then(setGrades); }, []);

	const suggested = flow.boxes.reduce((n, b) => n + b.suggested.length, 0);
	const missing = LEVELS.filter((l) => !(grades || []).includes(l));
	const ready = grades !== undefined && grades !== null && missing.length === 0;
	const back = () => go({ section: "employees", subtab: "hierarchy" });
	const shown = flow.boxes.reduce((n, b) => n + b.held.length + b.suggested.length, 0) + flow.rest.length + flow.stray.length;

	const onMake = async () => {
		setBusy("make"); setMsg("");
		const r = await makeGrades(grades || []);
		setMsg(r.msg);
		setGrades(await readGrades());
		setBusy("");
	};
	const onSave = async () => {
		setBusy("save"); setMsg("");
		const r = await saveSuggested({ tiers: flow.boxes });
		setMsg(r.msg);
		setBusy("");
	};

	/* The chart HR drew, if any; `draft` is the one being edited. */
	const [drawn, setDrawn] = useState({ state: "loading", chart: blankChart(), field: false });
	const [draft, setDraft] = useState(null);
	useEffect(() => {
		let dead = false;
		setDraft(null);
		setDrawn({ state: "loading", chart: blankChart(), field: false });
		if (company) {
			readChart(company)
				.then((r) => { if (!dead) setDrawn({ state: "ok", ...r }); })
				.catch(() => { if (!dead) setDrawn({ state: "ok", chart: blankChart(), field: false }); });
		}
		return () => { dead = true; };
	}, [company]);

	const byName = Object.fromEntries((s.employees || []).map((e) => [e.name, e]));
	const sepByName = ctx.sepOf;

	/** The chart as drawn here, as rows to start the drawing from. */
	const rowsNow = () => {
		if (isHead) {
			return headOfficeSeats(s.employees).map((row) => ({
				label: row.label,
				items: row.seats.map(({ role, e }) => (e ? { kind: "person", emp: e.name } : { kind: "seat", role })),
			}));
		}
		const person = (e) => ({ kind: "person", emp: e.name });
		return [
			...flow.boxes.map((b) => ({
				label: b.level,
				items: [...b.held, ...b.suggested, ...vacated.filter((v) => v.level === b.level).map((v) => v.e)].map(person),
			})),
			{ label: "Grade that is not a level", items: flow.stray.map(person) },
			{ label: "Office staff", items: [...flow.rest, ...vacated.filter((v) => !v.level).map((v) => v.e)].map(person) },
		];
	};

	/** A seat card's opening: the head office's own names, else the company's. */
	const seatFor = (role) => ({
		...seatOfRole(role, company, guessDesignation(role, s.designations)),
		title: isHead ? seatTitle(role) : `${role} (${company})`,
	});

	/** One card's face on the drawn chart. A person who is no longer Active is
	    drawn as the seat they left. */
	const face = (c) => {
		if (c.kind === "seat") {
			const st = seatFor(c.role);
			return <Vacant role={c.role} n={ctx.count(st)} onResumes={() => setSeat(st)} />;
		}
		const e = byName[c.emp];
		if (e && e.status === "Active") return <Card e={e} ctx={ctx} />;
		const left = sepByName[c.emp] || e;
		if (!left) return <Vacant role="Unknown" n={0} onResumes={() => setSeat(seatFor("Position"))} />;
		const st = seatOfPerson(left);
		return <Vacant role={left.designation || "Position"} left={left} n={ctx.count(st)} onResumes={() => setSeat(st)} />;
	};
	const nameOf = (c) => (c.kind === "seat" ? `${c.role} (vacant)` : c.kind === "label" ? c.text
		: byName[c.emp]?.employee_name || sepByName[c.emp]?.employee_name || c.emp);

	const startEdit = () => {
		setMsg("");
		setDraft(hasChart(drawn.chart) ? drawn.chart : startFrom(rowsNow()));
	};
	const keep = async (chart, said) => {
		setBusy("chart"); setMsg("");
		const r = await saveChart(company, chart, drawn.field);
		if (r.ok) {
			setDrawn((d) => ({ ...d, chart: cleanChart(chart) }));
			setDraft(null);
			setMsg(said);
		} else {
			setMsg(`The chart was not saved: ${r.error}`);
		}
		setBusy("");
	};

	const editBtn = (
		<button type="button" className="embtn" disabled={drawn.state !== "ok" || busy !== ""} onClick={startEdit}>
			Edit chart
		</button>
	);

	if (!company) return <Empty title="No companies have been read." />;

	if (draft || hasChart(drawn.chart)) {
		return (
			<div className="hcflow">
				<div className="hcflowhead">
					<button type="button" className="embtn" onClick={back} disabled={busy !== ""}>‹ All companies</button>
					<h1>{company}</h1>
					{draft ? (
						<>
							<button type="button" className="embtn pri" disabled={busy !== ""}
								onClick={() => void keep(draft, "Chart saved.")}>
								{busy === "chart" ? "Saving…" : "Save chart"}
							</button>
							<button type="button" className="embtn" disabled={busy !== ""} onClick={() => setDraft(null)}>Cancel</button>
							<button type="button" className="embtn" disabled={busy !== ""}
								onClick={() => setDraft(startFrom(rowsNow()))}>
								Start from current chart
							</button>
							{hasChart(drawn.chart) ? (
								<button type="button" className="embtn bad" disabled={busy !== ""}
									onClick={() => void keep(blankChart(), "Drawn chart removed.")}>
									Remove drawn chart
								</button>
							) : null}
						</>
					) : editBtn}
				</div>
				{msg ? <Note>{msg}</Note> : null}
				<DrawnChart chart={draft || drawn.chart} editing={Boolean(draft)} onChange={setDraft}
					card={face} name={nameOf} people={people} />
				{ctx.panel}
			</div>
		);
	}

	if (isHead) {
		return (
			<>
				{msg ? <Note>{msg}</Note> : null}
				<HeadOffice company={company} employees={s.employees} back={back} ctx={ctx} seats={hoSeats} edit={editBtn} />
			</>
		);
	}

	return (
		<div className="hcflow">
			<div className="hcflowhead">
				<button type="button" className="embtn" onClick={back}>‹ All companies</button>
				<h1>{company}</h1>
				{editBtn}
				{grades === null ? <span className="muted">The site did not answer for Employee Grade.</span> : null}
				{grades && missing.length ? (
					<button type="button" className="embtn" disabled={busy !== ""} onClick={onMake}>
						{busy === "make" ? "Making…" : `Make the ${missing.length === 7 ? "seven levels" : `${missing.length} missing ${missing.length === 1 ? "level" : "levels"}`} on the site`}
					</button>
				) : null}
				{suggested ? (
					<button type="button" className="embtn" disabled={busy !== "" || !ready}
						title={ready ? "" : "The seven levels have to be on the site as Employee Grades first."}
						onClick={onSave}>
						{busy === "save" ? "Saving…" : `Save ${fmt(suggested)} suggested ${suggested === 1 ? "grade" : "grades"}`}
					</button>
				) : null}
			</div>
			<p className="hcsub" style={{ width: "100%", margin: "-.4rem 0 1rem" }}>
				{isHead ? "Head office" : "Office staff"} · {fmt(shown)} {shown === 1 ? "person" : "people"}
				{!isHead && people.length !== shown ? ` of ${fmt(people.length)}` : ""}
				{suggested ? ` · ${fmt(suggested)} placed from the designation, not saved yet` : ""}
			</p>
			{msg ? <Note>{msg}</Note> : null}

			{!shown && !vacated.length ? <Empty title={isHead ? "Nobody is on this company." : "No office staff on this company."} /> : null}

			{flow.boxes.map((b, i) => (
				<div key={b.level} className="hcflow" style={{ width: "100%" }}>
					{i ? <Arrow /> : null}
					<Box title={b.level} n={i + 1}>
						{b.held.map((e) => <Card key={e.name} e={e} ctx={ctx} />)}
						{b.suggested.map((e) => <Card key={e.name} e={e} dashed ctx={ctx} />)}
						{vacated.filter((v) => v.level === b.level).map(({ e }) => {
							const st = seatOfPerson(e);
							return <Vacant key={e.name} role={e.designation || b.level} left={e} n={ctx.count(st)} onResumes={() => setSeat(st)} />;
						})}
					</Box>
				</div>
			))}

			{flow.stray.length ? (
				<>
					{flow.boxes.length ? <Arrow /> : null}
					<div className="gap" style={{ width: "min(100%, 52rem)" }}>
						<h3 className="hch3">Grade that is not a level ({fmt(flow.stray.length)})</h3>
						<div className="hcpeople">
							{flow.stray.map((e) => <Person key={e.name} e={{ ...e, designation: `${e.grade} — ${e.designation || ""}` }} />)}
						</div>
					</div>
				</>
			) : null}

			{flow.rest.length || vacated.some((v) => !v.level) ? (
				<>
					{flow.boxes.length || flow.stray.length ? <Arrow /> : null}
					<Box title={isHead ? "Other staff" : "Office staff"} rest>
						{flow.rest.map((e) => <Card key={e.name} e={e} ctx={ctx} />)}
						{vacated.filter((v) => !v.level).map(({ e }) => {
							const st = seatOfPerson(e);
							return <Vacant key={e.name} role={e.designation || "Position"} left={e} n={ctx.count(st)} onResumes={() => setSeat(st)} />;
						})}
					</Box>
				</>
			) : null}
			{ctx.panel}
		</div>
	);
}
