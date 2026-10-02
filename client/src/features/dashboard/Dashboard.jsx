/* ---------------------------------------------------------------------------
   The front page — Factor HR's **Start Up**, in its order, less the panels
   that could only ever be empty.

   **Trimmed on 29 September 2026** to what has something behind it. F&F
   Summary, Support Escalation Matrix, Help Desk, Mood Analysis, Important
   Files, Employee Performance, the "not on this page" list and the coverage
   legend were drawn empty on purpose, as a comparison against Factor HR — and
   to the people using this every morning they were eight boxes of dashes
   between them and the numbers. The comparison lives on Settings → Module
   coverage and each module's All tab; `data/startup.js` still holds the
   placeholders' wording if any of them comes back with data behind it.

   Read off the tenant on 8 September 2026 at 3pm; the capture is
   docs/FACTOHR_SCREENS.md §6 and the panel list is `data/startup.js`. Their
   Welcome page has three tabs — Start Up, Approvals, Product Updates — and
   **no Engagement tab**: Mood Analysis, Wish Celebration, CEO Speak,
   Announcements and Important Files are all on Start Up itself. So this app's
   separate Engagement page went, and what could be built of it came here.

   The rule that decides what each panel says is the same rule the rest of this
   app runs on: **every number here is one the site actually answered.** Where a
   panel has no data behind it, it says so and says what it would need — it does
   not draw a plausible figure.

   That is not caution for its own sake. This dashboard is read beside Factor
   HR to decide what is missing, and a fabricated "92% attendance" is worse than
   an empty panel: the empty panel gets fixed, and the invented one gets quoted
   in a meeting.

   What each widget reads, and when it was fetched:

     Employees Summary         `employees` — active, joined this month, left
     Employee Attendance Sum.  `checkins`, today's, and `approvals.leave`
     Quick Links / Reports     nothing — they are their ten and their nine,
                               pointed at the page here that answers each
     Leave Requests            `approvals.leave` — open applications only
     Pending Approvals         `approvals.attendance` + `approvals.leave`
     Wish Celebration          `date_of_birth` / `date_of_joining`, day kept
     Payroll Summary           `ctc` off the employee list, where the site has
                               it. Their six tiles are all Salary Slip states
                               and no payroll has been run, so all six read "—"
     Recruitment Status        `cands` — read on demand, see the button on it
     Recent Activities         punches, corrections, leave and letters, merged
     Headcount by …            `employees`, grouped

   Everything except Recruitment is already in the store by the time this page
   draws, so opening the dashboard costs no requests at all.
   --------------------------------------------------------------------------- */

import { useEffect, useState } from "react";

import { useApp } from "@/store";
import { listAll } from "@/api/client";
import { loadCandidates } from "@/api/load";
import { active, companyView, scoped } from "@/lib/scope";
import { dmy, fmt, initials, isoAgo, MON, tally, tidyDept, todayIso } from "@/lib/format";
import {
	attendanceToday, byStanding, celebrations, findPeople, futureLeave, joinersByMonth,
	mergeActivity, startupBuckets,
} from "@/lib/summary";
import { Bars, Cols, Empty, Html, Note, Panel, Tile, Tiles } from "@/components/ui";
import { Columns, Donut, Meter, Stat, Stats } from "@/components/charts";
import Link from "@/routes/Link";
import { LocCell } from "@/components/PunchMap";
import { ATT_BUCKETS, PAYROLL_TILES, QUICK_LINKS, QUICK_REPORTS } from "@/data/startup";
import { isHidden } from "@/data/sections";

/** Quick Links and Quick Reports, less the ones whose page is hidden. A link
    into a hidden module lands back on this page, which reads as a broken
    link; left off, it comes back by itself when the module is shown again. */
export const shownLinks = (rows) => rows.filter(([, section, subtab]) =>
	!section || !(isHidden(section) || isHidden(section, subtab)));

/** Every panel on this page, so Collapse All can name them.

    Their Expand All / Collapse All, read off the Welcome page. Written out
    rather than discovered from the DOM, because a control that shuts "whatever
    happens to be rendered" behaves differently on a site with no punches than
    on one with a full day of them. `tests/startup.test.js` checks this list
    against the titles actually drawn. */
