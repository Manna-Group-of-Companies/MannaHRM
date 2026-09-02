import { useApp } from "@/store";
import { active } from "@/lib/scope";
import { MON, fmt } from "@/lib/format";
import { Cols, Empty, Gap, Note, NoteBelow, Panel } from "@/components/ui";

/* Submit Attendance — Factor HR's monthly freeze. HR generates and saves the
   month, payroll runs from that saved copy, and it cannot be deleted once
   salary has been processed. Frappe HR has no equivalent gate at all.

   So this page is a readiness check rather than a button: it says what would
   have to be true before a month could honestly be closed, against live
   numbers. A Submit that could be pressed today would freeze nothing. */
export default function SubmitAttendance() {
	const s = useApp();
	const now = new Date();
	const period = MON[now.getMonth()] + "-" + String(now.getFullYear()).slice(2);
	const a = active(s);
	const shifted = a.filter((e) => e.default_shift).length;
	const pend = (s.approvals.attendance || []).length;

	/* label · what it reads today · is it ready · why it matters. */
	const checks = [
		["Shift Types defined", `${fmt(s.counts.shift || 0)} of 23`, (s.counts.shift || 0) >= 23,
			"a shift is what a punch is measured against"],
		["Active people with a shift", `${fmt(shifted)} of ${fmt(a.length)}`,
			a.length > 0 && shifted === a.length,
			"somebody with no shift generates nothing, and says nothing about it"],
		["Punches arriving", s.checkins.length ? `${fmt(s.checkins.length)} today` : "none today",
			s.checkins.length > 0,
			"the fingerprint bridge and the phone app both feed Employee Checkin"],
		["Attendance generated", `${fmt(s.counts.attendance || 0)} rows`, (s.counts.attendance || 0) > 0,
			"written by the shift job from punches, never by hand"],
		["Corrections settled", pend ? `${fmt(pend)} pending` : "none pending", pend === 0,
			"an open correction changes a day after it was counted"],
	];
	const blocked = checks.filter((c) => !c[2]).length;

	return (
		<>
			<div className="legend">
				<b className="font-display">Submit Attendance</b>
				<span className="cov none">Not built</span>
				<span>
					Period <b>{period}</b>
					{s.company ? <> for <b>{s.company}</b></> : " across the group"}. Factor HR closes a month
					here and payroll runs from what was closed.
				</span>
			</div>

			<Panel title="Submit Attendance List" cov="none" ico="▤">
				<div className="repbar gap-[.4rem]">
					<button className="btn ghost" disabled
						title="Factor HR filters this list; with no rows on either side there is nothing to filter.">
						▼ Filter
					</button>
					<button className="btn ghost" disabled
						title="Creating a submission is a write, and there is no doctype behind it yet. This is the button the whole page is about.">
						+ Add
					</button>
					<button className="btn ghost" disabled
						title="Preview Data shows the month as it stands before it is frozen. Nothing to preview until attendance is being generated — see the readiness check below.">
						Preview Data
					</button>
				</div>

				<div className="dtbar">
					<label>
						Show{" "}
						<select disabled>
							<option>10</option>
						</select>{" "}
						entries
					</label>
					<label>
						Search: <input disabled />
					</label>
				</div>

				<div className="dtbar mt-2">
					<span>Showing 0 to 0 of 0 entries</span>
					<span className="pager">
						<button disabled>Previous</button>
						<button disabled>Next</button>
					</span>
				</div>

				<div className="mt-[.6rem]">
					<Empty title="No Data Found">No submitted month here, and none there either.</Empty>
				</div>

				<NoteBelow>
					<b>Factor HR's own list reads the same</b> on 28 Aug 2026 — <em>No Submit Attendance Data
					Available, please create new submit attendance</em>. Unless a filter was hiding rows,{" "}
					<b>no month has ever been submitted in this tenant</b>. The gate exists in the product and
					Manna has not used it.
				</NoteBelow>

				<div className="mt-[.7rem]">
					<Gap>
						Whether the monthly freeze is a control Manna actually wants, or one they have already
						decided to live without.
					</Gap>
				</div>

				<NoteBelow>
					This is worth raising before it is built. The freeze was on the list as{" "}
					<b>a control your team has today and would otherwise lose</b> — and on this evidence they
					have it and do not use it. That does not settle it: payroll is calculated by hand, so the
					discipline may live in a spreadsheet instead, and an empty list is exactly what you would
					expect if it does. <b>It is a question for HR, not a conclusion.</b>
				</NoteBelow>
			</Panel>

			<Cols>
				<Panel title={`Can ${period} be closed?`} cov={blocked ? "none" : "part"} ico="🔒">
					<div className="rows">
						{checks.map((c) => (
							<div className="row" key={c[0]}>
								<span>
									{c[0]} <span className={"cov " + (c[2] ? "live" : "none")}>{c[2] ? "ready" : "not yet"}</span>
								</span>
								<span className="val">{c[1]}</span>
								<span className="col-[1/-1] text-[.8rem] text-ink-3">{c[3]}</span>
							</div>
						))}
					</div>
					<div className="mt-[.7rem]">
						{blocked ? (
							<Gap>
								<b>{blocked} of the five are not ready</b>, so there is nothing to close. A month
								submitted now would freeze a page of zeros and hand it to payroll as fact.
							</Gap>
						) : (
							<Note>All five are ready. What is missing is the document that records the closing.</Note>
						)}
					</div>
				</Panel>

			</Cols>
		</>
	);
}
