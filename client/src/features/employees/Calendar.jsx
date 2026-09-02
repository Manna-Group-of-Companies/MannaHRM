import { patch, set, useApp } from "@/store";
import { go } from "@/routes/router";
import { dayOf, dmy, fmt, monthCells, tally, thisMonth, todayIso, weekNo, ymd } from "@/lib/format";
import { cell } from "@/lib/csv";
import { Fragment } from "react";
import { CAL_DOW, CAL_DT, CAL_MONTHS, CAL_SHOWN, CAL_TOOLS } from "@/data/masters";
import { Bars, Cols, Desk, Empty, Gap, NoteBelow, Panel, Scroll, Tile, Tiles } from "@/components/ui";
import { deskImport, deskNew, deskUrl } from "@/lib/desk";

import { active, scoped } from "@/lib/scope";

/* Factor HR's calendar screen, drawn the way it draws it: the toolbar, the
   calendar name beside its default flag, the month strip with the arrows in the
   middle, then six weeks with the week number down the gutter, the day number
   in the corner, and the days either side of the month greyed out.

   Their layout, this build's palette. Copying their navy as well would make the
   two harder to compare rather than easier.

   What is *in* the cells is ours. Their calendar shows "+ 1 more…" on every day
   of the month and nobody has ever opened one, so what it holds over there is
   unknown and nothing here pretends otherwise. */

/** Which holiday list this calendar is showing. Factor HR types a name into the
    box; here the name has to be one of ours, so it is picked rather than typed —
    a calendar named for a list that does not exist would show an empty month and
    blame the month. */
function calList(s) {
	const lists = s.holidayLists.map((h) => h.name);
	return lists.includes(s.cal.list) ? s.cal.list : lists[0] || "";
}

/** One day's entries, out of what this site can actually answer: the named
    holiday, the weekly off, and anybody whose first day it was. */
function calEntries(s) {
	const rows = s.holidays[calList(s)] || [];
	const by = {};
	const push = (k, e) => {
		(by[k] ||= []).push(e);
	};

	rows.forEach((r) => {
		const k = String(r.holiday_date).slice(0, 10);
		push(k, r.weekly_off
			? { cls: "off", text: r.description || "Weekly off" }
			: { cls: "hol", text: r.description || "Holiday" });
	});

	/* Joining dates come off the same scoped list the rest of the page uses, so
	   the company selector in the top bar means the same thing here as everywhere. */
	active(s).forEach((e) => {
		if (e.date_of_joining) {
			push(String(e.date_of_joining).slice(0, 10),
				{ cls: "join", text: (e.employee_name || e.name) + " joined" });
		}
	});

	const q = (s.cal.find || "").trim().toLowerCase();
	if (q) {
		Object.keys(by).forEach((k) => {
			by[k] = by[k].filter((e) => e.text.toLowerCase().includes(q));
			if (!by[k].length) delete by[k];
		});
	}
	return by;
}

/* Factor HR's toolbar buttons all write, and this page reads — so each of them
   opens the same job on the site. New makes an empty document; Edit and Delete
   open the list the month below is drawn from, so the toolbar acts on what is
   on screen rather than on whatever the site opens first. */
function CalToolbar({ s }) {
	const busy = s.holidayLists.length > 0 && !Object.keys(s.holidays).length;
	const list = calList(s);
	return (
		<div className="embar calbar">
			{CAL_TOOLS.map((t) => (
				<Desk
					key={t.k}
					href={s.site && (t.needsList
						? list && deskUrl(s.site, CAL_DT, list)
						: deskNew(s.site, CAL_DT))}
					title={t.tip}
					dead={t.needsList && !list
						? `There is no holiday list on the site to ${t.label.toLowerCase()}.`
						: undefined}
				>
					<span className={"cico " + t.k}>{t.ico}</span>
					{t.label}
				</Desk>
			))}
			<button
				className="embtn"
				aria-pressed={s.cal.search}
				title="Search this month’s entries"
				onClick={() => patch("cal", { search: !s.cal.search, find: s.cal.search ? "" : s.cal.find })}
			>
				<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none"
					strokeWidth="1.8" strokeLinecap="round">
					<circle cx="11" cy="11" r="7" />
					<path d="M20 20l-3.6-3.6" />
				</svg>
				Search
			</button>
			<button
				className="embtn"
				title="Back to Employee Master, which is where Factor HR’s Close returns to"
				onClick={() => go({ subtab: "overview" })}
			>
				<span className="cico close">✕</span>Close
			</button>
			<span className="ml-auto inline-flex gap-[.45rem] items-center">
				{busy && <span className="n text-[.78rem] text-ink-3">reading the holiday dates…</span>}
				<Desk href={s.site && deskImport(s.site)}
					title="Factor HR imports holidays from a spreadsheet here. Opens ERPNext's Data Import on the site — a wrong row is a day the plant is marked absent, and over there the file is previewed before anything is written.">
					⭳ Data Import ▾
				</Desk>
			</span>
		</div>
	);
}

