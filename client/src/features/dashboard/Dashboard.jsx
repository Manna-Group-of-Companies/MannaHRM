/* ---------------------------------------------------------------------------
   The front page.

   Ten widgets, and the rule that decides what each of them says is the same
   rule the rest of this app runs on: **every number here is one the site
   actually answered.** Where a widget has no data behind it, it says so and
   says what it would need — it does not draw a plausible figure.

   That is not caution for its own sake. This dashboard is read beside Factor
   HR to decide what is missing, and a fabricated "92% attendance" is worse than
   an empty panel: the empty panel gets fixed, and the invented one gets quoted
   in a meeting.

   What each widget reads, and when it was fetched:

     the four headline cards   `employees`, `departments`  — the first load
     Attendance Overview       `checkins`, today's, and `approvals.leave`
     Leave Requests            `approvals.leave` — open applications only
     Pending Approvals         `approvals.attendance` + `approvals.leave`
     Payroll Summary           `ctc` off the employee list, where the site has it
     Recruitment Status        `cands` — read on demand, see the button on it
     Employee Performance      nothing. There is no appraisal doctype on this
                               site; the panel says which inputs it would need.
     Recent Activities         punches, corrections, leave and letters, merged
     Headcount by …            `employees`, grouped

   Everything except Recruitment is already in the store by the time this page
   draws, so opening the dashboard costs no requests at all.
   --------------------------------------------------------------------------- */

import { useApp } from "@/store";
import { loadCandidates } from "@/api/load";
import { active, scoped } from "@/lib/scope";
import { dmy, fmt, isoAgo, MON, tally, tidyDept, todayIso } from "@/lib/format";
import { attendanceToday, joinersByMonth, mergeActivity } from "@/lib/summary";
import { Bars, Cols, Empty, Legend, Note, Panel, Tile, Tiles } from "@/components/ui";
import { Columns, Donut, Meter, Stat, Stats } from "@/components/charts";
import Link from "@/routes/Link";

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
			what: <><b>{nameOf(c.employee)}</b> punched {c.log_type === "OUT" ? "out" : "in"}</>,
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

