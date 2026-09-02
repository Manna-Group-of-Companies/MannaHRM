import { useEffect } from "react";

import { getState, patch, set, useApp } from "@/store";
import { listAll } from "@/api/client";
import { scoped } from "@/lib/scope";
import { dmy, fmt, tidyDept, todayIso } from "@/lib/format";
import { CTC_BY } from "@/data/masters";
import {
	BT_ACTIONS, BT_FILE_COLS, BT_GROUPS, BT_MODES, BT_TABS,
	SREG_PAYROLL_TYPES, fyList, fyMonths, fyOf,
} from "@/data/payroll";
import {
	Empty, Gap, Html, Note, Scroll, SpecTable, Tile, Tiles, panelProps, tabProps,
} from "@/components/ui";

import { NotReadable, PayLegend } from "./shared";

/* BANK TRANSFER, photographed 29 August 2026 — both tabs — and drawn here
   control for control: the rail of three collapsed filter groups with their
   search box over it and Reset under it, and the preview panel beside it with
   its four buttons and its empty state.

   Their capture is empty on both tabs, and so is this until Preview is pressed.
   That is copied rather than improved on: an empty preview panel is what makes
   Preview the first thing anybody touches on this screen, and a page that
   listed 160 people on open would be answering a question nobody asked.

   **What it can honestly do is the readiness check under the payment file.** A
   bank line needs a name, an account, a branch code and an amount. Two of the
   four are on `Employee` and are read here; one of them — the IFSC — is not a
   field on ERPNext's Employee at all, and the fourth is payroll. So this page
   cannot produce a payment file and says so in four separate places, and what
   it produces instead is the list of who could be paid the day it can: who has
   an account number, who is on Bank mode, and who would be missed.

   That list is worth having now rather than after payroll is built. Chasing 160
   account numbers is weeks of somebody's time, it does not depend on a single
   line of payroll code, and it is the kind of work that is discovered late and
   then blocks a go-live. See docs/OPEN_QUESTIONS.md. */

/** Back to how the screen opens. `tab` is left out on purpose — Reset is inside
    a tab and resetting the filters must not move somebody off it. */
const RESET = {
	open: [], find: "",
	ptype: "Monthly", year: "", month: "", paydate: "",
	status: "Active", q: "", by: "",
	mode: "All", bankname: "", format: "",
	amounts: false, run: false, msg: "",
};

/* One extra read, made the first time somebody opens this screen — not part of
   the load every page pays for.

   The bank fields are asked for on their own for the same reason the payslip
   asks for the address fields on their own: a field this site does not carry
   fails the read that draws the whole dashboard, and *whether these are carried
   and filled* is most of what this screen exists to answer.

   `iban` is the one that may not be there, so the narrow list is the fallback
   and the page draws the IBAN column as absent rather than as empty when it
   lands — see CLAUDE.md §4. "absent" means the read itself was refused, which
   is a different finding again, and on this page the difference is between
   nobody having an account number and nobody having been asked. */
async function btProbe() {
	if (getState().btBankState) return;
	set({ btBankState: "loading" });

	const FULL = ["name", "salary_mode", "bank_name", "bank_ac_no", "iban"];
	const LESS = ["name", "salary_mode", "bank_name", "bank_ac_no"];

	const full = await listAll("Employee", FULL).catch(() => null);
	const rows = full || (await listAll("Employee", LESS).catch(() => null));

	set(rows
		? { btBank: Object.fromEntries(rows.map((r) => [r.name, r])), btBankState: full ? "ok" : "noiban" }
		: { btBank: null, btBankState: "absent" });
}

/** Whether the bank half of the master actually answered. Everything on this
    page that counts, filters or refuses hangs off this one question. */
const btKnown = (s) => s.btBankState === "ok" || s.btBankState === "noiban";

/** The payroll year on the form. Empty means the one today falls in, resolved
    here rather than seeded, so a tab left open across 31 March does not go on
    offering last year's months. */
const btYear = (f) => f.year || fyOf();

/** Which run is being paid out. Empty means the month today falls in — and
    unlike the register, an empty month here is not a different report: a
    transfer is one run's worth of money leaving one account, so it resolves to
    a month rather than to a year. A month left over from another year resolves
    to that year's last, which is the only reading of it that is not silent. */
