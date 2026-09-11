import { useState } from "react";

import { useApp } from "@/store";
import { active, scoped } from "@/lib/scope";
import { download, toCsv } from "@/lib/csv";
import { isoAgo, todayIso } from "@/lib/format";
import { Empty, Html, Note, Scroll } from "@/components/ui";
import { LocCell } from "@/components/PunchMap";
import { daysBetween, reportFor } from "@/data/reports";

/* ---------------------------------------------------------------------------
   One page for fifteen of Factor HR's reports.

   The spec is in `data/reports.js` and the arithmetic is in `lib/reports.js`;
   what is here is the chrome — the control that asks for a day, a month or a
   window, the table, the count, and the Export.

   **One page rather than fifteen, deliberately.** Fifteen hand-built report
   screens drift until the same column heading means two things on two of them,
   and the whole value of these is that they can be read against each other and
   against Factor HR's. It is the same argument as `ModuleAll`.

   Three things every report here does, because each was a real mistake
   somewhere before:

   - **The table and the CSV read one column list.** Two lists are two chances
     for the export to disagree with what somebody read off the screen, and the
     export is the copy that gets argued over in a meeting.
   - **The CSV writes "" where the screen writes a dash.** A dash is a thing a
     reader needs and a thing a data file must not have.
   - **The note is drawn under every report, not behind a help icon.** Each of
     these has an edge it cannot see, and a reader who has to go looking for
     that has already quoted the number.
   --------------------------------------------------------------------------- */

/** Their reports read "all employees" as everybody on the books; the
    attendance ones only ever mean the active. Left and inactive people have no
    shift, punch or leave, so including them would pad every count with rows
    that can never be anything but empty. */
const ROWS_FOR = { employees: scoped, attendance: active, leave: active };

export default function Report({ section, id }) {
	const s = useApp();
	const spec = reportFor(section, id);

	/* Their reports open on today, this month, or the last thirty days — never
	   empty and waiting to be told. A report that draws nothing until somebody
	   fills a form in reads as broken on the first visit, and the commonest
	   answer is the one already typed in. */
	const [ask, setAsk] = useState({
		day: todayIso(),
		month: todayIso().slice(5, 7),
		from: isoAgo(30),
		to: todayIso(),
	});

	if (!spec) return <Empty title="No such report">Nothing is registered at this address.</Empty>;

	const rows = spec.build(
		{
			rows: (ROWS_FOR[section] || scoped)(s), checkins: s.checkins, leave: s.approvals.leave || [],
			holidays: s.holidays, places: s.workLocs,
		},
		ask,
	);

	const csv = () => download(
		`${spec.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${todayIso()}.csv`,
		toCsv(spec.cols.map((c) => c[1]), rows.map((r) => {
			const o = {};
			spec.cols.forEach((c) => { o[c[1]] = c[3](r); });
			return o;
		})),
	);

	return (
		<>
			<div className="legend">
				<b className="font-display">{spec.ico} {spec.title}</b>
				<span>{rows.length} {rows.length === 1 ? "row" : "rows"}</span>
			</div>

			<div className="embar">
				<Ask spec={spec} ask={ask} setAsk={setAsk} />
				<span className="grow" />
				<button type="button" className="embtn" onClick={csv} disabled={rows.length === 0}>
					Export CSV
				</button>
			</div>

			{rows.length === 0 ? (
				<Empty title={spec.empty}>
					{/* The empty state says what an empty result *means* here, because it
					    is never the same thing twice: nobody has a birthday in March, and
					    no punch has reached the site today, are different problems. */}
					<Html html={spec.note} />
				</Empty>
			) : (
				<>
					<Scroll>
						<table>
							<thead>
								<tr>
									{spec.cols.map(([head, key, cls]) => (
										<th key={key} className={cls === "num" ? "num" : undefined}>{head}</th>
									))}
								</tr>
							</thead>
							<tbody>
								{rows.map((r, i) => (
									<tr key={(r.name || r.employee || "") + ":" + (r.on || r.from_date || r.month || i)}>
										{spec.cols.map(([, key, cls, val, punch]) => {
											const v = val(r);
											return (
												<td key={key} className={cls || undefined}>
													{punch ? <LocCell r={punch(r)} e={r} />
														: v === "" || v == null ? <span className="text-ink-3">—</span> : v}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					</Scroll>
					<Note><Html html={spec.note} /></Note>
				</>
			)}
		</>
	);
}

/** The one control this report needs, and nothing else.

    A day, a month, a window, or nothing. Their reports carry a filter panel of
    a dozen controls on every screen and most of them do nothing on most
    reports; drawing only the one that changes the answer is the one place this
    deliberately does not copy them. */
function Ask({ spec, ask, setAsk }) {
	const on = (k) => (e) => setAsk({ ...ask, [k]: e.target.value });

	if (spec.ask === "day") {
		return (
			<label className="inline">
				<span>Date</span>
				<input type="date" value={ask.day} onChange={on("day")} />
			</label>
		);
	}
	if (spec.ask === "month") {
		return (
			<label className="inline">
				<span>Month</span>
				<select value={ask.month} onChange={on("month")}>
					{["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((m, i) => (
						<option key={m} value={m}>
							{["January", "February", "March", "April", "May", "June", "July", "August",
								"September", "October", "November", "December"][i]}
						</option>
					))}
				</select>
			</label>
		);
	}
	if (spec.ask === "window") {
		/* The cap is drawn rather than enforced silently. A window longer than
		   `daysBetween` will walk returns a short report, and a report that is
		   quietly short is worse than one that says why. */
		const days = daysBetween(ask.from, ask.to);
		const capped = ask.from && ask.to && ask.to >= ask.from && days.length === 62;
		return (
			<>
				<label className="inline">
					<span>From</span>
					<input type="date" value={ask.from} onChange={on("from")} />
				</label>
				<label className="inline">
					<span>To</span>
					<input type="date" value={ask.to} onChange={on("to")} />
				</label>
				{capped ? <span className="text-fine text-bad">first 62 days only</span> : null}
			</>
		);
	}
	return null;
}