function CalNameRow({ s }) {
	const list = calList(s);
	const lists = s.holidayLists;
	/* Factor HR's "Default Calendar" tick is our Company default holiday list.
	   Known only if the Company read came back with the field — the richer call
	   is tried first and falls back, so its absence is a real answer, not a bug. */
	const known = s.companies.some((c) => "default_holiday_list" in c);
	const defaults = s.companies.filter((c) => c.default_holiday_list === list);

	return (
		<>
			<div className="embar calname">
				<label>
					Calendar Name:{" "}
					{lists.length ? (
						<select value={list} onChange={(e) => patch("cal", { list: e.target.value, open: {} })}>
							{lists.map((h) => (
								<option key={h.name}>{h.name}</option>
							))}
						</select>
					) : (
						<input value="" placeholder="no holiday list on the site" disabled readOnly />
					)}
				</label>

				<label className="caldef">
					Default Calendar: <input type="checkbox" disabled checked={known && defaults.length > 0} readOnly />
				</label>

				<span className="n">
					{!known
						? <>whether it is the default was not read — the Company list answered without <code>default_holiday_list</code></>
						: defaults.length
							? "default for " + defaults.map((c) => c.name).join(", ")
							: "not the default calendar of any company"}
				</span>

				<label className="calgo">
					Go To Month{" "}
					<input
						type="month"
						value={s.cal.month || thisMonth()}
						onChange={(e) => e.target.value && patch("cal", { month: e.target.value, open: {} })}
					/>
				</label>
			</div>

			{s.cal.search && (
				<div className="embar">
					<span className="find">
						<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
							strokeWidth="1.8" strokeLinecap="round">
							<circle cx="11" cy="11" r="7" />
							<path d="M20 20l-3.6-3.6" />
						</svg>
						<input type="search" placeholder="Search this calendar…" aria-label="Search the calendar"
							value={s.cal.find} onChange={(e) => patch("cal", { find: e.target.value })} />
					</span>
					<span className="n text-[.8rem] text-ink-3">
						Filters what the cells show. Factor HR’s own Search dialog has never been screenshotted.
					</span>
				</div>
			)}
		</>
	);
}

function CalGrid({ s }) {
	const ym = s.cal.month || thisMonth();
	const [y, m] = ym.split("-").map(Number);
	const cells = monthCells(ym);
	const by = calEntries(s);
	const today = todayIso();

	const step = (n) => {
		const d = new Date(y, m - 1 + n, 1);
		// A day expanded in August means nothing in September.
		patch("cal", {
			month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
			open: {},
		});
	};

	return (
		<>
			<div className="calstrip">
				<button className="calnav" title="Navigate between months" aria-label="Previous month"
					onClick={() => step(-1)}>❮</button>
				<span className="calmonth">{CAL_MONTHS[m - 1]} {y}</span>
				<button className="calnav" title="Navigate between months" aria-label="Next month"
					onClick={() => step(1)}>❯</button>
			</div>

			<div className="calgrid">
				<div className="dow gut" />
				{CAL_DOW.map((d) => (
					<div className="dow" key={d}>{d}</div>
				))}

				{cells.map((d, i) => {
					const k = ymd(d);
					const out = d.getMonth() !== m - 1;
					const list = by[k] || [];
					const open = !!s.cal.open[k];
					const shown = open ? list : list.slice(0, CAL_SHOWN);
					/* The grid's very first cell carries the long date — "Jul 26, 2026" —
					   and the first of any month carries "Aug 1". Both are theirs
					   exactly, and the long date is the only place that screen names
					   the month it is showing. */
					const label = i === 0
						? `${CAL_MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`
						: d.getDate() === 1
							? `${CAL_MONTHS[d.getMonth()].slice(0, 3)} 1`
							: String(d.getDate());

					return (
						<Fragment key={k}>
							{/* The week number sits in the gutter, one cell before Sunday. */}
							{i % 7 === 0 && <div className="wk">{weekNo(d)}</div>}
							<div className={"cell" + (out ? " out" : "") + (k === today ? " today" : "")}>
								<span className="num">{label}</span>
								{shown.map((e, j) => (
									<span className={"ev " + e.cls} title={e.text} key={j}>{e.text}</span>
								))}
								{list.length > CAL_SHOWN && (
									<button
										className="more"
										onClick={() => {
											const next = { ...s.cal.open };
											if (next[k]) delete next[k];
											else next[k] = true;
											patch("cal", { open: next });
										}}
									>
										{open ? "− show less" : `+ ${list.length - CAL_SHOWN} more…`}
									</button>
								)}
							</div>
						</Fragment>
					);
				})}
			</div>
		</>
	);
}