function btMonth(f) {
	const ms = fyMonths(btYear(f));
	if (f.month && ms.some((m) => m[0] === f.month)) return f.month;
	const now = todayIso().slice(0, 7);
	return ms.some((m) => m[0] === now) ? now : ms[ms.length - 1][0];
}

/** The value date. Empty means today, resolved at render for the same reason —
    this is the one field on this form that is the day money leaves. */
const btPayDate = (f) => f.paydate || todayIso();

const btMonthLabel = (f) =>
	(fyMonths(btYear(f)).find((m) => m[0] === btMonth(f)) || ["", "—"])[1];

/** Every bank name the master holds, for the Bank list. Built from the data
    rather than from a list of banks: a filter offering a bank nobody is paid
    through is a filter that returns nothing and explains nothing. */
const btBanks = (s) =>
	[...new Set(Object.values(s.btBank || {}).map((b) => b.bank_name).filter(Boolean))].sort();

/** One row per person the transfer would cover, at the criteria on the rail. */
function btRows(s) {
	const f = s.bt;
	const bank = s.btBank || {};
	const known = btKnown(s);
	const q = f.q.trim().toLowerCase();

	let pool = scoped(s);
	if (f.status) pool = pool.filter((e) => e.status === f.status);
	if (q) {
		pool = pool.filter((e) => [e.employee_number, e.employee_name, e.designation]
			.some((v) => (v || "").toLowerCase().includes(q)));
	}

	let rows = pool.map((e) => {
		const b = bank[e.name] || {};
		return {
			e,
			mode: b.salary_mode || "",
			bank: b.bank_name || "",
			ac: b.bank_ac_no || "",
			iban: b.iban || "",
			/* What the line would pay. Null on every row and it stays null: the
			   figure that belongs here is the one no doctype on this site can
			   produce, and a zero is a figure somebody can be paid. */
			net: null,
		};
	});

	/* Both bank filters are applied only when the bank fields were actually
	   read. With nothing to filter on they would silently drop all 160 people
	   and read as a payroll with nobody in it — and dropping somebody who is
	   there is the expensive mistake on every screen in this repo. */
	if (known && f.mode !== "All") rows = rows.filter((r) => r.mode === f.mode);
	if (known && f.bankname) rows = rows.filter((r) => r.bank === f.bankname);

	const key = (r) => (f.by === "department" ? tidyDept(r.e.department) : r.e[f.by]) || "—";
	return rows.sort((a, b) =>
		(f.by ? key(a).localeCompare(key(b)) : 0)
		|| String(a.e.employee_name || "").localeCompare(String(b.e.employee_name || "")));
}

/** Every filter clears the last preview. Show Amounts does not — it changes
    what the same list shows, not what the list is. */
const stale = (part) => patch("bt", { ...part, run: false, msg: "" });

/** One field on the rail. The label and the hint are theirs and ours
    respectively; the control is picked by key here rather than declared in the
    data, because a select and a date box are not the same thing described
    differently. */
function BtField({ s, fld }) {
	const f = s.bt;
	const [k, lab, hint] = fld;
	const year = btYear(f);
	const known = btKnown(s);

	const ctl = {
		ptype: () => (
			<select value={f.ptype} aria-label={lab} onChange={(e) => stale({ ptype: e.target.value })}>
				{SREG_PAYROLL_TYPES.map((t) => <option key={t}>{t}</option>)}
			</select>
		),
		year: () => (
			<select value={year} aria-label={lab}
				/* Changing the year moves the months under it, so a March picked in
				   one year is not silently kept in the next. */
				onChange={(e) => stale({ year: e.target.value, month: "" })}>
				{fyList().map((y) => <option key={y}>{y}</option>)}
			</select>
		),
		month: () => (
			<select value={btMonth(f)} aria-label={lab} onChange={(e) => stale({ month: e.target.value })}>
				{fyMonths(year).map((m) => <option key={m[0]} value={m[0]}>{m[1]}</option>)}
			</select>
		),
		paydate: () => (
			<input type="date" value={btPayDate(f)} aria-label={lab}
				onChange={(e) => stale({ paydate: e.target.value })} />
		),
		status: () => (
			<select value={f.status} aria-label={lab} onChange={(e) => stale({ status: e.target.value })}>
				{["All", "Active", "Inactive", "Suspended", "Left"].map((v) => (
					<option key={v} value={v === "All" ? "" : v}>{v}</option>
				))}
			</select>
		),
		q: () => (
			<input type="search" placeholder="Code, name or designation" aria-label={lab}
				value={f.q} onChange={(e) => stale({ q: e.target.value })} />
		),
		by: () => (
			<select value={f.by} aria-label={lab} onChange={(e) => stale({ by: e.target.value })}>
				{CTC_BY.map((b) => <option key={b[0] || "none"} value={b[0]}>{b[1]}</option>)}
			</select>
		),
		mode: () => (
			<select value={f.mode} aria-label={lab} disabled={!known}
				onChange={(e) => stale({ mode: e.target.value })}>
				{BT_MODES.map((m) => <option key={m}>{m}</option>)}
			</select>
		),
		bankname: () => (
			<select value={f.bankname} aria-label={lab} disabled={!known || !btBanks(s).length}
				onChange={(e) => stale({ bankname: e.target.value })}>
				<option value="">All banks</option>
				{btBanks(s).map((b) => <option key={b}>{b}</option>)}
			</select>
		),
		/* Dead, and dead for a reason the hint states rather than for none. The
		   day somebody names the bank this becomes the one control on the rail
		   that decides what the export actually is. */
		format: () => (
			<select value="" aria-label={lab} disabled>
				<option value="">— no bank named —</option>
			</select>
		),
	}[k];

	return (
		<div className="btf">
			<span className="lab">{lab}</span>
			{ctl ? ctl() : null}
			<span className="hint"><Html html={hint} /></span>
		</div>
	);
}

