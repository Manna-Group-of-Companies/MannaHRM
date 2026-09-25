import { getState, patch, update, useApp } from "@/store";
import { useEffect } from "react";
import { loadLeaveFor } from "@/api/load";
import { deskNewWith, deskUrl } from "@/lib/desk";
import { CAL_MONTHS } from "@/data/masters";
import { DAY, dmy, fmt, monthCells, thisMonth, todayIso, tidyDept, ymd } from "@/lib/format";
import { esc } from "@/lib/doc";
import { LEAVE_HISTORY_COLS, LEAVE_VALUES, LV_CODE, LV_LEGEND, MONTHLY_LEAVE } from "@/data/leave";
import { Empty, Html, Note, Panel, Scroll } from "@/components/ui";
import { scoped } from "@/lib/scope";
import { DOCTYPE, approverFor, raiseLeave, sandwichPreview } from "./raise";
import { giveMonthlyLeave } from "@/api/monthlyleave";
import { monthCarry } from "@/lib/monthlyleave";
import { loadLeaveBalance } from "@/api/load";

/* Apply Leave, as HR asked for it on 24 September 2026: one column, in the
   order somebody actually works through it — find the person, see their month,
   pick the type, click the days on the calendar, say full or half, add a
   remark, Save. Factor HR's two-column form, with its Document No, balance,
   attachment and notification boxes, was built first and taken out on request.

   **Leave Value is asked per date** —
   Full Day / First Half / Second Half against each end of the range — where
   Frappe HR's Leave Application carries one `half_day` flag and one
   `half_day_date`. A range that is half a day at both ends has nowhere to go on
   the doctype, and the form says so rather than rounding somebody's leave.

   Save raises a real Leave Application on the site, as Open — see raise.js
   for what it sends and why it stops there. While one is on its way the button
   says so rather than being greyed out: a disabled control never fires, so
   somebody on a screen reader would get silence where the reason should be. */

/** Inclusive, and deliberately not net of holidays or weekly offs.

    Frappe HR deducts both from the employee's holiday list when the application
    is saved. 88 people have no list, so a net figure computed here would be
    right for some of the workforce and quietly wrong for the rest — and this
    number is days of pay. It is the gross span, and the form says so. */
function spanDays(from, to) {
	if (!from || !to) return 0;
	const a = Date.parse(from + "T00:00:00");
	const b = Date.parse(to + "T00:00:00");
	if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
	return Math.round((b - a) / 86400000) + 1;
}

/** Their two Leave Value dropdowns, turned into days. A half at one end takes
    half a day off the gross span; a half at both ends takes a whole one — and
    is the shape the doctype cannot hold. */
function totalDays(f) {
	const gross = spanDays(f.from, f.till);
	if (!gross) return 0;
	if (gross === 1) return f.fromval === "1" ? 1 : 0.5;
	return gross - (f.fromval === "1" ? 0 : 0.5) - (f.tillval === "1" ? 0 : 0.5);
}

/** A click on the calendar, as a change to the form. The first click starts
    the range on that day; the next ends it there — or, if it lands before the
    start, starts again from it, because nobody means a range that runs
    backwards. A one-day leave is the same day clicked twice. */
export function pickDay(f, iso) {
	if (f.picking && f.from && iso >= f.from) return { till: iso, picking: false };
	return { from: iso, till: iso, picking: true };
}

/** Which of their seven colours a day is, for one person. Highest priority
    first, and the order is theirs: a day that is both a holiday and an approved
    leave reads as leave, because leave is the thing somebody applied for.

    Absent is last of the answerable ones for the opposite reason — an Absent
    row on a day somebody's leave was approved is a disagreement between two
    doctypes, and it is the approval that was deliberate. */
function dayState(s, iso, hol) {
	const app = (s.applyHist || []).find(
		(r) => r.from_date <= iso && iso <= r.to_date
			&& (r.status === "Open" || r.status === "Approved"),
	);
	if (app) {
		if (app.half_day && String(app.half_day_date || "").slice(0, 10) === iso) return "partial";
		return app.status === "Approved" ? "appr" : "unappr";
	}
	const h = hol[iso];
	if (h) return h.weekly_off ? "weekoff" : "holiday";
	return ATT_STATE[(s.applyAtt || {})[iso]] || "";
}

