import { patch, set, useApp } from "@/store";
import { go } from "@/routes/router";
import { scoped } from "@/lib/scope";
import { fmt, nowStamp, tidyDept, ymd } from "@/lib/format";
import { download, save, toCsv } from "@/lib/csv";
import { esc, paper, printPaper } from "@/lib/doc";
import { CTC_BY } from "@/data/masters";
import { BONUS_ACT, BONUS_COLS, BONUS_CURRENCY, BONUS_OUTPUTS, BONUS_STATUS } from "@/data/payroll";
import { Empty, Gap, Html, Modal, Note, Scroll } from "@/components/ui";
import People from "@/components/People";

import { PayLegend } from "./shared";

/* Factor HR's Bonus Working Report, photographed 29 August 2026 — seven
   controls and five buttons, copied control for control the way their Statutory
   Reports panel is, so the two screens can be held side by side.

   **This is the one page under Payroll that computes rather than describes.**
   Everything else in this module is deferred because a payroll engine ships
   with Frappe HR and only the data is missing. The bonus working is the
   opposite: nothing computes it on either side, `Additional Salary` only
   *pays* it, and so the arithmetic has to exist somewhere. It exists here as a
   working — a sheet somebody checks before a rate is declared — and not as a
   payment. Nothing on this page writes anything.

   **Every figure on it is a floor, for three separate reasons**, and they are
   stated on the screen rather than in a footnote because a bonus number gets
   quoted six months later by somebody who never read the form:

   1. The Act tests *salary or wage* — basic plus DA. This site holds one pay
      figure, an annual CTC, and CTC is always the larger of the two. So anybody
      under the ceiling on CTC ÷ 12 is under it on wage as well, and anybody
      above it on CTC may still be under it on wage — which is why eligibility
      here is three-valued and the middle value is `Unknown`.
   2. Sec 12 computes on ₹7,000 *or the minimum wage for the scheduled
      employment, whichever is higher*. The minimum wage is a state notification
      per trade and is held nowhere on this site, so ₹7,000 is used.
   3. Sec 8 asks for thirty *working* days. There are no Attendance rows on this
      site at all, so days in service stand in — which can only ever be more
      than days worked, so it rules somebody out and never in.

   The only thing that would move any of these is data: the salary structure
   behind E1, the state minimum wage notifications, and generated Attendance. */

/** The accounting year a month belongs to, as its opening calendar year. April
    to March — the Act's year, and India's. */
const fyOf = (ym) => Number(ym.slice(0, 4)) - (Number(ym.slice(5, 7)) < 4 ? 1 : 0);

const fyLabel = (y) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;

/** The i-th month of accounting year `fy`, counting from April, as `YYYY-MM`. */
function fyMonth(fy, i) {
	const m = ((i + 3) % 12) + 1;
	return `${i < 9 ? fy : fy + 1}-${String(m).padStart(2, "0")}`;
}

/** Last day of a month, from local parts — `new Date(y, m, 0)` is the 0th day
    of the next month, which is the last of this one however long it is. */
function monthEnd(ym) {
	const [y, m] = ym.split("-").map(Number);
	return ymd(new Date(y, m, 0));
}

/** Whole days from `a` to `b`, both ends counted. Both are date-only strings so
    both parse as UTC midnight and the difference is exact. */
const spanDays = (a, b) => (b < a ? 0 : Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1);

/** The range the form is asking for, resolved at render rather than seeded into
    the store — a tab left open across an April must not still be working last
    year's bonus. */
function bonRange(f) {
	const now = new Date();
	const y = now.getFullYear() - (now.getMonth() < 3 ? 1 : 0);
	return [f.from || `${y}-04`, f.till || `${y + 1}-03`];
}

/** Everybody the form's filters leave in scope. Their Employee Status box holds
    chips rather than one value, so an empty box means every status — the same
    reading the other reports make of a cleared filter. */
