import { useEffect } from "react";

import { getState, patch, set, useApp } from "@/store";
import { Desk, Modal, Scroll } from "@/components/ui";
import { listAll } from "@/api/client";
import { deskUrl } from "@/lib/desk";
import { fmt } from "@/lib/format";
import {
	SREP_DEFAULT, SREP_LIST_BLANK, SREP_LIST_COLS, SREP_PAGES, SREP_REPORTS,
} from "@/data/schedreport";
import { SCHED_ACTS } from "@/data/schedule";

/* ---------------------------------------------------------------------------
   **SCHEDULE REPORT LIST**, behind View Scheduled Reports in the Generate menu
   and behind ▤ List inside the wizard. Photographed 4 September 2026 — empty,
   which is the state this one will almost always be in too, for a reason that
   is written on it.

   Their chrome is DataTables': Show N entries, a search box, six sortable
   columns, "Showing 0 to 0 of 0 entries", Previous / Next. Drawn as theirs, and
   every part of it works — the search filters, the headers sort, the pager
   pages. None of that is decoration waiting for rows: if the doctype is ever
   readable here, the list is already a list.

   ## Empty, and never ambiguously

   The rows are `Auto Email Report`, and this server does not carry it (see
   data/schedreport.js, and server/src/doctypes/registry.ts, which is the list of
   models it does carry). So the read comes back 417 UnknownDoctype with the
   reason on it, and the table says *that* — in the server's own words —
   instead of "No data available in table".

   Those two sentences look the same on screen and mean opposite things. One is
   "you have no schedules" and the other is "this page cannot see your
   schedules", and a dashboard that renders the second as the first is telling
   somebody their schedules do not exist. Their empty line is kept for the case
   it is actually true of: a read that answered, with nothing in it.
   --------------------------------------------------------------------------- */

/** The fields the list needs. `report` is asked for so the rows can be held to
    the report this dialog was opened from — the list is reached from that
    report's own menu, and a list titled for one report showing every schedule
    on the site would be a different screen.

    Four fields, not five: a field the site has not got refuses the *whole* read
    with a 417, so nothing is asked for that no column shows. */
const LIST_FIELDS = ["name", "email_to", "enabled", "report"];

/** The one read this dialog makes.

    Not `useEffect`-and-forget: `state` walks "loading" → "done" | "error", and
    the error keeps what the server said rather than a sentence of this file's
    own. The server's hint is the readable half and it names the actual reason,
    which on this site is that the doctype is not carried at all. */
async function loadSchedules(report) {
	patch("sreplist", { state: "loading", err: "", rows: null });
	try {
		const rows = await listAll("Auto Email Report", LIST_FIELDS);
		/* Held to this report. A schedule for another report is somebody else's
		   row on a screen titled for this one. A row with no `report` at all is
		   kept: it is a schedule this site cannot place, and hiding it would be
		   the one way this list could lose something real. */
		patch("sreplist", {
			rows: rows.filter((r) => !r.report || r.report === report),
			state: "done", err: "", page: 0,
		});
	} catch (e) {
		/* The status is kept because it is the difference between two refusals
		   that read alike and mean different things: 417 is "this site has no
		   such doctype", anything else is "the site did not answer". Told apart
		   below rather than both explained as the allowlist. */
		patch("sreplist", {
			state: "error", err: String(e.message || e), status: e.status || 0, rows: null, page: 0,
		});
	}
}

/** What a cell holds. Kept beside the column table rather than in the row, so
    the header, the search and the sort all read a value the same way — a search
    that matched something the table does not show would be worse than one that
    matched nothing. */
function cellOf(col, r) {
	if (col.key === "name") return r.name || "";
	if (col.key === "to") return r.email_to || "";
	if (col.key === "off") return r.enabled ? "No" : "Yes";
	/* CC, BCC and Action hold nothing that can be searched or sorted: two are
	   fields this site has not got and the third is a pair of buttons. */
	return "";
}