/** An Attendance row's status, as one of the calendar's states. Work From Home
    is a day worked, so it reads as Present; a status not listed here — a draft,
    or something hrms adds later — is left unmarked rather than guessed. */
const ATT_STATE = {
	Present: "present", "Work From Home": "present", Absent: "absent",
	"Half Day": "partial", "On Leave": "appr",
};

/** Who may be picked as the approver: whoever is signed in, then everybody
    with a login, by name. hrms takes a User here. The current choice is kept
    at the top even when it is nobody in the list — a leave approver set on the
    desk to a login with no Employee record is still the right answer. */
function approvers(s, current) {
	const out = new Map();
	if (current) out.set(current, current);
	if (s.user) out.set(s.user, `${s.user} (you)`);
	(s.employees || [])
		.filter((e) => e.user_id && e.status === "Active")
		.sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)))
		.forEach((e) => { if (!out.has(e.user_id) || out.get(e.user_id) === e.user_id) out.set(e.user_id, `${e.employee_name} (${e.user_id})`); });
	return [...out.entries()];
}

/** How the box writes a chosen person, and so what it may be handed back. */
const label = (e) => `${e.employee_name} (${e.employee_number || e.name})`;

/** The one person whose label this text is, or "". A keystroke in the box
    un-picks whoever was chosen, and the text left behind is their label — so
    that text, typed or left, has to find them again rather than nobody. */
function exactly(s, text) {
	const t = (text || "").trim().toLowerCase();
	if (!t) return "";
	const hit = scoped(s).filter((e) => label(e).toLowerCase() === t);
	return hit.length === 1 ? hit[0].name : "";
}

/** Their `Search Employee` box: type, pick from what matches. A select of 500
    names is not the same control and does not behave like one. */
function EmpFind({ s, q, status, chosen, onQ, onPick, id }) {
	const picked = chosen ? s.byName[chosen] : null;
	const typing = !picked && (q || "").trim();
	let hits = [];
	if (typing) {
		const needle = q.trim().toLowerCase();
		hits = scoped(s)
			.filter((e) => !status || e.status === status)
			.filter((e) => [e.employee_number, e.employee_name, e.designation, label(e)]
				.some((v) => (v || "").toLowerCase().includes(needle)))
			.slice(0, 8);
	}
	return (
		<>
			{/* The magnifier sits to the right of the box on their screen, and the
			    input is first in the DOM so a keyboard reaches the field rather than
			    the decoration. Both of those come out of plain source order here —
			    which is why this box, alone among the four `Search Employee` boxes in
			    this build, does not carry `.rev`. */}
			<span className="find">
				<input id={id} type="search" placeholder="Search Employee" aria-label="Search employee"
					value={picked ? label(picked) : q}
					/* Typing over a chosen name clears the choice — otherwise the box
					   says one person and the form is filled for another. */
					onChange={(e) => onQ(e.target.value)} />
				<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
					strokeWidth="1.8" strokeLinecap="round">
					<circle cx="11" cy="11" r="7" />
					<path d="M20 20l-3.6-3.6" />
				</svg>
			</span>
			{typing ? (
				<div className="regfind">
					{hits.length ? (
						<>
							{hits.map((e) => (
								<button key={e.name} onClick={() => onPick(e.name)}>
									<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
									<b>{e.employee_name}</b>
									<span className="mono">{e.employee_number || "—"}</span>
									<span className="muted">{tidyDept(e.department)}</span>
								</button>
							))}
							<button onClick={() => onPick("")}>
								<span className="muted">— nobody —</span>
							</button>
						</>
					) : (
						<span className="none">Nobody matches.</span>
					)}
				</div>
			) : null}
		</>
	);
}

/** Whether this person earns the month's leave on `iso`: the 1st of a month
    they were employed in. The month they joined counts — hrms credits it too,
    from the assignment's first day. */
function earnsOn(emp, iso) {
	if (!emp || iso.slice(8) !== "01") return false;
	const joined = String(emp.date_of_joining || "").slice(0, 7);
	return !joined || iso.slice(0, 7) >= joined;
}