function bonPool(s) {
	const f = s.bon;
	const q = (f.emp || "").toLowerCase().trim();
	return scoped(s).filter((e) => {
		if (f.status.length && !f.status.includes(e.status || "")) return false;
		if (q) {
			const hay = `${e.employee_number || ""} ${e.employee_name || ""} ${e.name}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	});
}

/** One row per person per accounting year the range touches.

    Not one row per person: a bonus is declared for an accounting year, and a
    range that straddles four of them is four workings that must not be added
    together. Their own form defaulted to Apr-23 → Mar-27, which is why this is
    the first thing the report has to get right. */
function bonRows(s) {
	const f = s.bon;
	const [from, till] = bonRange(f);
	const pool = bonPool(s);
	const out = [];

	for (let fy = fyOf(from); fy <= fyOf(till); fy++) {
		/* The year clipped to what was asked for. A range starting in July gives a
		   nine-month first year, and the working has to say nine rather than
		   quietly bill the whole year. */
		const wa = `${fy}-04` > from ? `${fy}-04` : from;
		const wb = `${fy + 1}-03` < till ? `${fy + 1}-03` : till;
		if (wa > wb) continue;
		const winStart = wa + "-01";
		const winEnd = monthEnd(wb);

		for (const e of pool) {
			const doj = String(e.date_of_joining || "").slice(0, 10);
			if (doj && doj > winEnd) continue;

			/* A month counts when somebody was in service on the first of it, so
			   the joining month is dropped rather than counted whole. That
			   understates by up to a month — and every other figure on this page
			   understates for its own reason, so one column rounding the other way
			   would be the one somebody quotes.

			   A record with no joining date at all is read as there throughout,
			   not dropped: leaving somebody off a bonus register because a field
			   is blank is the expensive mistake in the direction this repo
			   rounds. */
			let months = 0;
			for (let i = 0; i < 12; i++) {
				const m = fyMonth(fy, i);
				if (m < wa || m > wb) continue;
				if (!doj || doj <= m + "-01") months++;
			}

			const days = spanDays(doj && doj > winStart ? doj : winStart, winEnd);
			const wage = e.ctc ? Number(e.ctc) / 12 : null;

			/* Three-valued, and the middle value is the finding. `no` is the only
			   one this site can be certain of: fewer than thirty days in service
			   is fewer than thirty days worked, whatever the attendance says. */
			let elig = "unknown";
			if (days < BONUS_ACT.days) elig = "no";
			else if (wage != null && wage <= BONUS_ACT.ceiling) elig = "yes";

			const basis = wage == null ? null : Math.min(wage, BONUS_ACT.basis);
			const salary = elig === "yes" && months ? basis * months : null;

			out.push({
				emp: e, fy: fyLabel(fy), months, days, wage, basis, elig, salary,
				/* Sec 10's ₹100 floor is applied whole rather than prorated: the row
				   is an accounting year, and that is the unit the proviso names. */
				lo: salary == null ? null : Math.max(BONUS_ACT.floor, (salary * BONUS_ACT.min) / 100),
				hi: salary == null ? null : (salary * BONUS_ACT.max) / 100,
			});
		}
	}

	const by = f.by;
	return out.sort((a, b) => {
		if (by) {
			const d = String(a.emp[by] || "—").localeCompare(String(b.emp[by] || "—"));
			if (d) return d;
		}
		return (a.emp.employee_name || "").localeCompare(b.emp.employee_name || "") || a.fy.localeCompare(b.fy);
	});
}

/** The section levels, outermost first: the accounting year when the range
    holds more than one, then Filter By. The year is outermost because two years
    added together is the one mistake this report exists to prevent. */
function bonSections(f, years) {
	const keys = [];
	if (years > 1) keys.push(["", (r) => r.fy]);
	if (f.by) {
		const lab = (CTC_BY.find((b) => b[0] === f.by) || ["", ""])[1];
		keys.push([lab, (r) => (f.by === "department" ? tidyDept(r.emp[f.by]) : r.emp[f.by]) || "—"]);
	}
	return keys;
}

const sum = (rows, k) => rows.reduce((n, r) => n + (r[k] || 0), 0);

/** Headings and rows in one flat list, so the screen and the printed document
    section identically rather than each doing its own arithmetic. */
function bonFlat(rows, keys) {
	if (!keys.length) return rows.map((row) => ({ row }));
	const [outer, ...rest] = keys;
	const groups = new Map();
	for (const r of rows) {
		const k = outer[1](r);
		if (!groups.has(k)) groups.set(k, []);
		groups.get(k).push(r);
	}
	return [...groups.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.flatMap(([head, list]) => [
			{
				head: (outer[0] ? outer[0] + ": " : "") + head,
				n: list.length, lvl: keys.length, lo: sum(list, "lo"), hi: sum(list, "hi"),
			},
			...bonFlat(list, rest),
		]);
}

/** What a group or the whole report comes to. `yes` is a floor on the headcount
    for reason 1 at the top of this file, and it is labelled as one everywhere
    it is drawn. */
function bonTotals(rows) {
	return {
		n: rows.length,
		yes: rows.filter((r) => r.elig === "yes").length,
		unknown: rows.filter((r) => r.elig === "unknown").length,
		no: rows.filter((r) => r.elig === "no").length,
		lo: sum(rows, "lo"),
		hi: sum(rows, "hi"),
	};
}

const money = (v) => (v == null ? "—" : fmt(Math.round(v)));

const bonStamp = (s) => {
	const [from, till] = bonRange(s.bon);
	return `bonus-working-${from}-to-${till}`;
};

/** The printed document — the same HTML Excel's neighbours are all handed, so
    none of them can disagree with the others or with the screen. */
function bonPaper(s, rows) {
	const f = s.bon;
	const [from, till] = bonRange(f);
	const t = bonTotals(rows);
	const years = fyOf(till) - fyOf(from) + 1;

	const crit = [
		`${fmt(rows.length)} row${rows.length === 1 ? "" : "s"}`,
		`${years} accounting year${years === 1 ? "" : "s"}`,
		f.status.length ? f.status.join(", ").toLowerCase() : "every employee status",
		f.by ? `by ${f.by}` : "",
	].filter(Boolean).join(" · ");

	const body = bonFlat(rows, bonSections(f, years))
		.map((x) => (x.head
			? `<tr class="${x.lvl > 1 ? "sec" : "grp"}"><td colspan="${BONUS_COLS.length}">`
				+ `${esc(x.head)} — ${fmt(x.n)} · at 8.33% ${esc(money(x.lo))} · at 20% ${esc(money(x.hi))}</td></tr>`
			: `<tr>${BONUS_COLS.map((c) => `<td${c[2] ? ` class="${c[2].replace(" gone", " muted")}"` : ""}>`
				+ `${esc(String(c[1](x.row)))}</td>`).join("")}</tr>`))
		.join("");

	return paper(`Bonus working ${from} to ${till}`, `
		<div class="head">
			${f.logo ? '<div class="mark">MANNA GROUP</div>' : ""}
			<h1>BONUS WORKING REPORT</h1>
			<p class="sub">${esc(from)} to ${esc(till)} · ${esc(s.company || "all companies")}</p>
			<p class="crit">${esc(crit)}</p>
		</div>
		<table>
			<thead><tr>${BONUS_COLS.map((c) => `<th>${esc(c[0])}</th>`).join("")}</tr></thead>
			<tbody>${body}</tbody>
			<tfoot><tr><td colspan="${BONUS_COLS.length}">
				${fmt(t.yes)} eligible, ${fmt(t.unknown)} undecidable, ${fmt(t.no)} not — at 8.33%
				${esc(money(t.lo))}, at 20% ${esc(money(t.hi))}.
				Every figure is a floor. Eligibility is tested on CTC &divide; 12 because no basic-plus-DA
				figure exists on this site; the bonus is computed on &#8377;${fmt(BONUS_ACT.basis)} because the
				minimum wage for the scheduled employment is not held anywhere; and the thirty-day test is
				made on days in service because there are no Attendance rows.
				<b>This is a working, not a declaration.</b> Generated ${esc(nowStamp())}.
			</td></tr></tfoot>
		</table>`);
}

/** Hand the report to whichever output the form is asking for. One document,
    built once above, so a column cannot be right on screen and wrong on paper. */
function bonDeliver(s, kind) {
	const rows = bonRows(s);
	const done = (msg) => set({ bonMsg: msg });

	if (!rows.length) return done("Nothing to hand over — nobody is in scope.");

	if (kind === "Excel") {
		const name = bonStamp(s) + ".csv";
		download(name, toCsv(BONUS_COLS.map((c) => c[0]), rows.map((r) => BONUS_COLS.map((c) => c[1](r)))));
		return done(`Exported ${fmt(rows.length)} rows to ${name}. Their button writes .xls; this one writes `
			+ "CSV, which every spreadsheet opens and nothing has to be installed to read.");
	}

	const html = bonPaper(s, rows);

	if (kind === "Preview") return set({ bonDoc: html, bonMsg: "" });
	if (kind === "Word") {
		const name = bonStamp(s) + ".doc";
		save(name, html, "application/msword");
		return done(`Written to ${name}. <b>It is an HTML document with a Word content type</b> — the same `
			+ "thing Word's own <em>Save as Web Page</em> writes, so Word opens and edits it and no library "
			+ "was shipped to this browser to produce it.");
	}

	printPaper(html);
	done(kind === "PDF"
		? "<b>PDF is the print dialog with <em>Save as PDF</em> as the destination.</b> It is the same "
			+ "document Print and the screen show; a second renderer would only be a second chance to "
			+ "disagree with them."
		: "Sent to the print dialog.");
}

const RESET = {
	from: "", till: "", status: ["Active", "Suspended"], emp: "", pick: false,
	by: "", currency: "Default", output: "Excel", logo: false,
};

function BonForm({ s }) {
	const f = s.bon;
	const [from, till] = bonRange(f);
	const years = fyOf(till) - fyOf(from) + 1;

	/* Generate is the only control that changes what is listed; everything else
	   changes what Generate *would* list, which is why touching one clears the
	   last run rather than leaving a stale working on screen under new criteria.
	   On this page that matters more than on most: the thing left on screen is
	   money. */
	const stale = (part) => {
		patch("bon", part);
		set({ bonRun: false, bonMsg: "" });
	};

	function button(k) {
		if (k === "generate") {
			set({ bonRun: true, bonMsg: "" });
			/* Their Report Output is a setting and their Generate Report obeys it,
			   so this one does too — except that the report is always drawn on
			   screen first. A working that only ever leaves as a file is a working
			   nobody checked. */
			if (f.output !== "On screen") bonDeliver(s, f.output);
			return;
		}
		if (k === "reset") return set({ bon: { ...RESET }, bonRun: false, bonMsg: "Fields reset." });
		if (k === "close") return go({ bonRun: false, bonMsg: "", bonDoc: "", subtab: "overview" });
		if (k === "schedule") {
			return set({
				bonMsg: "<b>Scheduling exists on the site already</b> — Frappe's <em>Auto Email Report</em> sends "
					+ "a saved report on a cron to a list of people, which is this button. It needs an outgoing "
					+ "mail account and a write to create the schedule, and this page proxies GET only. Worth "
					+ "knowing all the same: a bonus working is wanted once a year, in the same week, by the "
					+ "same two people.",
			});
		}
		set({
			bonMsg: "There is no queue behind this page. In Factor HR this enqueues the report and mails it "
				+ "when it finishes; here it is computed in the browser from records already loaded, so "
				+ "Generate is instant and this button has nothing to hand off to.",
		});
	}

	return (
		<div className="repform">
			<div className="repgrid">
				<label htmlFor="bonfrom">From:</label>
				<span className="ctl">
					<input id="bonfrom" type="month" value={from} onChange={(e) => stale({ from: e.target.value })} />
					<span className="hint">their capture read Apr-23</span>
				</span>

				<label htmlFor="bontill">Till:</label>
				<span className="ctl">
					<input id="bontill" type="month" value={till} onChange={(e) => stale({ till: e.target.value })} />
					{/* The one control on this form that changes the *shape* of the
					    output rather than filtering it. */}
					<span className="hint">
						{years === 1
							? "one accounting year, April to March"
							: `${years} accounting years — ${years} separate workings, sectioned and never added together`}
					</span>
				</span>

				<label>Employee Status:</label>
				<span className="ctl">
					<span className="chipbox">
						{f.status.map((v) => (
							<span className="chip" key={v}>
								{v}
								<button aria-label={"Remove " + v}
									onClick={() => stale({ status: f.status.filter((x) => x !== v) })}>×</button>
							</span>
						))}
						{BONUS_STATUS.some((v) => !f.status.includes(v)) && (
							<select value="" aria-label="Add an employee status"
								onChange={(e) => e.target.value && stale({ status: f.status.concat(e.target.value) })}>
								<option value="">+ add</option>
								{BONUS_STATUS.filter((v) => !f.status.includes(v)).map((v) => (
									<option key={v} value={v}>{v}</option>
								))}
							</select>
						)}
					</span>
					<span className="hint">
						{f.status.length ? "as their capture had it" : "empty is every status"}
					</span>
				</span>

				<label htmlFor="bonemp">Employee:</label>
				<span className="ctl">
					<input id="bonemp" type="text" className="wide" placeholder="Type to search"
						value={f.emp} onChange={(e) => stale({ emp: e.target.value })} />
					<button className="dots" title="Pick from the list"
						onClick={() => patch("bon", { pick: !f.pick })}>…</button>
				</span>
				{f.pick && (
					<>
						<span />
						<span className="ctl">
							{/* Capped, as on the other report forms: a select with every
							    employee in it is a scroll rather than a choice, and typing
							    in the box above reaches the rest. */}
							<select size={8} className="wide" aria-label="Pick an employee" value=""
								onChange={(e) => stale({ emp: e.target.value, pick: false })}>
								<option value="">— clear —</option>
								{bonPool(s).slice(0, 400).map((e) => (
									<option key={e.name} value={e.employee_number || e.name}>
										{`${e.employee_number || e.name}  ${e.employee_name || ""}`}
									</option>
								))}
							</select>
						</span>
					</>
				)}

				<label htmlFor="bonby">Filter By:</label>
				<span className="ctl">
					<select id="bonby" className="wide" value={f.by} onChange={(e) => stale({ by: e.target.value })}>
						{CTC_BY.map((b) => <option key={b[0]} value={b[0]}>{b[1]}</option>)}
					</select>
					<span className="hint">sections the working, on screen and in the export alike</span>
				</span>

				<label htmlFor="boncur">Output Currency:</label>
				<span className="ctl">
					<select id="boncur" value={f.currency} onChange={(e) => stale({ currency: e.target.value })}>
						{BONUS_CURRENCY.map((v) => <option key={v}>{v}</option>)}
					</select>
					{/* Their list has never been opened, so it offers the one value seen
					    in it. The control is worth keeping anyway: the group has a company
					    in the UAE, and the Payment of Bonus Act does not reach it. */}
					<span className="hint">
						their list has never been opened — Default is the company's own currency
					</span>
				</span>

				<label htmlFor="bonout">Report Output:</label>
				<span className="ctl">
					<select id="bonout" value={f.output} onChange={(e) => patch("bon", { output: e.target.value })}>
						{BONUS_OUTPUTS.map((v) => <option key={v}>{v}</option>)}
					</select>
					<span className="hint">Generate draws it on screen, then hands it to this</span>
				</span>

				<span />
				<span className="ctl">
					<label className="chk">
						<input type="checkbox" checked={f.logo}
							onChange={(e) => patch("bon", { logo: e.target.checked })} />
						With Logo
					</label>
				</span>
			</div>

			<div className="repacts">
				<button className="btn imp" onClick={() => button("generate")}>▤ Generate Report</button>
				<button className="btn ghost" onClick={() => button("reset")}>↺ Reset Fields</button>
				<button className="btn ghost" onClick={() => button("close")}>✕ Close</button>
				<button className="btn ghost" onClick={() => button("schedule")}>⏰ Schedule Report</button>
				<button className="btn ghost" onClick={() => button("background")}>⏳ Generate In Background</button>
			</div>

			{s.bonMsg && (
				<div className="mt-[.8rem]">
					<Note><Html html={s.bonMsg} /></Note>
				</div>
			)}
		</div>
	);
}

/** What Generate produced. */
function BonOut({ s }) {
	const f = s.bon;
	const [from, till] = bonRange(f);
	const years = fyOf(till) - fyOf(from) + 1;
	const rows = bonRows(s);

	if (from > till) {
		return (
			<div className="mt-[.9rem]">
				<Empty title="The range runs backwards">
					Till is before From, so no accounting year falls inside it.
				</Empty>
			</div>
		);
	}
	if (!rows.length) {
		return (
			<div className="mt-[.9rem]">
				<Empty title="Nobody in scope">
					No employee is left after these filters, or nobody had joined by {till}. Reset Fields puts
					them back.
				</Empty>
			</div>
		);
	}

	const t = bonTotals(rows);
	const flat = bonFlat(rows, bonSections(f, years));

	return (
		<>
			<div className="legend mt-[.9rem]">
				<b className="font-display">Generated</b>
				<span className={"cov " + (t.yes ? "part" : "none")}>
					{fmt(t.yes)} eligible
				</span>
				<span>
					{fmt(rows.length)} row{rows.length === 1 ? "" : "s"} over {years} accounting
					year{years === 1 ? "" : "s"} — {fmt(t.unknown)} undecidable, {fmt(t.no)} not eligible.
					At 8.33% <b>{money(t.lo)}</b>, at 20% <b>{money(t.hi)}</b>.
				</span>
				<button className="btn ghost ml-auto" onClick={() => bonDeliver(s, "Excel")}>⬇ Export CSV</button>
			</div>

			<div className="my-[.6rem]">
				<Gap>
					<b>Every number here is a floor, for three separate reasons.</b> Eligibility is tested on{" "}
					<code>ctc</code> &divide; 12, because no basic-plus-DA figure exists on this site and CTC is
					always the larger of the two — so <b>Yes</b> is certain, <b>No</b> is certain, and{" "}
					<b>Unknown</b> is somebody whose CTC is over the ceiling but whose wage may not be. The
					bonus is computed on ₹{fmt(BONUS_ACT.basis)} where sec 12 says ₹{fmt(BONUS_ACT.basis)}{" "}
					<em>or the minimum wage, whichever is higher</em>, and no minimum wage notification is held
					anywhere here. And the thirty-day test is made on days in service, because there are{" "}
					<b>no Attendance rows on this site</b> — days in service can only exceed days worked, so it
					rules somebody out and never in.
				</Gap>
			</div>

			<Scroll>
				{/* `io` for the two heading levels — a `sec` above a `grp` — which is
				    the same pair the leave report and the in/out report already use. */}
				<table className="io" style={{ minWidth: 96 * BONUS_COLS.length }}>
					<thead>
						<tr>{BONUS_COLS.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr>
					</thead>
					<tbody>
						{flat.map((x, i) => (x.head ? (
							<tr className={x.lvl > 1 ? "sec" : "grp"} key={"g" + x.lvl + x.head}>
								<td colSpan={BONUS_COLS.length}>
									{x.head} — {fmt(x.n)} · at 8.33% {money(x.lo)} · at 20% {money(x.hi)}
								</td>
							</tr>
						) : (
							<tr key={x.row.emp.name + x.row.fy + i}>
								{BONUS_COLS.map((c) => (
									<td key={c[0]} className={c[2] || undefined}>{String(c[1](x.row))}</td>
								))}
							</tr>
						)))}
					</tbody>
				</table>
			</Scroll>

		</>
	);
}

export default function BonusReport() {
	const s = useApp();

	return (
		<>
			<PayLegend what="Bonus Working Report" cov="part" tag="Working only">
				The Payment of Bonus Act working — who is eligible, on what figure, at what rate. Frappe HR can
				pay a bonus and cannot compute one, which is why this is the one page in this module that does
				arithmetic rather than describing what would do it.
			</PayLegend>

			<BonForm s={s} />

			{s.bonRun ? (
				<BonOut s={s} />
			) : (
				<People people={bonPool(s)}
					note="Everybody this working would cover, at the criteria above. Generate splits them by accounting year, applies the Act's three tests and computes the band."
					extra={["CTC ÷ 12", (e) => (e.ctc
						? "₹" + fmt(Math.round(Number(e.ctc) / 12))
						: <span className="muted">not recorded</span>)]} />
			)}

			{s.bonDoc && (
				<Modal
					title="Report preview"
					wide
					onClose={() => set({ bonDoc: "" })}
					actions={
						<>
							<button className="btn tpl" onClick={() => printPaper(s.bonDoc)}>
								<i className="fico" aria-hidden="true">🖨</i> Print / Save as PDF
							</button>
							<button className="embtn" onClick={() => bonDeliver(s, "Word")}>
								<i className="fico" aria-hidden="true">📝</i> Word
							</button>
							<button className="embtn" onClick={() => bonDeliver(s, "Excel")}>
								<i className="fico" aria-hidden="true">📊</i> Excel
							</button>
						</>
					}
					why={
						<>
							This is the document itself, not a drawing of it — the same HTML that Print, PDF and Word
							are handed, rendered here so it can be read before it goes anywhere.
						</>
					}
					extra={<iframe className="iopaper" title="Report preview" srcDoc={s.bonDoc} />}
				/>
			)}
		</>
	);
}
