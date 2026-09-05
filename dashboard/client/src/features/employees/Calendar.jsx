import { patch, set, useApp } from "@/store";
import { go } from "@/routes/router";
import { dayOf, dmy, fmt, monthCells, tally, thisMonth, todayIso, weekNo, ymd } from "@/lib/format";
import { download, save, toCsv } from "@/lib/csv";
import { gcalUrl, icsFor, icsName } from "@/lib/gcal";
import { Fragment } from "react";
import {
	calDelAsk, CAL_BRUSHES, CAL_DEL_WHY, CAL_DOW, CAL_DT, CAL_EDIT_ID, CAL_EDIT_SAVE_WHY,
	CAL_EDIT_WHY, CAL_IMPORT_COLS, CAL_MONTHS, CAL_NEW_BLANK, CAL_NEW_WHY, CAL_OFF, CAL_PAID_WHY,
	CAL_SHOWN, CAL_TEMPLATE_DEAD, CAL_TOOLS, CAL_WEEKDAYS, CAL_WORK, CAL_WORK_WHY, IMPORT_MENU,
} from "@/data/masters";
import {
	Bars, Cols, Desk, Empty, Gap, ImportMenu, Note, Panel, Scroll, Tile, Tiles,
} from "@/components/ui";
import { deleteHolidayList } from "@/api/load";
import { deskImport, deskNew, deskNewWith, deskUrl } from "@/lib/desk";

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
		/* A weekly off's bar is the *day type*, not the row's description — which
		   on this list is the weekday name and tells nobody anything they cannot
		   read off the column heading. Their bar says what kind of day it is, and
		   so does this one; the description keeps its place on the tooltip. See
		   CAL_OFF, and CAL_PAID_WHY for the two words of theirs that are not
		   copied. */
		push(k, r.weekly_off
			? { cls: "off", text: CAL_OFF, tip: r.description || "Weekly off" }
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

/** Whether a day already has a *type* on it, as against something that happened
    on it. A joining date is not a day type: somebody starting on a Tuesday does
    not stop it being a working day. */
const hasType = (list) => list.some((e) => e.cls === "off" || e.cls === "hol");

/** The bar every other day carries — their `Full Working Day`, blue, on every
    cell the holiday list does not mention.

    Returned rather than pushed into `calEntries` so it stays out of the count
    on the legend: twenty-six working days are not twenty-six entries in a
    holiday list, they are the absence of them, and a legend saying otherwise
    would make an empty list look full.

    Subject to the search box like everything else in a cell. A calendar
    filtered to "Gandhi" that still drew a blue bar on every other day would be
    a filter that did not filter. */
function workBar(s, list) {
	if (hasType(list)) return null;
	const q = (s.cal.find || "").trim().toLowerCase();
	if (q && !CAL_WORK.toLowerCase().includes(q)) return null;
	return { cls: "work", text: CAL_WORK, tip: CAL_WORK_WHY };
}

/** The named holidays of one list, in the shape `lib/gcal` wants.

    Weekly offs are deliberately not in it. They are generated — fifty-two
    Sundays — and fifty-two all-day events imported into somebody's personal
    calendar is fifty-two rows of noise on top of a weekend their calendar
    already draws. What people actually want out of this screen is the festival
    list, which is the part nobody can guess. */
function holidayEvents(rows) {
	return (rows || [])
		.filter((r) => !r.weekly_off)
		.map((r) => ({
			date: String(r.holiday_date).slice(0, 10),
			title: r.description || "Holiday",
		}))
		.sort((a, b) => a.date.localeCompare(b.date));
}

/** The whole calendar on screen, as a file Google imports.

    A button rather than a link, because Google's own `TEMPLATE` link carries
    exactly one event — there is no URL that means "and the other sixty". So the
    list travels as `.ics`, which their *Settings → Import & export* reads, and
    which Outlook and Apple Calendar read too. Nothing leaves this browser: the
    file is built here and saved here, and the person decides where it goes. */
function CalExport({ s }) {
	const list = calList(s);
	const events = holidayEvents(s.holidays[list]);
	return (
		<button
			className="embtn"
			disabled={!events.length}
			title={events.length
				? `Writes the ${events.length} named holidays in ${list} to an .ics file. Import it under `
					+ "Google Calendar → Settings → Import & export; Outlook and Apple Calendar open the same "
					+ "file. Weekly offs are left out — fifty-two Sundays is noise in a personal calendar, and "
					+ "the weekend is already there. Nothing is sent anywhere: the file is built in this browser."
				: !list
					? "There is no holiday list to export."
					: `${list} has no named holiday in it — only generated weekly offs, which are deliberately `
						+ "not exported."}
			onClick={() => save(icsName(list), icsFor(list, events), "text/calendar;charset=utf-8")}
		>
			⭳ Google Calendar
		</button>
	);
}

/** Their Delete.

    Two steps, both of them here. The confirm names the consequence rather than
    asking whether somebody is sure — see `calDelAsk` — and the server refuses
    outright while anything points at the calendar, with a count. The second is
    the one that matters: a confirm is a habit people click through, and a
    refusal that says "17 Employee records still point at this" is not.

    The count on the confirm is this browser's, and the server's is the site's.
    They can differ — the company filter on the top bar narrows what is loaded
    here — which is exactly why the button asks rather than deciding, and why
    the refusal is shown verbatim rather than summarised. */
function CalDelete({ s, list }) {
	const on = list ? scoped(s).filter((e) => e.holiday_list === list).length : 0;
	const busy = s.calDel === list;

	async function run() {
		if (!window.confirm(calDelAsk(list, on))) return;
		set({ calDel: list, calMsg: "", calBad: false });
		try {
			await deleteHolidayList(list);
			set({ calDel: "", calMsg: `${list} deleted. Nothing was on it.`, calBad: false });
		} catch (e) {
			set({ calDel: "", calMsg: e.message || String(e), calBad: true });
		}
	}

	return (
		<button className="embtn" disabled={!list || !!s.calDel} title={list ? CAL_DEL_WHY : ""}
			onClick={() => void run()}>
			<span className="cico delete">⊘</span>{busy ? "Deleting…" : "Delete"}
		</button>
	);
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
			{/* Their New opens the create screen rather than the site — see CalNew.
			    The other two still open the site: they act on a list that already
			    exists, and changing one changes who is expected at the gate. */}
			<button className="embtn" title={CAL_NEW_WHY}
				onClick={() => patch("cal", { mk: { ...CAL_NEW_BLANK(), on: "new" } })}>
				<span className="cico new">＋</span>New
			</button>
			{/* Their Edit opens the calendar on screen for editing, on the same grid
			    New uses — see `editable`, which is what turns the list's holiday rows
			    back into the map that grid paints from. Dead while the dates are
			    still being read, because an editor seeded from a half-read list is
			    an editor that would save a calendar with days missing. */}
			<button className="embtn" disabled={!list || !s.holidays[list]}
				title={!list ? "There is no calendar on this site to edit."
					: !s.holidays[list] ? "The days of this calendar are still being read."
						: CAL_EDIT_WHY}
				onClick={() => patch("cal", {
					mk: {
						...CAL_NEW_BLANK(), on: "edit", src: list, name: list,
						days: editable(s.holidays[list]),
					},
				})}>
				<span className="cico edit">✎</span>Edit
			</button>
			{/* Their Delete, and it acts here now. The site refuses while anybody is
			    on the calendar and says how many — see CAL_DEL_WHY — which is the
			    half worth having, and a poor thing to send somebody to another tab
			    to be told. */}
			<CalDelete s={s} list={list} />
			{CAL_TOOLS.filter((t) => t.k !== "new" && t.k !== "edit" && t.k !== "delete").map((t) => (
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
			<span className="ml-auto inline-flex gap-[.4rem] items-center">
				{busy && <span className="n text-mini text-ink-3">reading the holiday dates…</span>}
				{/* The one control on this bar that neither writes on the site nor
				    needs it to be reachable — it works off what the page already
				    holds, which is why it stays live when every Desk button beside
				    it is dead for want of a SITE_URL. */}
				<CalExport s={s} />
				{/* Their caret, and it is a menu rather than a button — the same two
				    items Categories carries, drawn by the same control. See
				    `calTemplate` for what the second one writes. */}
				<ImportMenu
					open={s.calimp}
					onToggle={() => set({ calimp: !s.calimp })}
					onClose={() => set({ calimp: false })}
					href={s.site && deskImport(s.site)}
					label={<>⭳ Data Import <b className="cx">▾</b></>}
					title="Factor HR imports holidays from a spreadsheet here. A wrong row is a day the plant is marked absent, so the import is previewed on the site before anything is written."
					items={IMPORT_MENU}
					onTemplate={list && s.holidays[list]
						? () => set({
							calMsg: `Template written — ${calTemplate(s, list)} day(s) from ${list}, `
								+ "with the ID column so a loaded file updates this calendar. "
								+ "Check Data Import's preview before it writes.",
							calBad: false,
						})
						: null}
					templateDead={CAL_TEMPLATE_DEAD}
				/>
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
					<span className="n text-fine text-ink-3">
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
				{/* The empty header over the week-number gutter. */}
				<div className="dow" />
				{CAL_DOW.map((d) => (
					<div className="dow" key={d}>{d}</div>
				))}

				{cells.map((d, i) => {
					const k = ymd(d);
					const out = d.getMonth() !== m - 1;
					/* The day type first, then what happened on the day — which is
					   the order their cells read in and the order somebody scanning a
					   month wants: what kind of day is this, and then who joined. */
					const work = workBar(s, by[k] || []);
					const list = work ? [work, ...(by[k] || [])] : (by[k] || []);
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
									<span className={"ev " + e.cls} title={e.tip || e.text} key={j}>{e.text}</span>
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
			<span className="ev off" title={CAL_PAID_WHY}>Week Off</span>
			<span className="ev work" title={CAL_WORK_WHY}>{CAL_WORK}</span>
			<span className="ev join">Joined that day</span>
			<span className="n">
				{fmt(n)} entries in {calList(s) || "no list"}
				{q ? ` matching “${q}”` : ""}
			</span>
			{/* Two words of their label, and why they are not on ours. Here rather
			    than on the bar itself, because it is a note about the comparison and
			    the bar is on twenty-six cells. */}
			<span className="n" title={CAL_PAID_WHY}>
				Theirs reads <b>Week Off Full Paid Day</b> — the pay half is not on any record here.
			</span>
		</div>
	);
}

/* ---------------------------------------------------------------------------
   New — Factor HR's create screen, drawn in place of the view one.

   Same grid, three differences: Save and Cancel in place of the five-button
   toolbar, a Calendar Name you type rather than pick, and an empty month with
   Set Default Status beside Go To Month. See the note above CAL_BRUSHES in
   data/masters.js for what each of those means here, and why Save writes a file
   rather than a document.
   --------------------------------------------------------------------------- */

/** Download template, for the calendar on screen.

    The same columns Save writes, filled from the list rather than from the
    editor — so it can be had without opening Edit at all, which is what a
    template on a toolbar is for. See CAL_TEMPLATE_WHY. */
function calTemplate(s, list) {
	const rows = (s.holidays[list] || []).slice()
		.sort((a, b) => String(a.holiday_date).localeCompare(String(b.holiday_date)));
	const dates = rows.map((r) => String(r.holiday_date).slice(0, 10));

	download(
		"holiday-list-" + (list.replace(/[^\w.-]+/g, "-") || "calendar") + ".csv",
		toCsv([CAL_EDIT_ID, ...CAL_IMPORT_COLS], rows.map((r, i) => [
			list, list, dates[0], dates[dates.length - 1], dates[i],
			r.weekly_off ? "" : (r.description || "Holiday"), r.weekly_off ? 1 : 0,
		])),
	);
	return rows.length;
}

/** A holiday list's rows as the map the editor paints from — the inverse of
    what `saveNewList` writes.

    Keyed by date, so two rows on one day collapse to one: the grid has one cell
    per day and cannot draw both, and a calendar carrying a duplicate date is a
    thing to notice on the site rather than to reproduce here. Last row wins,
    which is the order the site sent them in. */
const editable = (rows) => Object.fromEntries((rows || []).map((r) => [
	String(r.holiday_date).slice(0, 10),
	{ off: r.weekly_off ? 1 : 0, name: r.weekly_off ? "" : (r.description || "Holiday") },
]));

/** One day, painted.

    Painting a day *working* removes it rather than storing a third value: on
    ERPNext a working day is the absence of a row, and a map that held `work`
    entries would be a map that disagreed with the file it produces. */
function paint(s, k) {
	const mk = s.cal.mk;
	const days = { ...mk.days };
	if (mk.brush === "work") delete days[k];
	else if (mk.brush === "off") days[k] = { off: 1, name: "" };
	else days[k] = { off: 0, name: (mk.holname || "").trim() || "Holiday" };
	patch("cal", { mk: { ...mk, days, msg: "" } });
}

/** Every <weekday> in the month on screen, as a week off.

    `weekly_off` is on ERPNext's Holiday row precisely because this is a rule
    rather than fifty-two decisions, and Frappe's own Holiday List form carries
    a Get Weekly Off Dates button that does the same job. Painting a year of
    Sundays one cell at a time is not a thing to ask of anybody. */
function paintWeekday(s, dow) {
	const mk = s.cal.mk;
	const days = { ...mk.days };
	monthCells(s.cal.month || thisMonth()).forEach((d) => {
		if (d.getDay() === dow) days[ymd(d)] = { off: 1, name: "" };
	});
	patch("cal", { mk: { ...mk, days, msg: "" } });
}

/** The file Frappe's Data Import loads: the parent's three fields repeated down
    the rows, and one row per day picked. See CAL_IMPORT_COLS. */
function saveNewList(s) {
	const mk = s.cal.mk;
	const keys = Object.keys(mk.days).sort();
	const name = mk.name.trim();
	/* An edit carries the document's own name in front of everything else, which
	   is what an Update Existing Records run matches on — see CAL_EDIT_ID. A
	   create must not carry it: a blank ID is what tells Data Import to insert. */
	const editing = mk.on === "edit" && mk.src;
	const cols = editing ? [CAL_EDIT_ID, ...CAL_IMPORT_COLS] : CAL_IMPORT_COLS;

	download(
		"holiday-list-" + (name.replace(/[^\w.-]+/g, "-") || "new") + ".csv",
		toCsv(cols, keys.map((k) => {
			const row = [name, keys[0], keys[keys.length - 1], k,
				mk.days[k].name || "", mk.days[k].off ? 1 : 0];
			return editing ? [mk.src, ...row] : row;
		})),
	);
	return keys.length;
}

function CalNew({ s }) {
	const mk = s.cal.mk;
	const days = mk.days;
	const picked = Object.keys(days).sort();
	const name = mk.name.trim();
	const ym = s.cal.month || thisMonth();
	const [y, m] = ym.split("-").map(Number);
	const today = todayIso();

	const setMk = (part) => patch("cal", { mk: { ...mk, ...part } });
	const step = (n) => {
		const d = new Date(y, m - 1 + n, 1);
		patch("cal", { month: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") });
	};
	/* Leaving throws the picking away, so it asks — but only when there is
	   something to throw away. A confirm over an untouched form is a click
	   charged for nothing. */
	/* Leaving throws the picking away, so it asks — but only when there is
	   something to throw away. Editing always has something: the calendar's own
	   days are in the map from the moment it opens, so the question is whether
	   anything has *changed*, which is what `dirty` answers. */
	const cancel = () => {
		const dirty = mk.on === "edit"
			? JSON.stringify(mk.days) !== JSON.stringify(editable(s.holidays[mk.src]))
			: picked.length > 0;
		if (dirty && !window.confirm("Changes to this calendar have not been saved. Leave anyway?")) return;
		patch("cal", { mk: CAL_NEW_BLANK() });
	};

	const brush = CAL_BRUSHES.find((b) => b[0] === mk.brush) || CAL_BRUSHES[0];
	const editing = mk.on === "edit";

	return (
		<div className="calwrap">
			<div className="embar calbar">
				<button className="embtn" disabled={!name || !picked.length}
					title={!name ? "A calendar needs a name before it can be saved."
						: !picked.length ? "Every day has been set back to a working day, so this would save an "
							+ "empty calendar. Nothing is written."
							: editing ? CAL_EDIT_SAVE_WHY.replace(/\*\*/g, "")
								: "Write the " + picked.length + " day(s) picked as the file ERPNext's Data "
									+ "Import loads. Holiday List is not creatable through this API — it decides "
									+ "who is expected at the gate — so the document is made over there, where "
									+ "the file is previewed before anything is written."}
					onClick={() => setMk({
						msg: (editing
							? "Saved as an update file for " + mk.src + " — " + saveNewList(s) + " day(s), with "
								+ "the ID column so Update Existing Records finds this calendar. Check Data "
								+ "Import's preview: child rows arrive as additions to the days already on the "
								+ "list, because Frappe matches them by a row id this API does not read."
							: "Saved as a Data Import file — " + saveNewList(s) + " day(s). Load it on the site "
								+ "under Data Import, which shows the column mapping and every row before it "
								+ "writes."),
					})}>
					<span className="cico new">✓</span>Save
				</button>
				<button className="embtn" onClick={cancel}>
					<span className="cico close">↩</span>Cancel
				</button>

				<span className="ml-auto inline-flex gap-[.4rem] items-center">
					{/* The parent document, with what can travel in a URL already in it.
					    The days cannot: they are a child table, and Frappe's `new` route
					    takes field defaults rather than rows. That is what Save is for. */}
					{editing ? (
						<Desk href={s.site && deskUrl(s.site, CAL_DT, mk.src)}
							title="Opens this calendar on the ERPNext site, where its days can be changed one at a time by hand. Save's file is the way to carry a month of changes at once.">
							↗ Open on the site
						</Desk>
					) : (
						<Desk href={s.site && deskNewWith(s.site, CAL_DT, {
							holiday_list_name: name,
							from_date: picked[0] || "",
							to_date: picked[picked.length - 1] || "",
						})}
							title="Opens a new Holiday List on the ERPNext site with the name and the date range in it. The days themselves are a child table and cannot travel in a URL — Save's file carries those.">
							＋ New on the site
						</Desk>
					)}
				</span>
			</div>

			<div className="embar calname">
				<label>
					Calendar Name:{" "}
					{/* Read-only while editing. The name *is* the document's id on this
					    site — `Holiday List` is prompt-named — so changing it here would
					    not rename the calendar, it would silently address a different
					    one, and Data Import would make it. Renaming is `rename_doc` on
					    the site, which rewrites every record pointing at the old name. */}
					<input value={mk.name} readOnly={editing}
						placeholder="name this calendar" aria-label="Calendar name"
						title={editing ? "The name is this calendar's id on the site. Renaming one rewrites every employee pointing at it, which is a job for the site's own rename." : undefined}
						onChange={(e) => setMk({ name: e.target.value, msg: "" })} />
				</label>

				<label className="caldef">
					Default Calendar:{" "}
					<input type="checkbox" checked={mk.dflt}
						onChange={(e) => setMk({ dflt: e.target.checked })} />
				</label>
				{/* Their tick, and what it would mean here. Ticking it does not make it
				    so — the default is `Company.default_holiday_list`, a field on a
				    doctype this API cannot write — so it says what it is rather than
				    pretending to set it. */}
				<span className="n">
					{mk.dflt
						? "Company.default_holiday_list is what makes a calendar the default, and it is set on the site"
						: "not the default calendar of any company"}
				</span>

				{/* Their Set Default Status, closed in the capture. This is a reading of
				    it: the three things a day can be, as a brush for the grid below. */}
				<label className="calbrush" title={brush[2]}>
					Set Default Status{" "}
					<select value={mk.brush} onChange={(e) => setMk({ brush: e.target.value })}>
						{CAL_BRUSHES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
					</select>
				</label>

				{mk.brush === "hol" ? (
					<input className="calholname" value={mk.holname} placeholder="holiday name"
						aria-label="Holiday name" onChange={(e) => setMk({ holname: e.target.value })} />
				) : (
					<label className="calbrush" title="Mark every one of these in the month on screen as a week off — the rule `weekly_off` exists for.">
						Every{" "}
						<select value="" aria-label="Mark every weekday as a week off"
							onChange={(e) => e.target.value !== "" && paintWeekday(s, Number(e.target.value))}>
							<option value="">…</option>
							{CAL_WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
						</select>
					</label>
				)}

				<label className="calgo">
					Go To Month{" "}
					<input type="month" value={ym}
						onChange={(e) => e.target.value && patch("cal", { month: e.target.value })} />
				</label>
			</div>

			{mk.msg ? <div className="px-[.9rem] pt-[.6rem]"><Note>{mk.msg}</Note></div> : null}

			<div className="calstrip">
				<button className="calnav" title="Navigate between months" aria-label="Previous month"
					onClick={() => step(-1)}>❮</button>
				<span className="calmonth">{CAL_MONTHS[m - 1]} {y}</span>
				<button className="calnav" title="Navigate between months" aria-label="Next month"
					onClick={() => step(1)}>❯</button>
			</div>

			<div className="calgrid making">
				<div className="dow" />
				{CAL_DOW.map((d) => <div className="dow" key={d}>{d}</div>)}

				{monthCells(ym).map((d, i) => {
					const k = ymd(d);
					const out = d.getMonth() !== m - 1;
					const day = days[k];
					const label = i === 0
						? CAL_MONTHS[d.getMonth()].slice(0, 3) + " " + d.getDate() + ", " + d.getFullYear()
						: d.getDate() === 1 ? CAL_MONTHS[d.getMonth()].slice(0, 3) + " 1" : String(d.getDate());

					return (
						<Fragment key={k}>
							{i % 7 === 0 && <div className="wk">{weekNo(d)}</div>}
							{/* A button, not a div: every cell is a control on this screen,
							    and a grid that can only be painted with a mouse is a grid
							    half the people who maintain a holiday list cannot use. */}
							<button type="button"
								className={"cell" + (out ? " out" : "") + (k === today ? " today" : "")}
								title={dmy(k) + " — click to make it " + brush[1]}
								onClick={() => paint(s, k)}>
								<span className="num">{label}</span>
								{day ? (
									<span className={"ev " + (day.off ? "off" : "hol")}>
										{day.off ? CAL_OFF : day.name}
									</span>
								) : null}
							</button>
						</Fragment>
					);
				})}
			</div>

			<div className="callegend">
				<span className="ev off">{CAL_OFF}</span>
				<span className="ev hol">Named holiday</span>
				<span className="n">
					{picked.length
						? (editing ? "Editing " + mk.src + " — " : "")
							+ fmt(picked.length) + " day(s) — "
							+ fmt(picked.filter((x) => days[x].off).length) + " week off, "
							+ fmt(picked.filter((x) => !days[x].off).length) + " named"
						: editing
							? "Every day on " + mk.src + " has been set back to a working day. Saving that "
								+ "writes nothing, which is why Save is off."
							: "Nothing picked yet. Every day is a working day until it is given a status, "
								+ "which is what an empty grid means on this side as well as on theirs."}
				</span>
			</div>
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
			{/* New takes the whole screen, the way Salary Revision and Create
			    Employee do: a half-picked month sitting under a toolbar that can
			    switch calendars is a month somebody loses to a mis-click. */}
			{s.cal.mk.on ? <CalNew s={s} /> : (
				<div className="calwrap">
					<CalToolbar s={s} />
					{/* What Delete did, or what the site said when it refused. Under the
					    toolbar it came from, and the refusal is shown as it arrived —
					    the count in it is the site's and is the point. */}
					{s.calMsg ? (
						<div className="px-[.9rem] pt-[.6rem]">
							{/* The `.gap` panel, not the `Gap` component: that one prefixes
						    everything with "Missing vs Factor HR", which is what it is for
						    and is not what a refusal from this site's own API is. */}
						{s.calBad ? <div className="gap">{s.calMsg}</div> : <Note>{s.calMsg}</Note>}
						</div>
					) : null}
					<CalNameRow s={s} />
					<CalGrid s={s} />
					<CalLegend s={s} />
				</div>
			)}

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
					) : null}
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
								<>
									<div className="mt-[.7rem]">
										<Scroll style={{ maxHeight: 260, overflowY: "auto" }}>
											<table style={{ minWidth: 0 }}>
												<thead>
													{/* The last column has no heading on purpose: it is one control
													    repeated, and "Add" over a column of "＋ Google" says the same
													    word twice. */}
													<tr><th>Date</th><th>Day</th><th>Holiday</th><th /></tr>
												</thead>
												<tbody>
													{dated.map((r) => {
														const date = String(r.holiday_date).slice(0, 10);
														const title = r.description || "Holiday";
														return (
															<tr key={String(r.holiday_date)}>
																<td className="mono">{dmy(r.holiday_date)}</td>
																<td className="muted">{dayOf(date)}</td>
																<td>{title}</td>
																<td>
																	<a
																		className="lnk text-mini whitespace-nowrap"
																		href={gcalUrl({
																			date,
																			title,
																			details: `From the ${h.name} holiday list in Manna HR.`,
																		})}
																		target="_blank"
																		rel="noreferrer"
																		title={`Opens Google Calendar with ${title} filled in as an all-day event on `
																			+ `${dmy(r.holiday_date)}. Nothing is added until you press Save there — this is `
																			+ "their compose screen, in your account, not a write from this page."}
																	>
																		＋ Google
																	</a>
																</td>
															</tr>
														);
													})}
												</tbody>
											</table>
										</Scroll>
									</div>
								</>
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