/** Days of one leave type this person applied for (Open or Approved) that fall
    inside the month — an application straddling two months counts only the
    part in this one, and a half day counts half. */
function takenIn(s, ym, type) {
	const first = ym + "-01";
	const last = ymd(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0));
	let n = 0;
	for (const r of s.applyHist || []) {
		if (r.leave_type !== type || !(r.status === "Open" || r.status === "Approved")) continue;
		const a = String(r.from_date).slice(0, 10) > first ? String(r.from_date).slice(0, 10) : first;
		const b = String(r.to_date).slice(0, 10) < last ? String(r.to_date).slice(0, 10) : last;
		if (b < a) continue;
		let days = spanDays(a, b);
		const half = String(r.half_day_date || "").slice(0, 10);
		if (r.half_day && half >= a && half <= b) days -= 0.5;
		n += days;
	}
	return n;
}

/** The month grid. Always six weeks, as their screen draws it: a grid that
    changes height with the month makes the arrows move under the pointer. */
function LvCalendar({ s, hol, emp, onPick }) {
	const f = s.apply;
	const from = f.from || todayIso();
	const till = f.till || from;
	const ym = f.month || (f.from || todayIso()).slice(0, 7);
	const [y, m] = ym.split("-").map(Number);
	const today = todayIso();
	const cells = monthCells(ym);

	const step = (n) => {
		const d = new Date(y, m - 1 + n, 1);
		patch("apply", { month: ymd(d).slice(0, 7) });
	};

	return (
		<div className="lvcal">
			<div className="lvcalbar">
				<span className="who">
					<b>{CAL_MONTHS[m - 1]} {y}</b>
					<small>
						{emp
							? `${emp.employee_name} (${emp.employee_number || emp.name})${f.busy ? " · reading…" : ""}`
							: "Pick an employee above to see their month"}
					</small>
				</span>
				<span className="nav">
					<button className="embtn" onClick={() => patch("apply", { month: thisMonth() })}>Today</button>
					<button className="embtn step" aria-label="Previous month" onClick={() => step(-1)}>‹</button>
					<button className="embtn step" aria-label="Next month" onClick={() => step(1)}>›</button>
				</span>
			</div>

			<div className="lvgrid" role="grid" aria-label={`${CAL_MONTHS[m - 1]} ${y}`}>
				{DAY.map((d) => <span className="dow" key={d}>{d.slice(0, 3)}</span>)}
				{cells.map((d) => {
					const iso = ymd(d);
					const out = d.getMonth() !== m - 1;
					const st = out || !emp ? "" : dayState(s, iso, hol);
					const name = st ? LV_LEGEND.find((l) => l[0] === st)[1] : "";
					const picked = from <= iso && iso <= till;
					const p = emp ? (s.applyPunch || {})[iso] : null;
					const cls = "cell" + (out ? " out" : "") + (iso === today ? " now" : "")
						+ (picked ? " lvsel" : "") + (picked && (iso === from || iso === till) ? " end" : "");
					const body = (
						<>
							<i>{d.getDate()}</i>
							{!out && earnsOn(emp, iso) ? (
								<span className="lvearn" title={`${MONTHLY_LEAVE.annual / 12} ${MONTHLY_LEAVE.type} earned this month`}>
									+{MONTHLY_LEAVE.annual / 12} {MONTHLY_LEAVE.code}
								</span>
							) : null}
							{p && !out ? (
								<span className="lvtimes" title={`${p.n} punch${p.n === 1 ? "" : "es"}`}>
									{p.first}{p.n > 1 ? <><br />{p.last}</> : null}
								</span>
							) : null}
							{st ? (
								<span className="lvtag">
									<em className={"lvdot " + st} />
									<small>{LV_CODE[st]}</small>
								</span>
							) : null}
						</>
					);
					/* Every day is a button, chosen or not: the dates can be picked before
					   the person, and a greyed day of the month either side is a click
					   that also turns the calendar to it. */
					return (
						<button key={iso} type="button" className={cls} aria-pressed={picked}
							aria-label={`${dmy(iso)}${name ? ", " + name : ""}`}
							title={name ? `${dmy(iso)} · ${name}` : dmy(iso)}
							onClick={() => onPick(iso)}>
							{body}
						</button>
					);
				})}
			</div>

			<span className="lvhint" role="status">
				{f.picking
					? <>From <b>{dmy(from)}</b> — now click the last day of the leave, or the same day again for one day.</>
					: <>Click a day to start the leave, then the day it ends. <b>{dmy(from)}{from !== till ? ` – ${dmy(till)}` : ""}</b> is selected.</>}
			</span>

			{emp ? <LvMonthLeave s={s} emp={emp} ym={ym} /> : null}

			{emp ? <LvTally s={s} hol={hol} ym={ym} /> : null}

			<div className="lvkey">
				{LV_LEGEND.map((l) => (
					<span key={l[0]} title={l[3].replace(/<[^>]*>/g, "")}>
						<i className={"lvdot " + l[0]} />
						{l[1]}
					</span>
				))}
			</div>
		</div>
	);
}