function CalLegend({ s }) {
	const n = Object.values(calEntries(s)).reduce((t, l) => t + l.length, 0);
	const q = (s.cal.find || "").trim();
	return (
		<div className="callegend">
			<span className="ev hol">Named holiday</span>
			<span className="ev off">Weekly off</span>
			<span className="ev join">Joined that day</span>
			<span className="n">
				{fmt(n)} entries in {calList(s) || "no list"}
				{q ? ` matching “${q}”` : ""}
			</span>
		</div>
	);
}

export default function Calendar() {
	const s = useApp();
	const a = active(s);
	const noList = a.filter((e) => !e.holiday_list);
	const lists = s.holidayLists;
	const read = lists.filter((h) => s.holidays[h.name]);

	return (
		<>
			<div className="legend">
				<b className="font-display">Calendar</b>
				{lists.length ? (
					<span className="cov part">Partial</span>
				) : (
					<span className="cov none">Nothing to show</span>
				)}
				<span>Holiday lists and weekly offs — the days nobody is expected in.</span>
			</div>

			{/* The month itself first, as Factor HR opens it. The panels underneath
			    are the reconciliation: what the grid is drawn from and what it is
			    missing. */}
			<div className="calwrap">
				<CalToolbar s={s} />
				<CalNameRow s={s} />
				<CalGrid s={s} />
				<CalLegend s={s} />
			</div>

			<Cols>
				<Panel title="Holiday lists on the site" cov="live" ico="📅">
					<Tiles>
						<Tile k="Lists" n={fmt(lists.length)} cls={lists.length ? "good" : "warn"} />
						<Tile k="Assigned" n={fmt(a.length - noList.length)} cls={noList.length ? "" : "good"}
							s="active people" />
						<Tile k="No list" n={fmt(noList.length)} cls={noList.length ? "bad" : "good"}
							s={noList.length ? "no weekly off at all" : "everybody covered"} />
					</Tiles>
					{noList.length ? (
						<>
							<div className="mt-[.7rem]">
								<Gap>
									<b>{fmt(noList.length)} active people have no Holiday List.</b> A person with no
									holiday list has no weekly off, so the shift job expects them at the gate on a
									Sunday and marks them absent when they do not come. It costs them the day.
								</Gap>
							</div>
							<div className="mt-[.7rem]">
								<Bars pairs={tally(noList, "company")} />
							</div>
						</>
					) : (
						<NoteBelow>
							Everybody active has a holiday list, so nobody is expected in on their weekly off.
							This is the check that stops a Sunday reading as mass absence.
						</NoteBelow>
					)}
				</Panel>

				{lists.length > 0 && !read.length && (
					<Panel title="Dates" cov="part" ico="⏳">
						<Empty title="reading the holiday dates…" />
					</Panel>
				)}

				{read.map((h) => {
					const rows = s.holidays[h.name] || [];
					const off = rows.filter((r) => r.weekly_off).length;
					const dated = rows
						.filter((r) => !r.weekly_off)
						.sort((x, y) => String(x.holiday_date).localeCompare(String(y.holiday_date)));
					return (
						<Panel key={h.name} title={h.name} cov="live" ico="🗓">
							<Tiles>
								<Tile k="Days off" n={fmt(rows.length)} s="in the list" />
								<Tile k="Weekly off" n={fmt(off)} s="generated" />
								<Tile k="Named holidays" n={fmt(dated.length)} cls={dated.length ? "" : "warn"}
									s="festivals and national days" />
							</Tiles>
							{dated.length ? (
								<div className="mt-[.7rem]">
									<Scroll style={{ maxHeight: 260, overflowY: "auto" }}>
										<table style={{ minWidth: 0 }}>
											<thead>
												<tr><th>Date</th><th>Day</th><th>Holiday</th></tr>
											</thead>
											<tbody>
												{dated.map((r) => (
													<tr key={String(r.holiday_date)}>
														<td className="mono">{dmy(r.holiday_date)}</td>
														<td className="muted">{dayOf(String(r.holiday_date).slice(0, 10))}</td>
														<td>{r.description || "—"}</td>
													</tr>
												))}
											</tbody>
										</table>
									</Scroll>
								</div>
							) : (
								<div className="mt-[.7rem]">
									<Gap>
										Weekly offs only — <b>not one named holiday</b>. Factor HR’s calendar carries
										the festival list, and a missing festival is a day the whole plant is marked
										absent.
									</Gap>
								</div>
							)}
						</Panel>
					);
				})}

			</Cols>
		</>
	);
}