/** The rail: their search box, their three groups, their Reset. */
function BtRail({ s }) {
	const f = s.bt;
	const q = f.find.trim().toLowerCase();

	/* Their search says "all filters", so it searches the fields rather than the
	   group names — a group whose own name matches but whose fields do not would
	   otherwise open onto nothing. A group with no hit is hidden entirely, and
	   the ones left are forced open: a search that leaves everything shut has
	   found nothing as far as anybody reading it is concerned. */
	const groups = BT_GROUPS
		.map((g) => [g[0], g[1], g[2].filter((x) => !q || x[1].toLowerCase().includes(q))])
		.filter((g) => g[2].length);

	return (
		<aside className="btrail">
			<div className="btfind">
				<input type="search" placeholder="Search all filters" aria-label="Search all filters"
					value={f.find} onChange={(e) => patch("bt", { find: e.target.value })} />
				<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
					strokeWidth="1.8" strokeLinecap="round">
					<circle cx="11" cy="11" r="7" />
					<path d="M20 20l-3.6-3.6" />
				</svg>
			</div>

			{groups.map((g) => {
				const stored = f.open.includes(g[0]);
				const open = q ? true : stored;
				return (
					<section className="btgroup" key={g[0]}>
						<button className="bthead" aria-expanded={open} aria-controls={"btg-" + g[0]}
							onClick={() => patch("bt", {
								open: stored ? f.open.filter((k) => k !== g[0]) : f.open.concat(g[0]),
							})}>
							<b>{g[1]}</b>
							<span className="cx" aria-hidden="true">⌄</span>
						</button>
						<div className="btfields" id={"btg-" + g[0]} hidden={!open}>
							{g[2].map((fld) => <BtField key={fld[0]} s={s} fld={fld} />)}
						</div>
					</section>
				);
			})}

			{groups.length ? null : (
				<div className="btmiss">
					No filter is called <b>{f.find}</b>. Their three groups hold nine fields between them and
					all nine are ours — see the note under the table.
				</div>
			)}

			<div className="btreset">
				<button className="embtn" onClick={() => patch("bt", RESET)}>Reset</button>
			</div>
		</aside>
	);
}

/** Their empty state, which is where both captures found this screen. */
const BtNone = ({ what }) => (
	<div className="btnone">
		<svg className="art" viewBox="0 0 72 88" width="72" height="88" fill="none"
			stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
			<path d="M12 8a4 4 0 0 1 4-4h24l20 20v44a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" />
			<path d="M40 4v20h20" />
			<path d="M28 48l16 16M44 48l-16 16" />
		</svg>
		<b>No Data Available</b>
		<span><b>Apply filters</b> and click Preview to view {what}</span>
	</div>
);

/** What Preview produced on the Regular tab: not a payment file, and never
    described as one. */