/** The monthly leave for the month on screen: what the rule adds, what was
    applied for inside it, and what the site says is left today. */
function LvMonthLeave({ s, emp, ym }) {
	const bal = (s.applyBal?.rows || []).find((r) => r.type === MONTHLY_LEAVE.type);
	const c = monthCarry(s.applyBal?.ledger, ym);
	const future = ym > todayIso().slice(0, 7);
	const waiting = takenIn({ applyHist: (s.applyHist || []).filter((r) => r.status === "Open") },
		ym, MONTHLY_LEAVE.type);

	/* Nothing on the site yet: say what the rule will do, and that it has not. */
	if (!c) {
		return (
			<div className="lvmonth">
				<b>{MONTHLY_LEAVE.type}</b>
				<span>
					<b>+{fmt(earnsOn(emp, ym + "-01") ? MONTHLY_LEAVE.annual / 12 : 0)}</b> a month, and what is not
					used carries to the next month
				</span>
				<span className="muted">not given on the site yet</span>
			</div>
		);
	}

	/* A month still to come has only what it will start with, and the one the
	   1st will add; nothing of it has happened. */
	if (future) {
		return (
			<div className="lvmonth">
				<b>{MONTHLY_LEAVE.type}</b>
				<span>brought forward <b>{fmt(c.brought)}</b></span>
				<span><b>+{fmt(earnsOn(emp, ym + "-01") ? MONTHLY_LEAVE.annual / 12 : 0)}</b> on the 1st</span>
			</div>
		);
	}

	return (
		<div className="lvmonth">
			<b>{MONTHLY_LEAVE.type}</b>
			<span>brought forward <b>{fmt(c.brought)}</b></span>
			<span><b>+{fmt(c.earned)}</b> earned</span>
			<span><b>{fmt(c.taken)}</b> taken{waiting ? ` (+${fmt(waiting)} waiting approval)` : ""}</span>
			{c.other ? <span><b>{fmt(c.other)}</b> expired or adjusted</span> : null}
			<span>carried to next month <b>{fmt(c.carried)}</b></span>
			{bal && ym === todayIso().slice(0, 7) ? <span>available now <b>{fmt(bal.remaining)}</b></span> : null}
		</div>
	);
}

/** The month in numbers, one per state that happened — the count a person
    asks for first, and a check on the grid above it. */
function LvTally({ s, hol, ym }) {
	const n = {};
	for (const d of monthCells(ym)) {
		const iso = ymd(d);
		if (iso.slice(0, 7) !== ym) continue;
		const st = dayState(s, iso, hol);
		if (st) n[st] = (n[st] || 0) + 1;
	}
	const rows = LV_LEGEND.filter((l) => n[l[0]]);
	if (!rows.length) {
		return <span className="lvtally none">Nothing recorded for this month.</span>;
	}
	return (
		<div className="lvtally">
			{rows.map((l) => (
				<span key={l[0]}>
					<i className={"lvdot " + l[0]} />
					{l[1]} <b>{fmt(n[l[0]])}</b>
				</span>
			))}
		</div>
	);
}

/** Give monthly leave — to this person, or to everybody active who has none
    this year. What tools/setup_monthly_leave.py does, as the signed-in person;
    see api/monthlyleave.js. It starts from this month, so dates before it are
    still outside what was given, and the note says so. */