export const PANELS = [
	"Employee Attendance Summary",
	"Quick Links",
	"Quick Reports",
	"Payroll Summary",
	"Wish Celebration",
	"CEO Speak",
	"Announcements",
	"Leave Requests",
	"Pending Approvals",
	"Headcount by company",
	"Headcount by department",
	"New joiners",
	"Recruitment Status",
	"Recent Activities",
];

/** The four sources the feed is merged from, each row carrying its own kind so
    the timeline can colour the node — four kinds of event down one rule is only
    readable if they are told apart.

    The merging and the ordering are `lib/summary.js`; what is here is the
    wording, which is the half that needs JSX. */
function activitySources(s) {
	const nameOf = (id, fallback) => (s.byName[id] || {}).employee_name || fallback || id || "—";
	return [
		s.checkins.map((c) => ({
			id: "ci:" + c.name,
			kind: c.log_type === "OUT" ? "doc" : "in",
			at: String(c.time || ""),
			what: (
				<>
					<b>{nameOf(c.employee)}</b> punched {c.log_type === "OUT" ? "out" : "in"}{" "}
					<LocCell r={c} e={s.byName[c.employee]} compact />
				</>
			),
		})),
		(s.approvals.attendance || []).map((r) => ({
			id: "reg:" + (r.name || r.employee),
			kind: "",
			at: String(r.creation || r.attendance_date || ""),
			what: <><b>{nameOf(r.employee, r.employee_name)}</b> asked for a correction on {dmy(r.attendance_date)}</>,
		})),
		(s.approvals.leave || []).map((r) => ({
			id: "lv:" + (r.name || r.employee),
			kind: "leave",
			at: String(r.creation || r.posting_date || ""),
			what: <><b>{nameOf(r.employee, r.employee_name)}</b> applied for {r.leave_type || "leave"}</>,
		})),
		s.letters.map((l) => ({
			id: "let:" + l.name,
			kind: "doc",
			at: String(l.letter_date || l.creation || ""),
			what: <><b>{nameOf(l.employee, l.employee_name)}</b> was issued a {l.letter_type || "letter"}</>,
		})),
	];
}

/** A stamp as a person would say it: the clock for something today, the date
    for anything older. */
function when(at) {
	const day = at.slice(0, 10);
	if (day === todayIso()) return at.length > 10 ? at.slice(11, 16) : "today";
	return dmy(day);
}

/** `company` pins this page to one company and takes the top-bar picker out of
    the decision — that is what the per-company dashboards pass and it is the
    only thing that makes them different from this one. Left out, the picker
    decides, which is what Start Up wants. `companyView` is where the narrowing
    is, including the four person-keyed lists this page used to read unscoped. */