/** Their search box searches everything visible, which is what a box with no
    label over a table has to mean. */
function matches(r, q) {
	if (!q) return true;
	const hay = SREP_LIST_COLS.map((c) => cellOf(c, r)).join(" ").toLowerCase();
	return hay.includes(q.toLowerCase());
}

/** The report this list was opened for, and never undefined. */
const reportOf = (key) => SREP_REPORTS[key] || SREP_REPORTS[SREP_DEFAULT];

/** Open the list for one report. Exported for the same reason `openSchedule`
    is: three controls open this — the menu on each of the two criteria forms,
    and ▤ List inside the wizard — and the guard belongs in one of them, not
    three. Switching report empties the search and the page rather than
    carrying one report's search onto another's rows. */
export function openScheduleList(key) {
	const cur = getState().sreplist;
	const keep = cur.for === key ? cur : SREP_LIST_BLANK(key);
	set({ sreplist: { ...keep, open: true, q: "", page: 0 } });
}

export default function ScheduleList({ onClose }) {
	const s = useApp();
	const l = s.sreplist;
	const R = reportOf(l.for);

	/* Read on open, once. The dependency is the flag rather than nothing at all
	   so that closing and reopening asks again — a list of schedules is exactly
	   the thing somebody reopens because they have just made one. */
	useEffect(() => {
		if (getState().sreplist.open) void loadSchedules(R.report);
	}, [l.open, R.report]);

	const all = l.rows || [];
	const found = all.filter((r) => matches(r, l.q.trim()));

	const col = SREP_LIST_COLS.find((c) => c.key === l.sort) || SREP_LIST_COLS[0];
	const rows = found.slice().sort((a, b) =>
		l.dir * String(cellOf(col, a)).localeCompare(String(cellOf(col, b))));

	/* The pager, and the arithmetic their footer prints. `page` is clamped
	   rather than trusted: a search that shortens the list under somebody
	   standing on page four has to land them somewhere real. */
	const pages = Math.max(1, Math.ceil(rows.length / l.size));
	const page = Math.min(l.page, pages - 1);
	const from = rows.length ? page * l.size + 1 : 0;
	const till = Math.min(rows.length, (page + 1) * l.size);
	const shown = rows.slice(page * l.size, (page + 1) * l.size);

	function sortBy(c) {
		/* Three of the six sort nothing — two are empty columns and one is a pair
		   of buttons — so their headers do not pretend to. */
		if (!c.field) return;
		patch("sreplist", c.key === l.sort ? { dir: -l.dir } : { sort: c.key, dir: 1 });
	}

	return (
		<Modal
			title={`Schedule Report List — ${R.report}`}
			wide
			onClose={onClose}
			extra={
				<div className="srepl">
					{/* Their head: the page-size select on the left, the search box on
					    the right. Both are live over whatever came back. */}
					<div className="sreplhead">
						<label className="sreplshow">
							Show
							<select value={l.size} aria-label="Entries per page"
								onChange={(e) => patch("sreplist", { size: Number(e.target.value), page: 0 })}>
								{SREP_PAGES.map((n) => <option key={n}>{n}</option>)}
							</select>
							entries
						</label>
						<span className="right">
							{/* Their reload is not on this dialog. It is here because the read
							    is real and a person who has just made a schedule on the site
							    should not have to close and reopen to see it. */}
							<button className="embtn" title="Ask the site again."
								disabled={l.state === "loading"}
								onClick={() => void loadSchedules(R.report)}>
								↻
							</button>
							<input type="search" className="sreplq" placeholder="Search"
								aria-label="Search the list"
								value={l.q}
								onChange={(e) => patch("sreplist", { q: e.target.value, page: 0 })} />
						</span>
					</div>

					<Scroll>
						<table className="srepltbl">
							<thead>
								<tr>
									{SREP_LIST_COLS.map((c) => (
										<th key={c.key} title={c.why}
											className={c.state === "build" ? "off" : undefined}
											aria-sort={c.key === l.sort ? (l.dir > 0 ? "ascending" : "descending") : undefined}>
											{c.field ? (
												<button className="sreplsort" onClick={() => sortBy(c)}>
													{c.label}
													<b aria-hidden="true">{c.key === l.sort ? (l.dir > 0 ? "↑" : "↓") : "↑↓"}</b>
												</button>
											) : (
												<>
													{c.label}
													{/* Their sort marks are on every header. Drawn dead on the
													    three that cannot sort, rather than left off: a column
													    with no mark reads as a column somebody forgot. */}
													<b className="dead" aria-hidden="true">↑↓</b>
												</>
											)}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{shown.length ? shown.map((r) => (
									<tr key={r.name}>
										<td>
											<Desk className="lnk" href={s.site && deskUrl(s.site, "Auto Email Report", r.name)}
												title="Open this schedule on the site.">
												{r.name}
											</Desk>
										</td>
										<td className="wrap">{r.email_to || "—"}</td>
										<td className="muted" title={SREP_LIST_COLS[2].why}>—</td>
										<td className="muted" title={SREP_LIST_COLS[3].why}>—</td>
										<td>{r.enabled ? "No" : "Yes"}</td>
										<td className="sreplact">
											<Desk className="embtn"
												href={s.site && deskUrl(s.site, "Auto Email Report", r.name)}
												label="Edit" title="Edit it on the site, which is the only place it can be changed.">
												✎
											</Desk>
											<button className="embtn" disabled title={SCHED_ACTS.remove}>🗑</button>
										</td>
									</tr>
								)) : (
									<tr>
										<td className="sreplnone" colSpan={SREP_LIST_COLS.length}>
											{l.state === "loading" ? "Reading the site…"
												: l.state === "error" ? "This list could not be read."
												: all.length ? "No schedule matches that search."
												: "No data available in table"}
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</Scroll>

					{/* Their footer: the count on the left, Previous / Next on the
					    right. The count is of what the search left, not of what came
					    back — DataTables' own behaviour, and the one somebody reading
					    a filtered table needs. */}
					<div className="sreplfoot">
						<span className="muted">
							Showing {fmt(from)} to {fmt(till)} of {fmt(rows.length)} entries
							{l.q.trim() && all.length !== rows.length
								? ` (filtered from ${fmt(all.length)})` : ""}
						</span>
						<span className="right">
							<button className="btn ghost" disabled={page <= 0}
								onClick={() => patch("sreplist", { page: page - 1 })}>
								Previous
							</button>
							<button className="btn ghost" disabled={page >= pages - 1}
								onClick={() => patch("sreplist", { page: page + 1 })}>
								Next
							</button>
						</span>
					</div>

					{/* Why it is empty, when it is empty because it could not ask. The
					    server's own words first, then which of the two refusals it was.
					    Both end at the same place — the site's own list, below — but a
					    doctype this API does not carry and an API that is not answering
					    are fixed by different people. */}
					{l.state === "error" ? (
						<div className="gap">
							<b>This is not "no schedules" — it is "not readable from here".</b>{" "}
							{l.err}
							{" "}
							{l.status === 417
								? "Adding a doctype to the allowlist of a process holding the site's token is a "
									+ "decision for whoever owns that key, so the list is left refused rather than "
									+ "quietly widened."
								: "That is the API refusing or absent rather than the doctype — the same answer "
									+ "every other read on this dashboard would give right now. Worth checking the "
									+ "server is running before reading anything into an empty list."}
							{" "}Every schedule on the site is one click away, below.
						</div>
					) : null}

					<div className="srepacts">
						<Desk className="btn tpl" href={s.site && deskUrl(s.site, "Auto Email Report")}
							title={SCHED_ACTS.list}>
							▤ Open the list on the site
						</Desk>
					</div>
				</div>
			}
		/>
	);
}