function GiveLeave({ s, emp }) {
	const f = s.apply;
	const run = async (who) => {
		if (f.giving) return;
		patch("apply", { giving: true, giveMsg: "" });
		try {
			const r = await giveMonthlyLeave(who, todayIso(),
				(o) => patch("apply", { giveMsg: `Giving… ${o.given.length + o.refused.length} of ${who.length}` }));
			const bad = r.refused.slice(0, 5).map((x) => `${esc(s.byName[x.emp]?.employee_name || x.emp)}: ${esc(x.error)}`);
			patch("apply", {
				giving: false,
				giveMsg: `<b>Monthly leave given to ${r.given.length}</b>`
					+ (r.had.length ? `, ${r.had.length} already had it` : "")
					+ (r.refused.length ? `. <b>${r.refused.length} refused</b> — ${bad.join("; ")}` : "")
					+ `. It starts from ${dmy(todayIso().slice(0, 7) + "-01")}: leave before that date is still outside it.`,
			});
		} catch (err) {
			patch("apply", { giving: false, giveMsg: `<b>The site refused it:</b> ${esc(String(err.message || err))}` });
		}
		if (getState().apply.emp === emp.name) void loadLeaveBalance(emp.name);
	};
	const everyone = scoped(s).filter((e) => e.status === "Active");
	return (
		<>
			<span className="repacts">
				<button className="btn tpl" onClick={() => void run([emp])} aria-busy={f.giving || undefined}>
					{f.giving ? "Giving…" : `Give ${emp.employee_name} monthly leave`}
				</button>
				<button className="btn ghost" onClick={() => void run(everyone)} aria-busy={f.giving || undefined}>
					Give everyone ({fmt(everyone.length)}) monthly leave
				</button>
			</span>
			{f.giveMsg ? <Note><Html html={f.giveMsg} /></Note> : null}
		</>
	);
}

/** Why the site said "outside leave allocation period", in this person's
    dates: no allocation of the type at all, or one that starts after (or ends
    before) the dates asked for. HTML, escaped. */
function outsideWhy(s, type, from, till, who) {
	const row = (s.applyBal?.rows || []).find((r) => r.type === type);
	if (!row?.periods?.length) {
		return `${who} has not been given any ${esc(type)} on the site. `
			+ (type === MONTHLY_LEAVE.type ? "Press <b>Give monthly leave</b> below, then Save again." : "");
	}
	const inside = row.periods.some(([a, b]) => a <= from && till <= b);
	if (inside) return `The site's allocation covers these dates, so it refused them for another reason.`;
	const start = row.periods[0][0];
	const end = row.periods[row.periods.length - 1][1];
	if (from < start) {
		return `${who}'s ${esc(type)} starts on <b>${dmy(start)}</b>, and this leave begins on ${dmy(from)} — `
			+ "before it. Pick dates from that day on.";
	}
	return `${who}'s ${esc(type)} runs to <b>${dmy(end)}</b>, and this leave goes past it.`;
}

/** The dates an allocation covers, as a sentence fragment. */
const periodText = (r) => (r.periods || []).map(([a, b]) => `${dmy(a)} – ${dmy(b)}`).join(", ");

/** The person's balance, one line per leave type, as hrms counts it — and the
    Give monthly leave buttons whenever Casual Leave is not among them, not only
    when nothing is: somebody holding a Sick Leave allocation and no Casual Leave
    is refused Casual Leave exactly as if they held nothing. */