function BtOut({ s }) {
	const f = s.bt;
	const known = btKnown(s);
	const rows = btRows(s);

	if (s.btBankState === "loading") {
		return <Empty title="Reading the bank fields">One call, onto <code>Employee</code>.</Empty>;
	}

	if (!rows.length) {
		return (
			<Empty title="Nobody is in scope">
				No employee matches the filters on the rail. That is the filters rather than the payroll —
				the transfer would have listed whoever they allowed. The company picker in the top bar
				narrows this page too.
			</Empty>
		);
	}

	const withAc = rows.filter((r) => r.ac).length;
	const onBank = rows.filter((r) => r.mode === "Bank").length;
	const lined = rows.filter((r) => r.ac && r.mode === "Bank").length;
	const iban = s.btBankState === "ok";

	const cols = [
		["Employee Code", (r) => r.e.employee_number || "—", "mono"],
		["Employee Name", (r) => r.e.employee_name || r.e.name, ""],
		["Department", (r) => tidyDept(r.e.department), "muted"],
		["Salary Mode", (r) => (known ? r.mode || "—" : "—"), known ? "" : "gone"],
		["Bank", (r) => (known ? r.bank || "—" : "—"), known ? "muted" : "gone"],
		["Account", (r) => (known ? r.ac || "—" : "—"), known ? "mono" : "mono gone"],
		["IFSC", () => "—", "mono gone"],
	]
		.concat(iban ? [["IBAN", (r) => r.iban || "—", "mono"]] : [])
		.concat(f.amounts ? [["Amount", () => "—", "mono gone"]] : []);

	return (
		<div className="btout">
			<div className="ddacount">
				{btMonthLabel(f)} · {fmt(rows.length)} employee{rows.length === 1 ? "" : "s"} ·
				{" "}value date {dmy(btPayDate(f))}
			</div>

			{known ? (
				<Tiles>
					<Tile k="In scope" n={fmt(rows.length)} s="at the filters on the rail" />
					<Tile k="Account on file" n={fmt(withAc)}
						cls={withAc === rows.length ? "good" : "warn"}
						s={`${fmt(rows.length - withAc)} without one`} />
					<Tile k="Paid by bank" n={fmt(onBank)}
						s={`${fmt(rows.length - onBank)} on cash, cheque or nothing`} />
					<Tile k="Lines a bank would take" n="0" cls="bad" s="no IFSC, and no amount" />
				</Tiles>
			) : (
				<Note>
					<b>The bank fields could not be read.</b> The four columns below are drawn absent rather
					than empty, and no count is offered: <i>nobody has an account number</i> and <i>nobody
					was asked</i> are opposite findings, and only the first one is about the data. The two
					bank filters on the rail are ignored while this is true, so nobody is dropped from a
					list by a filter that has nothing to filter on.
				</Note>
			)}

			<Scroll>
				<table className="io" style={{ minWidth: 92 * cols.length }}>
					<thead>
						<tr>{cols.map((c) => <th key={c[0]}>{c[0]}</th>)}</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.e.name}>
								{cols.map((c) => (
									<td key={c[0]} className={c[2] || undefined}>{String(c[1](r))}</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>

			{known && lined < rows.length ? (
				<Note>
					<b>{fmt(rows.length - lined)} of these {fmt(rows.length)} could not be put in a file even
					with payroll working</b> — no account number, or not on Bank mode. That is the work this
					page exists to surface, and none of it waits on payroll: it is a list to chase, and it
					is chased through HR rather than through code. Somebody on Cash or Cheque is not an
					error; they are paid another way, and they have to be on a different list rather than
					missing from this one.
				</Note>
			) : null}

			<Gap>
				<b>The Amount column is the payment file, and it is empty for two reasons at once.</b> No
				payroll doctype is on this proxy&rsquo;s allowlist, and no <code>Salary Slip</code> has ever
				been generated on this site — so fixing either alone would still leave it blank. It is
				blank rather than nought on purpose: a nought is a figure somebody can be paid.
				{" "}<b>The IFSC column is worse</b>, because it is not a missing figure but a missing
				field, and the values behind it live only in Factor HR. Ask for them in the same export as
				E1.
			</Gap>

			<NotReadable />
		</div>
	);
}

/** The second tab. Nothing is held, and the reason is the finding. */
const BtHeld = () => (
	<>
		<Empty title="No salary is held, because nothing here can hold one">
			Factor HR holds pay as a state on the payroll and keeps a register of it. Frappe HR ships no
			such state: no flag on <code>Employee</code>, none on <code>Salary Slip</code>, and no
			doctype that means &ldquo;this person&rsquo;s money is being withheld and will be released
			later&rdquo;. So this tab is empty here for a reason that no amount of reading would change.
		</Empty>

		<Gap>
			<b>This is a cutover question before it is a build question.</b> Anybody whose salary is held
			in Factor HR on the day the group moves is money that has to land somewhere on this side, and
			today there is nowhere. Two things have to be known before a date is agreed: whether anybody
			is currently held, and what the hold is for — a disciplinary matter, an unreturned asset, a
			disputed final settlement. The first is one question to HR. The second decides whether this is
			a custom field on <code>Employee</code>, a rule inside the payroll run, or a document of its
			own with an approval on it. See the stop-salary tile on Salary Process, which is the same gap
			seen from the other side, and docs/OPEN_QUESTIONS.md.
		</Gap>
	</>
);

function BtPreview({ s, tab }) {
	const f = s.bt;

	return (
		<section className="btmain">
			<header>
				<b>{tab[2]}</b>
				<span className="btacts">
					{BT_ACTIONS.map((a) => (a[0] === "preview" ? (
						<button key={a[0]} className="embtn pri"
							title="List who this transfer would cover, at the filters on the rail"
							onClick={() => patch("bt", { run: true, msg: "" })}>
							{a[1]}
						</button>
					) : (
						<button key={a[0]} className="embtn"
							/* Show Amounts is a state; the other two are refusals, and a
							   refusal that stayed pressed would read as having worked. */
							aria-pressed={a[0] === "amounts" ? f.amounts : undefined}
							onClick={() => patch("bt", a[0] === "amounts"
								? { amounts: !f.amounts, msg: a[3] }
								: { msg: a[3] })}>
							<i className="fico" aria-hidden="true">{a[2]}</i>
							{a[0] === "register" ? tab[3] : a[1]}
						</button>
					)))}
				</span>
			</header>

			<div className="btbody">
				{!f.run
					? <BtNone what={f.tab === "held" ? "held salary" : "data"} />
					: f.tab === "held" ? <BtHeld /> : <BtOut s={s} />}
			</div>
		</section>
	);
}

export default function BankTransfer() {
	const s = useApp();
	const f = s.bt;
	const tab = BT_TABS.find((t) => t[0] === f.tab) || BT_TABS[0];

	useEffect(() => { void btProbe(); }, []);

	return (
		<>
			<PayLegend what="Bank Transfer" cov="part" tag="Readiness only">
				Turning a finished payroll into money leaving an account. Half of it is stock, and the half
				that is not is the file the bank will actually accept — which cannot be written here, and
				would still not be writable if payroll ran tomorrow. What this page does instead is count
				who could be paid at all.
			</PayLegend>

			<div className="fhscreen">
				<div className="fhtitle">Bank Transfer</div>

				<div className="ddatabs" role="tablist" aria-label="Bank Transfer">
					{BT_TABS.map((t) => (
						<button key={t[0]} {...tabProps("bttab-" + t[0], "btpane", f.tab === t[0])}
							/* Switching tabs puts the last preview away. The rail is shared and
							   the two lists are not: a held-salary panel left standing under
							   Regular's filters would be read as this month's transfer. */
							onClick={() => patch("bt", { tab: t[0], run: false, msg: "" })}>
							{t[1]}
						</button>
					))}
				</div>

				<div className="btsplit" {...panelProps("btpane", "bttab-" + f.tab)}>
					<BtRail s={s} />
					<BtPreview s={s} tab={tab} />
				</div>

				{f.msg ? <Note><Html html={f.msg} /></Note> : null}
			</div>

			<div className="fhtitle mt-4">What a payment file has to carry, line for line</div>
			<div className="mt-2">
				<SpecTable cols={["Column", "What it is", "State", "Note"]} list={BT_FILE_COLS} />
			</div>

			<div className="mt-[.7rem]">
				<Gap>
					<b>Three of these nine can be filled today and one of the six that cannot is a missing
					field rather than a missing figure.</b> That one is the IFSC, and it is the item to move
					on: a figure arrives the day payroll runs, whereas a field has to be added, then filled
					160 times from an export only Factor HR holds, then checked — because a wrong branch
					code is a payment that bounces a week later, after everybody has been told they were
					paid. Ask for it with E1, not after it.
				</Gap>
			</div>
		</>
	);
}