export default function Dashboard({ company }) {
	const s = companyView(useApp(), company);
	const all = scoped(s);
	const a = active(s);

	/* Their own three controls, read off the page on 8 September 2026: the
	   Active / InActive / All switch above the headline counts, the Search
	   inside the attendance summary, and Expand All / Collapse All over the
	   panels. `data/actions.js` is the capture. */
	const [standing, setStanding] = useState("active");
	const [find, setFind] = useState("");
	const [shut, setShut] = useState(() => new Set());

	/* Their Announcements and CEO Speak panels, which are one doctype here.
	   Read on open rather than with the first load: a notice is four rows on a
	   good day, and putting it in the shared load would make every other screen
	   in this app wait for it. */
	const [notices, setNotices] = useState([]);
	useEffect(() => {
		let live = true;
		listAll("Manna Announcement",
			["name", "kind", "title", "body", "published", "from_date", "to_date", "posted_by", "posted_on"])
			.then((rows) => { if (live) setNotices(rows); })
			/* An empty list on a site that has not got the doctype yet. The panel
			   already says what an empty one means, and a red box on the front page
			   about a notice board nobody has used reads as a fault. */
			.catch(() => {});
		return () => { live = false; };
	}, []);

	const today = todayIso();
	const liveNotices = notices.filter((n) => {
		if (!Number(n.published)) return false;
		if (n.from_date && today < String(n.from_date).slice(0, 10)) return false;
		if (n.to_date && today > String(n.to_date).slice(0, 10)) return false;
		return true;
	});
	const noticesOf = (kind) => liveNotices
		.filter((n) => n.kind === kind)
		.sort((x, y) => String(y.from_date || "").localeCompare(String(x.from_date || "")));

	/* Whose counts the page is showing. Their tab counts InActive as everybody
	   not Active — Inactive, Suspended and Left together — so this does too, or
	   the two screens disagree by exactly the suspended. */
	const scope = byStanding(all, standing);
	const found = findPeople(scope, find);

	/* One panel's chevron. A Set rather than a flag per panel: Collapse All is
	   one assignment, and a panel added later needs no new state. */
	const fold = (title) => setShut((was) => {
		const next = new Set(was);
		if (next.has(title)) next.delete(title); else next.add(title);
		return next;
	});
	const att = attendanceToday(s.checkins, s.approvals.leave, a.length);

	const waitingAtt = (s.approvals.attendance || []).length;
	const waitingLv = (s.approvals.leave || []).length;
	const waiting = waitingAtt + waitingLv;

	const depts = new Set(a.map((e) => tidyDept(e.department)).filter((d) => d && d !== "—"));
	const joined90 = a.filter((e) => e.date_of_joining && e.date_of_joining >= isoAgo(90)).length;
	/* Their "New Employees" reads 0 today, on a month nobody joined. This month
	   rather than ninety days, because that is the figure sitting next to it on
	   their screen and a different window would read as a discrepancy. */
	const joinedMonth = a.filter(
		(e) => e.date_of_joining && String(e.date_of_joining).slice(0, 7) === todayIso().slice(0, 7)
	).length;

	/* Factor HR's own six. `late` comes back null — see ATT_BUCKETS. */
	const buckets = startupBuckets(att, a.length, futureLeave(s.approvals.leave, todayIso()));

	/* Their Wish Celebration, over the window their fourth tab uses. Birthdays
	   and work anniversaries only: ERPNext's Employee has no wedding date under
	   any name, so the third of their three tabs cannot be filled. */
	const wishes = celebrations(a, todayIso(), 30);
	const birthdays = wishes.filter((w) => w.kind === "birthday");
	const anniversaries = wishes.filter((w) => w.kind === "work");

	/* CTC is on the long employee read and absent from the short one — a site
	   that refused the long list leaves every one of these null, which is a
	   different thing from a company that has not filled them in. Both are
	   reported, because the fix for each is different. */
	const withCtc = a.filter((e) => Number(e.ctc) > 0);
	const ctcTotal = withCtc.reduce((t, e) => t + Number(e.ctc || 0), 0);

	/* `MON` here rather than in `summary.js`: that file is pure arithmetic and
	   has no business knowing how a month is spelled. */
	const joiners = joinersByMonth(a, new Date()).map((m) => ({ ...m, label: MON[m.month] }));

	const cands = s.cands || [];
	const candBy = tally(cands.map((c) => ({ st: c.boarding_status || "—" })), "st");

	const feed = mergeActivity(activitySources(s));

	return (
		<>
			{/* **Their four, in their four words.** Factor HR's Employees Summary
			    reads Active / New / Left / Licensed, and those are the figures
			    somebody is holding this screen up against. Departments and the
			    approval count moved to the panels that already draw them. */}
			{/* **Their own toolbar, in their own words.** Active / InActive / All
			    sits above the headline counts on their page; Search is inside the
			    attendance summary and is lifted here because it filters the same
			    people every panel below counts; Expand All and Collapse All are
			    theirs over the panels.

			    The switch changes what the four cards count and nothing else on
			    the page pretends otherwise — a filter that silently applied to
			    half the panels would be worse than none. */}
			<div className="embar startbar">
				<div className="segs" role="group" aria-label="Which employees">
					{[["active", "Active"], ["inactive", "InActive"], ["all", "All"]].map(([k, label]) => (
						<button key={k} type="button" className="embtn" aria-pressed={standing === k}
							onClick={() => setStanding(k)}>
							{label} <span className="n">{fmt(byStanding(all, k).length)}</span>
						</button>
					))}
				</div>
				<label className="find">
					<span aria-hidden="true">🔎</span>
					<input type="search" value={find} placeholder="Search name, code, department…"
						aria-label="Search employees" onChange={(e) => setFind(e.target.value)} />
				</label>
				<span className="grow" />
				<button type="button" className="embtn" onClick={() => setShut(new Set())}>Expand All</button>
				<button type="button" className="embtn"
					onClick={() => setShut(new Set(PANELS))}>Collapse All</button>
			</div>

			{find.trim() ? (
				<Note>
					<b>{fmt(found.length)}</b> of {fmt(scope.length)} match “{find}”.{" "}
					{found.length
						? "The search finds people; the counts below are still for everyone."
						: "Nobody matches that search."}
				</Note>
			) : null}

			<Stats>
				<Stat ico="✅" k="Active Employees" n={fmt(a.length)} tone="good"
					s={`${fmt(depts.size)} departments`} />
				<Stat ico="📈" k="New Employees" n={fmt(joinedMonth)} tone={joinedMonth ? "info" : undefined}
					s="joined this month" />
				<Stat ico="👋" k="Left Employees" n={fmt(all.length - a.length)}
					s="no longer with the group" />
				{/* Their fourth was Licensed Employees, which is what factoHR
				    bills for. ERPNext does not charge per head, so it could only
				    ever read "—" — a card that never changes is a card people
				    learn to skip. What is waiting on somebody is the number HR
				    acts on first thing, so it has the slot. */}
				<Stat ico="📥" k="Waiting approval" n={fmt(waiting)} tone={waiting ? "warn" : undefined}
					s="corrections and leave" />
			</Stats>

			<Cols>
				<Panel title="Employee Attendance Summary" cov={s.checkins.length ? "live" : "part"} ico="🕒" shut={shut.has("Employee Attendance Summary")} onToggle={() => fold("Employee Attendance Summary")}>
					{/* Their six words, in their order. It is what HR reads every
					    morning, and re-sorting it into something tidier would break
					    the comparison this page exists for. */}
					<div className="stiles">
						{ATT_BUCKETS.map(([key, label, ico, why]) => (
							<div className={"stile" + (buckets[key] == null ? " off" : "")} key={key} title={why.replace(/\*\*/g, "")}>
								<span className="sico" aria-hidden="true">{ico}</span>
								<b>{buckets[key] == null ? "—" : fmt(buckets[key])}</b>
								<span className="sk">{label}</span>
							</div>
						))}
					</div>
					<Donut
						total={a.length}
						caption="active today"
						label={`Today: ${att.done} completed, ${att.still} still in, ${att.leave} on leave,`
							+ ` ${att.absent} not yet in, of ${a.length} active`}
						parts={[
							{ key: "done", label: "In and out", n: att.done, c: 1 },
							{ key: "still", label: "Still in", n: att.still, c: 2 },
							{ key: "leave", label: "On leave", n: att.leave, c: 3 },
							{ key: "absent", label: "Not yet in", n: att.absent, c: "rest" },
						]}
					/>
					{s.checkins.length === 0 ? (
						<Note>
							No punches have reached the site today.
						</Note>
					) : null}
				</Panel>

				{/* Their Quick Links and Quick Reports, in their order. Eight of the
				    ten and seven of the nine land on a real page here; the rest say
				    what they are instead of being quietly dropped, because a link
				    missing from a list somebody is comparing against theirs is the
				    one kind of gap this project exists to make visible. */}
				<Panel title="Quick Links" cov="live" ico="🔗" shut={shut.has("Quick Links")} onToggle={() => fold("Quick Links")}>
					<ul className="quicklist">
						{shownLinks(QUICK_LINKS).map(([label, section, subtab, why]) => (
							<li key={label}>
								{section ? (
									<Link section={section} subtab={subtab}>{label}</Link>
								) : (
									<span className="gone" title={why}>{label}</span>
								)}
							</li>
						))}
					</ul>
				</Panel>

				<Panel title="Quick Reports" cov="live" ico="📑" shut={shut.has("Quick Reports")} onToggle={() => fold("Quick Reports")}>
					<ul className="quicklist">
						{shownLinks(QUICK_REPORTS).map(([label, section, subtab, why]) => (
							<li key={label}>
								{section ? (
									<Link section={section} subtab={subtab}>{label}</Link>
								) : (
									<span className="gone" title={why}>{label}</span>
								)}
							</li>
						))}
					</ul>
				</Panel>

				{/* Their Payroll Summary, tile for tile. Every one of the six is a
				    `Salary Slip` state, and **nothing on this site has run a
				    payroll** — so they read "—" rather than 0. The difference
				    matters on a screen held up beside Factor HR's: a zero says
				    134 people were not paid, and a dash says nobody has asked. */}
				<Panel title="Payroll Summary" cov={withCtc.length ? "part" : "none"} ico="💰" shut={shut.has("Payroll Summary")} onToggle={() => fold("Payroll Summary")}>
					<div className="stiles">
						{PAYROLL_TILES.map(([label, why]) => (
							<div className="stile off" key={label} title={why}>
								<b>—</b>
								<span className="sk">{label}</span>
							</div>
						))}
					</div>
					<div className="mt-[.8rem]">
						<Meter n={withCtc.length} of={a.length} tone="good"
							label="Active employees with a CTC on file"
							hint="Read off the Employee record. It is what a salary structure would be built from, not a payslip." />
					</div>
					<div className="mt-[.8rem]">
						<Tiles>
							<Tile k="CTC on file" n={ctcTotal ? "₹" + fmt(Math.round(ctcTotal)) : "—"}
								s={`a year, across ${fmt(withCtc.length)} people`} />
						</Tiles>
					</div>
				</Panel>


				{/* Their Wish Celebration. Birthdays and work anniversaries are both
				    off the Employee record and both real; their third tab is
				    marriages, and ERPNext has no wedding date under any name.

				    The year is thrown away and the day is kept — a birthday recurs
				    and the stored date does not. See `lib/summary.celebrations`. */}
				<Panel title="Wish Celebration" cov={wishes.length ? "live" : "part"} ico="🎂" shut={shut.has("Wish Celebration")} onToggle={() => fold("Wish Celebration")}>
					{wishes.length === 0 ? (
						<Empty title="Nobody to wish in the next 30 days">
							Birthdays and work anniversaries show here. If this looks wrong,
							check that dates of birth are filled in on Employee Master.
						</Empty>
					) : (
						<>
							<div className="wishtabs">
								<span><b>{fmt(birthdays.length)}</b> Birthdays</span>
								<span><b>{fmt(anniversaries.length)}</b> Work</span>
								<span className="off" title="ERPNext's Employee has no wedding date under any name.">
									<b>—</b> Marriage
								</span>
							</div>
							<ul className="wishlist">
								{wishes.slice(0, 6).map((w) => (
									<li key={w.kind + w.name}>
										<span className="av" aria-hidden="true">{initials(w.employee_name)}</span>
										<span className="who">
											<b>{w.employee_name || w.name}</b>
											<em>{tidyDept(w.department) || "—"}{w.designation ? " · " + w.designation : ""}</em>
										</span>
										<span className="on">
											{w.kind === "work" ? `${w.years} yr` : "🎂"} · {w.on.split("-").reverse().join("-")}
											{w.inDays === 0 ? " · today" : ""}
										</span>
									</li>
								))}
							</ul>
						</>
					)}
				</Panel>



				{/* **Their Announcements and CEO Speak, and these two are live.**

				    They were on the not-built list this morning and are not now: the
				    doctype behind them is `Manna Announcement`, one shape with a kind,
				    and Dashboard → Announcements & CEO Speak writes it. Empty in Factor
				    HR is still the finding — nobody there has ever posted one — but an
				    empty panel with a way to fill it is a different thing from an empty
				    panel without one. */}
				{["CEO Speak", "Announcement"].map((kind) => {
					const label = kind === "CEO Speak" ? "CEO Speak" : "Announcements";
					const rows = noticesOf(kind);
					return (
						<Panel key={kind} title={label} cov={rows.length ? "live" : "part"}
							ico={kind === "CEO Speak" ? "🗣" : "📣"}
							shut={shut.has(label)} onToggle={() => fold(label)}>
							{rows.length === 0 ? (
								<Empty title="Nothing posted yet">
									Post one from <Link section="dashboard" subtab="notices">
									Announcements &amp; CEO Speak</Link>.
								</Empty>
							) : (
								<ul className="wishlist">
									{rows.slice(0, 4).map((n) => (
										<li key={n.name} className="upd">
											<span className="who">
												<b>{n.title}</b>
												<em>
													{n.posted_by || "—"}
													{n.posted_on ? ` · ${dmy(n.posted_on)}` : ""}
													{n.to_date ? ` · until ${dmy(n.to_date)}` : ""}
												</em>
												<Html className="text-read text-ink-2" html={n.body || ""} />
											</span>
										</li>
									))}
								</ul>
							)}
						</Panel>
					);
				})}


				{/* ---------------------------------------------------------------
				    **Below here is not on their page.**

				    Everything above is Factor HR's Start Up, panel for panel and in
				    their order, because that is the comparison this screen exists
				    for. What follows is this app's own — the approval backlog, the
				    shape of the headcount, and the two panels that say plainly what
				    the site cannot answer yet. Keeping the two halves apart is what
				    stops somebody reading an extra panel here as a missing one
				    there.
				    --------------------------------------------------------------- */}

				<Panel title="Leave Requests" cov={waitingLv ? "live" : "part"} ico="🌴" shut={shut.has("Leave Requests")} onToggle={() => fold("Leave Requests")}>
					{waitingLv === 0 ? (
						<Empty title="No open leave applications">
							Applications appear here while their status is Open. An approved or
							rejected one leaves this list and stays on the Leave module.
						</Empty>
					) : (
						<>
							<Bars pairs={tally(s.approvals.leave, "leave_type")} />
							<div className="mt-[.8rem]">
								<Meter n={waitingLv} of={a.length} tone="warn"
									label="Active employees with something open"
									hint="One person can hold more than one application, so this is applications rather than people." />
							</div>
						</>
					)}
				</Panel>

				<Panel title="Pending Approvals" cov={waiting ? "live" : "part"} ico="📥" shut={shut.has("Pending Approvals")} onToggle={() => fold("Pending Approvals")}>
					<Meter n={waitingAtt} of={Math.max(1, waiting)} tone="brand"
						label="Attendance corrections" />
					<div className="mt-[.6rem]">
						<Meter n={waitingLv} of={Math.max(1, waiting)} tone="warn" label="Leave applications" />
					</div>
					<div className="pbar mt-[.9rem] mb-0">
						<Link section="dashboard" subtab="approvals" className="embtn pri">
							Open the queue
						</Link>
					</div>
				</Panel>

				<Panel title="Headcount by company" cov="live" ico="🏭" shut={shut.has("Headcount by company")} onToggle={() => fold("Headcount by company")}>
					<Bars pairs={tally(a, "company")} />
				</Panel>

				<Panel title="Headcount by department" cov="live" ico="🗄" shut={shut.has("Headcount by department")} onToggle={() => fold("Headcount by department")}>
					<Bars pairs={tally(a.map((e) => ({ d: tidyDept(e.department) })), "d").slice(0, 8)} />
				</Panel>

				<Panel title="New joiners" cov="live" ico="📈" shut={shut.has("New joiners")} onToggle={() => fold("New joiners")}>
					<Columns rows={joiners} label="New joiners a month, six months back" />
				</Panel>

				<Panel title="Recruitment Status" cov={cands.length ? "live" : "part"} ico="🧲" shut={shut.has("Recruitment Status")} onToggle={() => fold("Recruitment Status")}>
					{s.candState === "ok" && cands.length === 0 ? (
						<Empty title="Nobody is being onboarded">
							`Employee Onboarding` answered, and it is empty. That is a real
							answer: it means no candidate has been raised on the site yet.
						</Empty>
					) : s.candState === "ok" ? (
						<>
							<Bars pairs={candBy} />
							<div className="mt-[.8rem]">
								<Meter n={cands.filter((c) => c.employee).length} of={cands.length} tone="info"
									label="Already turned into an Employee record" />
							</div>
						</>
					) : s.candState === "error" ? (
						<Empty title="The site would not answer">
							{s.candErr || "Employee Onboarding could not be read."} On a site
							without that doctype this is a 417, which is the same code a
							missing field answers — the hint above says which.
						</Empty>
					) : (
						<>
							{/* Read on demand rather than with the first load: one request
							    against a site with a daily compute limit, and most people
							    opening the dashboard are not hiring today. */}
							<p className="text-read text-ink-2">
								See where each candidate is in onboarding.
							</p>
							<div className="pbar mt-[.8rem] mb-0">
								<button type="button" className="embtn pri"
									disabled={s.candState === "loading"}
									onClick={() => loadCandidates()}>
									{s.candState === "loading" ? "Loading…" : "Show candidates"}
								</button>
							</div>
						</>
					)}
				</Panel>

			</Cols>


			<Panel title="Recent Activities" cov={feed.length ? "live" : "part"} ico="🔔" shut={shut.has("Recent Activities")} onToggle={() => fold("Recent Activities")}>
				{feed.length === 0 ? (
					<Empty title="Nothing has happened yet today">
						Punches, corrections, leave applications and issued letters appear
						here as they land.
					</Empty>
				) : (
					<div className="feedwrap">
						<ul className="feed">
							{feed.map((r) => (
								<li key={r.id} className={r.kind}>
									<span className="what">{r.what}</span>
									<span className="when">{when(r.at)}</span>
								</li>
							))}
						</ul>
					</div>
				)}
			</Panel>

		</>
	);
}