function LvBalance({ s, emp }) {
	const b = s.applyBal;
	if (!emp) return null;
	if (!b) return <div className="lvbal"><span className="muted">Reading the leave balance…</span></div>;
	const monthly = b.rows.find((r) => r.type === MONTHLY_LEAVE.type);
	return (
		<div className={"lvbal" + (monthly ? "" : " col")}>
			{b.rows.map((r) => (
				<span key={r.type} className="lvbalrow">
					<b>{r.type}</b>
					<span className="big">{fmt(r.remaining)}</span>
					<span className="muted">
						available · {fmt(r.total)} given, {fmt(r.taken)} taken
						{r.pending ? `, ${fmt(r.pending)} waiting approval` : ""}
						{r.expired ? `, ${fmt(r.expired)} expired` : ""}
						{r.periods?.length ? ` · for ${periodText(r)}` : ""}
					</span>
				</span>
			))}
			{monthly ? null : (
				<>
					<span className="muted">
						{b.err
							? <>The site did not give the balance ({b.err}). </>
							: null}
						<b>{emp.employee_name} has not been given {MONTHLY_LEAVE.type} on the site</b>, so the site
						refuses every {MONTHLY_LEAVE.type} application. Everybody earns one a month, added on the
						1st — give it here.
					</span>
					<GiveLeave s={s} emp={emp} />
				</>
			)}
		</div>
	);
}