export default function Dashboard() {
	const s = useApp();
	const all = scoped(s);
	const a = active(s);
	const att = attendanceToday(s.checkins, s.approvals.leave, a.length);

	const waitingAtt = (s.approvals.attendance || []).length;
	const waitingLv = (s.approvals.leave || []).length;
	const waiting = waitingAtt + waitingLv;

	const depts = new Set(a.map((e) => tidyDept(e.department)).filter((d) => d && d !== "—"));
	const joined90 = a.filter((e) => e.date_of_joining && e.date_of_joining >= isoAgo(90)).length;

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
			<Stats>
				<Stat ico="👥" k="Total Employees" n={fmt(all.length)}
					s={`${fmt(all.length - a.length)} not active`} />
				<Stat ico="✅" k="Active Employees" n={fmt(a.length)} tone="good"
					s={`${fmt(joined90)} joined in 90 days`} />
				<Stat ico="🗂" k="Departments" n={fmt(depts.size)} tone="info"
					s={`${fmt(s.counts.designations || 0)} designations`} />
				<Stat ico="📝" k="Pending Approvals" n={fmt(waiting)} tone={waiting ? "warn" : undefined}
					s={waiting ? `${fmt(waitingAtt)} corrections · ${fmt(waitingLv)} leave` : "nothing waiting"} />
			</Stats>

			<Cols>
				<Panel title="Attendance Overview" cov={s.checkins.length ? "live" : "part"} ico="🕒">
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
							No punches have reached the site today. Until a shift is defined
							these are punches only — <b>Attendance rows are generated from
							them</b>, never written by hand. See CLAUDE.md §5.
						</Note>
					) : null}
				</Panel>

				<Panel title="Leave Requests" cov={waitingLv ? "live" : "part"} ico="🌴">
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

				<Panel title="Pending Approvals" cov={waiting ? "live" : "part"} ico="📥">
					<Meter n={waitingAtt} of={Math.max(1, waiting)} tone="brand"
						label="Attendance corrections" />
					<div className="mt-[.6rem]">
						<Meter n={waitingLv} of={Math.max(1, waiting)} tone="warn" label="Leave applications" />
					</div>
					<div className="pbar mt-[.9rem] mb-0">
						<Link section="dashboard" subtab="approvals" className="embtn pri">
							Open the queue
						</Link>
						<span className="text-fine text-ink-3">
							Five of the seven queues are field lists, not backlogs.
						</span>
					</div>
				</Panel>

				<Panel title="Headcount by company" cov="live" ico="🏭">
					<Bars pairs={tally(a, "company")} />
				</Panel>

				<Panel title="Headcount by department" cov="live" ico="🗄">
					<Bars pairs={tally(a.map((e) => ({ d: tidyDept(e.department) })), "d").slice(0, 8)} />
				</Panel>

				<Panel title="New joiners" cov="live" ico="📈">
					<Columns rows={joiners} label="New joiners a month, six months back" />
					<Note>
						Off <code>date_of_joining</code>, and it counts people still on the
						books — somebody who joined in April and left in June is not here.
					</Note>
				</Panel>

				<Panel title="Payroll Summary" cov={withCtc.length ? "part" : "none"} ico="💰">
					<Meter n={withCtc.length} of={a.length} tone="good"
						label="Active employees with a CTC on file"
						hint="Read off the Employee record. It is what a salary structure would be built from, not a payslip." />
					<div className="mt-[.8rem]">
						<Tiles>
							<Tile k="CTC on file" n={ctcTotal ? "₹" + fmt(Math.round(ctcTotal)) : "—"}
								s={`a year, across ${fmt(withCtc.length)} people`} />
							<Tile k="Payslips" n="—" s="payroll is deferred this release" />
						</Tiles>
					</div>
					<Note>
						<b>Nothing has been run.</b> Salary Structures, Payroll Entry and
						Salary Slips are all untouched on this site — the Payroll module
						draws Factor HR's screens against them and is marked Deferred on the
						rail for exactly that reason.
					</Note>
				</Panel>

				<Panel title="Recruitment Status" cov={cands.length ? "live" : "part"} ico="🧲">
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
							<p className="text-read text-ink-2">
								Candidates are read on demand rather than on every page load —
								this is one request against a site with a daily compute limit,
								and most people opening the dashboard are not hiring today.
							</p>
							<div className="pbar mt-[.8rem] mb-0">
								<button type="button" className="embtn pri"
									disabled={s.candState === "loading"}
									onClick={() => loadCandidates()}>
									{s.candState === "loading" ? "Reading…" : "Read the pipeline"}
								</button>
							</div>
						</>
					)}
				</Panel>

				<Panel title="Employee Performance" cov="none" ico="⭐">
					<Empty title="No review cycle exists on this site">
						Nothing here is a placeholder for a number that could be worked out:
						there is no appraisal record on the site to work one out from.
					</Empty>
					<div className="mt-[.8rem] rows">
						<Line l="Appraisal Cycle" note="who is reviewed, and over what period" />
						<Line l="Appraisal Template" note="the criteria and their weights" />
						<Line l="Goal" note="what was agreed, so a rating means something" />
					</div>
					<Note>
						All three ship with Frappe HR. Until one exists, a rating on this
						panel would be a number with nothing behind it — which on a screen
						read beside Factor HR is worse than an empty panel.
					</Note>
				</Panel>
			</Cols>

			<Panel title="Recent Activities" cov={feed.length ? "live" : "part"} ico="🔔">
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

			{/* The key to the chips on every panel above. It sat at the top of this
			    page and has been moved under it: it explains the page rather than
			    being part of it, and four rows of legend above the first number is
			    four rows nobody reads twice. */}
			<Legend
				title="Coverage against Factor HR"
				states={[
					["live", "built and running on real data"],
					["part", "built, waiting on data or shifts"],
					["none", "exists in Factor HR, not here"],
					["skip", "dropped from this release by decision"],
				]}
			/>
		</>
	);
}

/** One "this does not exist yet" row on the performance panel. Deliberately
    not the `Line` on Settings, which reports a count off the site — this one
    has no count to report, and a zero beside it would read as "the site has
    none of these" rather than "nothing asked". */
function Line({ l, note }) {
	return (
		<div className="row">
			<span>
				{l} <span className="cov none">Not built</span>
			</span>
			<span className="col-[1/-1] text-fine text-ink-3">{note}</span>
		</div>
	);
}