export default function ApplyLeave() {
	const s = useApp();
	const f = s.apply;
	const emp = f.emp ? s.byName[f.emp] : null;
	const from = f.from || todayIso();
	const till = f.till || todayIso();
	const ym = f.month || from.slice(0, 7);

	/* One read per person and per month on screen: the calendar and the history
	   fill the moment somebody is picked. */
	useEffect(() => {
		void loadLeaveFor(f.emp, ym);
	}, [f.emp, ym]);

	/* The approver, filled in the moment somebody is picked: their record's
	   leave approver, else their manager's login, else whoever is signed in —
	   HR raising leave for somebody with neither is the person who can decide
	   it. Only when nothing has been chosen for this person yet. */
	useEffect(() => {
		if (!f.emp || getState().apply.approver) return;
		let gone = false;
		const who = s.byName[f.emp];
		if (!who) return;
		void approverFor(who).then((a) => {
			if (gone || getState().apply.emp !== f.emp || getState().apply.approver) return;
			patch("apply", a.user
				? { approver: a.user, approverWhy: a.inferred ? "their reporting manager" : "set on their record" }
				: { approver: s.user || "", approverWhy: s.user ? "you — nobody is set on their record" : "" });
		});
		return () => { gone = true; };
	}, [f.emp]);

	const hol = {};
	(s.holidays[emp?.holiday_list] || []).forEach((h) => {
		hol[String(h.holiday_date).slice(0, 10)] = h;
	});

	const total = totalDays({ ...f, from, till });
	const single = from === till;

	const put = (part) => patch("apply", { msg: "", noAlloc: false, sandwichDates: null, ...part });
	const typeBal = f.type ? (s.applyBal?.rows || []).find((r) => r.type === f.type) : null;

	/* The same checks the server would make, made here only to answer quickly and
	   kindly — never as the thing that decides. CLAUDE.md §1. */
	const missing = [
		!f.emp && "an employee",
		!f.type && "a leave type",
		!spanDays(from, till) && "a till date that is not before the from date",
	].filter(Boolean);

	/* Save, in two steps. The first asks the site whether this range would sweep
	   a weekend or holiday into leave (Sandwich Leave) and, if so, stops for
	   Cancel/Continue naming the dates. The sweep itself happens on the site on
	   submit whether or not this warning was shown: a courtesy, not the rule. */
	const save = async () => {
		if (f.sending) return;
		if (missing.length) {
			return patch("apply", { msg: "Needs " + missing.join(", ") + ". Nothing has been sent." });
		}
		if (!f.sandwichDates) {
			patch("apply", { sending: true, msg: "" });
			const dates = await sandwichPreview(f.emp, from, till);
			patch("apply", { sending: false });
			if (dates.length) {
				return patch("apply", { sandwichDates: dates });
			}
		}
		await doRaise();
	};

	const doRaise = async () => {
		const who = esc(emp?.employee_name || f.emp);
		const what = `${total} day${total === 1 ? "" : "s"} of ${esc(f.type)} for ${who}`;

		patch("apply", { sending: true, msg: "", sandwichDates: null });
		const r = await raiseLeave({ ...f, from, till }, emp, todayIso(), null);
		patch("apply", { sending: false });

		if (!r.ok && r.refuse) {
			return patch("apply", { msg: `<b>${what} — not saved.</b> ${r.refuse}` });
		}
		if (!r.ok) {
			const alloc = s.site && deskNewWith(s.site, "Leave Allocation", { employee: f.emp, leave_type: f.type });
			return patch("apply", {
				noAlloc: !!r.noAllocation,
				msg: `<b>${what} — the site refused it:</b> ${esc(r.error)}`
					+ (r.noAllocation
						? ` <br>${outsideWhy(s, f.type, from, till, who)} `
						+ "For other amounts, "
						+ (alloc ? `<a href="${esc(alloc)}" target="_blank" rel="noopener">allocate it on the desk</a>` : "allocate it on the desk")
						+ ". Nothing has been written."
						: " Nothing has been written."),
			});
		}

		/* Straight into the queue it belongs in, so Dashboard → Approvals → Leave
		   shows it without waiting for the next full read. */
		update((st) => ({
			approvals: { ...st.approvals, leave: [...(st.approvals.leave || []), r.made] },
		}));
		const link = s.site ? deskUrl(s.site, DOCTYPE, r.made.name) : "";
		patch("apply", {
			msg: `<b>${what} — saved as `
				+ (link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(r.made.name)}</a>` : esc(r.made.name))
				+ ", Open.</b> It is waiting on Dashboard → Approvals → Leave"
				+ (r.approver.user
					? `, sent to <b>${esc(r.approver.user)}</b>${r.approver.inferred ? " (their reporting manager, inferred)" : ""}.`
					: ". <b>Nobody is set to approve it</b> — no leave approver on the record and no reporting "
						+ "manager with a login — so somebody with HR rights has to pick it up there."),
		});
		if (getState().apply.emp === f.emp) void loadLeaveFor(f.emp, ym);
	};

	const cancel = () => {
		patch("apply", {
			emp: "", q: "", type: "", from: "", till: "", fromval: "1", tillval: "1",
			remarks: "", month: "", msg: "", sandwichDates: null, picking: false,
			approver: "", approverWhy: "",
		});
	};

	return (
		<>
			{/* Two columns: the month on the left, the application on the right, so
			    the day being clicked and the form it fills are both in view. The
			    person spans the two, because both answer to them. */}
			<section className="lvlayout">
				<div className="lvf wide">
					<span className="lab">Employee</span>
					{/* `.ctl` is the anchor the list of matches hangs from. Without it the
					    list is placed against some ancestor far down the page, and a
					    search that answers where nobody is looking reads as one that
					    found nobody. */}
					<span className="ctl">
						<EmpFind s={s} id="lv-emp" q={f.q} status={f.status} chosen={f.emp}
							onQ={(v) => put({ emp: exactly(s, v), q: v, approver: "", approverWhy: "" })}
							onPick={(name) => put({ emp: name, q: "", month: "", approver: "", approverWhy: "" })} />
					</span>
				</div>

				<div className="lvcol">
					<LvBalance s={s} emp={emp} />

					<LvCalendar s={s} hol={hol} emp={emp} onPick={(iso) => put({ ...pickDay({ ...f, from }, iso), month: iso.slice(0, 7) })} />
				</div>

				<div className="lvcol lvapply">
					<div className="lvf">
						<span className="lab" id="lv-type-l">Leave Type</span>
						<select aria-labelledby="lv-type-l" value={f.type}
							onChange={(e) => put({ type: e.target.value })}>
							<option value="">Select Leave Type</option>
							{s.leaveTypes.map((t) => <option key={t.name}>{t.name}</option>)}
						</select>
						{typeBal ? (
							<span className={"hint" + (total > typeBal.remaining ? " warn" : "")}>
								<b>{fmt(typeBal.remaining)}</b> available
								{total > typeBal.remaining
									? ` — this asks for ${total}. The site will refuse what the balance does not cover.`
									: ""}
							</span>
						) : null}
					</div>

					<div className="lvf">
						<span className="lab">Dates</span>
						<b>
							{dmy(from)}{single ? "" : ` – ${dmy(till)}`}
							{spanDays(from, till) ? ` · ${total} day${total === 1 ? "" : "s"}` : ""}
						</b>
						<span className="hint">Click the days on the calendar.</span>
					</div>

					<div className="lvpair">
						<div className="lvf">
							<span className="lab" id="lv-fromv-l">Leave Value{single ? "" : ` · ${dmy(from)}`}</span>
							<select aria-labelledby="lv-fromv-l" value={f.fromval}
								onChange={(e) => put({ fromval: e.target.value })}>
								{LEAVE_VALUES.map((v) => <option key={v[0]} value={v[0]}>{v[1]}</option>)}
							</select>
						</div>
						{single ? null : (
							<div className="lvf">
								<span className="lab" id="lv-tillv-l">Leave Value · {dmy(till)}</span>
								<select aria-labelledby="lv-tillv-l" value={f.tillval}
									onChange={(e) => put({ tillval: e.target.value })}>
									{LEAVE_VALUES.map((v) => <option key={v[0]} value={v[0]}>{v[1]}</option>)}
								</select>
							</div>
						)}
					</div>

					<div className="lvf">
						<span className="lab" id="lv-rem-l">Remarks</span>
						<textarea aria-labelledby="lv-rem-l" rows={3} placeholder="Remarks" value={f.remarks}
							onChange={(e) => put({ remarks: e.target.value })} />
					</div>

					<div className="lvf">
						<span className="lab" id="lv-appr-l">Leave Approver</span>
						<select aria-labelledby="lv-appr-l" value={f.approver}
							onChange={(e) => put({ approver: e.target.value, approverWhy: "chosen here" })}>
							<option value="">Select Leave Approver</option>
							{approvers(s, f.approver).map(([u, text]) => <option key={u} value={u}>{text}</option>)}
						</select>
						{f.approverWhy ? <span className="hint">{f.approverWhy}</span> : null}
					</div>

					{f.sandwichDates?.length ? (
						<Note>
							<b>⚠️ Sandwich Leave Warning</b>
							<div>
								Your selected leave dates are adjacent to a weekend/holiday. As per the Sandwich
								Leave policy, the intervening weekend/holiday may also be counted as leave:{" "}
								<b>{f.sandwichDates.map((d) => dmy(d)).join(", ")}</b>.
							</div>
							<div>Do you want to continue?</div>
							<div className="repacts mt-[.5rem]">
								<button className="btn tpl" onClick={() => void doRaise()} aria-busy={f.sending || undefined}>
									{f.sending ? "Saving…" : "Continue"}
								</button>
								<button className="btn ghost" onClick={() => patch("apply", { sandwichDates: null })}>
									Cancel
								</button>
							</div>
						</Note>
					) : (
						<div className="repacts">
							<button className="btn tpl" onClick={() => void save()} aria-busy={f.sending || undefined}>
								{f.sending ? "Saving…" : "Save"}
							</button>
							<button className="btn ghost" onClick={cancel}>Cancel</button>
						</div>
					)}

					{f.msg ? <Note><Html html={f.msg} /></Note> : null}
					{f.msg && f.noAlloc && emp && f.type === MONTHLY_LEAVE.type
						&& !(s.applyBal?.rows || []).some((r) => r.type === MONTHLY_LEAVE.type)
						? <GiveLeave s={s} emp={emp} />
						: null}
					{f.err ? <Note>{f.err}</Note> : null}
				</div>
			</section>

			<Panel title="Leave History" cov={f.emp ? "part" : "none"} ico="🗓">
				{!f.emp ? (
					<Empty title="Nobody chosen">The history fills from the person picked above.</Empty>
				) : (s.applyHist || []).length ? (
					<Scroll>
						<table style={{ minWidth: 900 }}>
							<thead>
								<tr>{LEAVE_HISTORY_COLS.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr>
							</thead>
							<tbody>
								{(s.applyHist || [])
									.slice()
									.sort((a, b) => String(b.from_date).localeCompare(String(a.from_date)))
									.map((r) => (
										<tr key={r.name}>
											{LEAVE_HISTORY_COLS.map((c) => (
												<td key={c[0]} className={c[2] || undefined}>{String(c[1](r))}</td>
											))}
										</tr>
									))}
							</tbody>
						</table>
					</Scroll>
				) : (
					<Empty title="No leave on record">
						{f.busy ? "Reading the site…" : `Nothing has been applied for by ${emp?.employee_name || "this person"} yet.`}
					</Empty>
				)}
			</Panel>
		</>
	);
}
