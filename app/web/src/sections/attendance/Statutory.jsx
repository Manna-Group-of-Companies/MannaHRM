import { Fragment } from "react";
import { SR_BY, SR_COLS, SR_OUTPUTS } from "@/data/attendance";
import { Cols, Empty, Gap, Html, Note, NoteBelow, Panel, Scroll } from "@/components/ui";
import { cell, download } from "@/lib/csv";
import { MONTHS, fmt } from "@/lib/format";
import { listAll } from "@/api/client";
import { getState, patch, set, useApp } from "@/state/store";

/* Statutory Reports, read on 28 Aug 2026 with **Report Type unselected** — so
   what this menu files is still the open question, and nothing here claims to
   be their report. What is drawn instead is their form, and underneath it the
   readiness check any monthly return needs: everybody in scope, and which of a
   return's columns this site can actually put something behind.

   Generate is the whole model, as on Daily Detail and CTC / Earnings: nothing
   is listed until it is pressed. A report that runs on open is a report nobody
   chose the period for. */

const RESET = {
	mode: "month", month: new Date().getMonth(), year: new Date().getFullYear(),
	from: "", till: "", type: "", status: "Active", emp: "", by: "", output: "Excel",
	code: false, hidehdr: false, pick: false,
};

const srPeriod = (f) =>
	f.mode === "date" ? `${f.from || "—"} to ${f.till || "—"}` : `${MONTHS[f.month]} ${f.year}`;

/** Everybody the form's filters leave in scope, in the order the report lists
    them — grouped by `Filter By` first, then by name. */
function srRows(s) {
	const f = s.sr;
	const q = (f.emp || "").toLowerCase().trim();
	return s.employees
		.filter((e) => {
			if (s.company && e.company !== s.company) return false;
			if (f.status && (e.status || "") !== f.status) return false;
			if (q) {
				const hay = `${e.employee_number || ""} ${e.employee_name || ""} ${e.name}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		})
		.sort((a, b) => {
			if (f.by) {
				const d = String(a[f.by] || "—").localeCompare(String(b[f.by] || "—"));
				if (d) return d;
			}
			return String(a.employee_name || "").localeCompare(String(b.employee_name || ""));
		});
}

/* One extra read, and only when Generate is pressed: whether the two statutory
   identifiers exist on this site at all. Both are tried together and a refusal
   is an answer rather than an error — "the field is not there" is exactly what
   a readiness check wants to know. */
async function srProbe() {
	if (getState().srExtraState) return;
	set({ srExtraState: "loading" });
	const rows = await listAll("Employee",
		["name", "provident_fund_account", "custom_pan_no"]).catch(() => null);
	set(rows
		? { srExtra: Object.fromEntries(rows.map((r) => [r.name, r])), srExtraState: "ok" }
		: { srExtra: null, srExtraState: "absent" });
}

/** Which columns this site can fill, given whether the probe found the two
    statutory fields. A column nothing can fill is shaded rather than dropped —
    the emptiness is the finding. */
function srCells(s) {
	const rows = srRows(s);
	const cols = SR_COLS.filter((c) => c[1] !== "code" || s.sr.code);
	const known = s.srExtraState === "ok";
	const extra = (e) => (s.srExtra || {})[e.name] || {};

	const raw = (c, e) => {
		if (c[2]) return c[2](e);
		if (!known) return "";
		if (c[1] === "pf") return String(extra(e).provident_fund_account || "");
		if (c[1] === "pan") return String(extra(e).custom_pan_no || "");
		return "";
	};
	const filled = (c) => {
		if (c[2]) return true;
		if ((c[1] === "pf" || c[1] === "pan") && known) return rows.some((e) => raw(c, e));
		return false;
	};
	return { rows, cols, raw, filled, empty: cols.filter((c) => !filled(c)) };
}

function srExport(s) {
	const { rows, cols, raw } = srCells(s);
	const f = s.sr;
	if (!rows.length) return set({ srMsg: "Nothing to export — nobody is in scope." });

	const head = cols.map((c) => c[0].toLowerCase().replace(/[^a-z0-9]+/g, "_"));
	const csv = (f.hidehdr ? [] : [head.join(",")])
		.concat(rows.map((e) => cols.map((c) => cell(raw(c, e))).join(",")))
		.join("\r\n");
	const stamp = f.mode === "month"
		? `${f.year}-${String(f.month + 1).padStart(2, "0")}`
		: f.from || "range";
	const name = `statutory-${stamp}.csv`;
	download(name, csv);
	set({
		srMsg: `Exported ${fmt(rows.length)} row${rows.length === 1 ? "" : "s"} to ${name}. `
			+ "Written in the browser from what is already loaded — nothing was sent anywhere.",
	});
}

function SrForm({ s }) {
	const f = s.sr;
	const forms = (s.letterTypes || []).filter((t) => String(t.category || "") === "Statutory Form");

	/* Every control changes what Generate *would* list, so touching one clears
	   the last run rather than leaving a stale report above a changed form. */
	const stale = (part) => {
		patch("sr", part);
		set({ srRun: false, srMsg: "" });
	};

	function button(k) {
		if (k === "generate") {
			set({ srRun: true, srMsg: "" });
			// Whether the fields exist at all is the answer this page is really after.
			if (!s.srExtraState) void srProbe();
			if (f.output === "Excel") return srExport(getState());
			if (f.output === "PDF") {
				set({
					srMsg: "<b>PDF is not built, and for these forms that is deliberate.</b> Nine of the "
						+ "seventeen formats are government forms whose layout is legally fixed — reproduce "
						+ "them exactly or not at all. A PDF that is nearly right is worse than none, because "
						+ "somebody will file it.",
				});
			}
			return;
		}
		if (k === "reset") return set({ sr: { ...RESET }, srRun: false, srMsg: "Fields reset." });
		if (k === "close") return set({ srRun: false, srMsg: "", subtab: "all" });
		if (k === "pick") return patch("sr", { pick: !f.pick });
		if (k === "export") return srExport(s);
		if (k === "schedule") {
			return set({
				srMsg: "<b>Scheduling exists in ERPNext already</b> — Frappe’s <em>Auto Email Report</em> sends "
					+ "a saved report on a cron to a list of people, which is exactly this button. It needs two "
					+ "things this page does not have: an outgoing mail account on the site, and a write to "
					+ "create the schedule. It is configuration on the bench rather than code, and it is worth "
					+ "knowing that the day somebody asks who receives the PF return each month.",
			});
		}
		if (k === "background") {
			set({
				srMsg: "There is no queue behind this page. In ERPNext a long report is enqueued and mailed "
					+ "when it finishes; here it is computed in the browser from records already loaded, so "
					+ "Generate is instant and this button has nothing to hand off to.",
			});
		}
	}

	const ACTS = [
		["generate", "▤ Generate"], ["reset", "↺ Reset Fields"], ["close", "✕ Close"],
		["schedule", "⏰ Schedule Report"], ["background", "⏳ Generate In Background"],
	];

	return (
		<div className="repform">
			<div className="repradio">
				{[["date", "Date wise"], ["month", "Month wise"]].map((m) => (
					<label key={m[0]}>
						<input type="radio" name="srmode" checked={f.mode === m[0]}
							onChange={() => stale({ mode: m[0] })} />
						{m[1]}
					</label>
				))}
			</div>

			<div className="repgrid">
				{f.mode === "month" ? (
					<>
						<label htmlFor="srmonth">Month:</label>
						<span className="ctl">
							<select id="srmonth" value={f.month} onChange={(e) => stale({ month: Number(e.target.value) })}>
								{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
							</select>
							<label htmlFor="sryear" className="text-ink-2">Year:</label>
							<input id="sryear" type="number" min={2000} max={2099} value={f.year}
								onChange={(e) => stale({ year: Number(e.target.value) })} />
						</span>
					</>
				) : (
					<>
						<label htmlFor="srfrom">Date Range:</label>
						<span className="ctl">
							<input id="srfrom" type="date" value={f.from} onChange={(e) => stale({ from: e.target.value })} />
							<span className="text-ink-3">–</span>
							<input type="date" aria-label="To date" value={f.till}
								onChange={(e) => stale({ till: e.target.value })} />
							<span className="hint">
								the Date wise control has not been screenshotted; a range is the reading
							</span>
						</span>
					</>
				)}

				<label htmlFor="srtype">Report Type:</label>
				<span className="ctl">
					<select id="srtype" className="wide" value={f.type} onChange={(e) => stale({ type: e.target.value })}>
						<option value="">Select report type</option>
						{forms.map((t) => <option key={t.name}>{t.name}</option>)}
					</select>
					<span className="hint">
						{forms.length
							? "our statutory Letter Types — theirs has never been opened"
							: "none loaded on this site"}
					</span>
				</span>

				<label htmlFor="srstatus">Employee Status:</label>
				<span className="ctl">
					<select id="srstatus" value={f.status} onChange={(e) => stale({ status: e.target.value })}>
						{[["Active", "Active"], ["Inactive", "Inactive"], ["", "All"]].map((o) => (
							<option key={o[1]} value={o[0]}>{o[1]}</option>
						))}
					</select>
				</span>

				<label htmlFor="sremp">Particular Employee:</label>
				<span className="ctl">
					<input id="sremp" type="text" className="wide" placeholder="Type to search" value={f.emp}
						onChange={(e) => stale({ emp: e.target.value })} />
					<button className="dots" title="Pick from the list" onClick={() => button("pick")}>…</button>
				</span>
				{f.pick && (
					<>
						<span />
						<span className="ctl">
							{/* Capped at 400: this is a picker, and a select with 504 options in it is a
							    scroll rather than a choice. Typing in the box above reaches the rest. */}
							<select size={8} className="wide" aria-label="Pick an employee"
								value={f.emp}
								onChange={(e) => { patch("sr", { emp: e.target.value, pick: false }); set({ srRun: false }); }}>
								<option value="">— clear —</option>
								{s.employees.slice(0, 400).map((e) => (
									<option key={e.name} value={e.employee_number || e.name}>
										{`${e.employee_number || e.name}  ${e.employee_name || ""}`}
									</option>
								))}
							</select>
						</span>
					</>
				)}

				<label htmlFor="srby">Filter By:</label>
				<span className="ctl">
					<select id="srby" className="wide" value={f.by} onChange={(e) => stale({ by: e.target.value })}>
						{SR_BY.map((b) => <option key={b[0]} value={b[0]}>{b[1]}</option>)}
					</select>
					<span className="hint">groups the output</span>
				</span>

				<label htmlFor="srout">Report Output:</label>
				<span className="ctl">
					<select id="srout" value={f.output} onChange={(e) => stale({ output: e.target.value })}>
						{SR_OUTPUTS.map((v) => <option key={v}>{v}</option>)}
					</select>
				</span>

				<span />
				<span className="ctl flex-col items-start gap-[.35rem]">
					<label className="chk">
						<input type="checkbox" checked={f.code}
							onChange={(e) => { patch("sr", { code: e.target.checked }); set({ srMsg: "" }); }} />
						Display Employee Code
					</label>
					<label className="chk">
						<input type="checkbox" checked={f.hidehdr}
							onChange={(e) => {
								patch("sr", { hidehdr: e.target.checked });
								/* Their own reason for this control, worth recording: a report whose
								   headings are dropped is a report being pasted into somebody else's
								   document that carries its own. */
								set({
									srMsg: e.target.checked
										? "Hide Header drops the column headings from the table and from the export. On "
										+ "their side that is for pasting into a form that carries its own headings — "
										+ "which is a small confirmation that these reports end up inside somebody "
										+ "else’s document."
										: "",
								});
							}} />
						Hide Header
					</label>
				</span>
			</div>

			<div className="repacts">
				{ACTS.map((a) => (
					<button key={a[0]} className={"btn " + (a[0] === "generate" ? "imp" : "ghost")}
						onClick={() => button(a[0])}>
						{a[1]}
					</button>
				))}
			</div>

			{s.srMsg && (
				<div className="mt-[.85rem]">
					<Note><Html html={s.srMsg} /></Note>
				</div>
			)}
		</div>
	);
}

function SrReport({ s }) {
	const f = s.sr;
	const { rows, cols, raw, filled, empty } = srCells(s);

	if (!rows.length) {
		return (
			<div className="mt-[.9rem]">
				<Empty title="Nobody in scope">
					No employee is left after these filters. Reset Fields puts them back.
				</Empty>
			</div>
		);
	}

	/* Group headings, when Filter By is set. Emitted inline as the list is walked
	   rather than by bucketing first, because the sort above has already put the
	   rows in group order and a second pass could only disagree with it. */
	let last = null;
	const body = rows.map((e) => {
		const head = f.by ? String(e[f.by] || "—") : null;
		const first = head !== null && head !== last;
		if (first) last = head;
		return (
			<Fragment key={e.name}>
				{first && <tr className="grp"><td colSpan={cols.length}>{head}</td></tr>}
				<tr>
					{cols.map((c) => (
						<td key={c[0]} className={filled(c) ? undefined : "gapcol"}>{raw(c, e) || "—"}</td>
					))}
				</tr>
			</Fragment>
		);
	});

	return (
		<>
			<div className="legend mt-[.9rem]">
				<b className="font-display">Generated</b>
				<span className={"cov " + (empty.length > cols.length / 2 ? "none" : "part")}>
					{fmt(rows.length)} people
				</span>
				<span>
					{srPeriod(f)}{f.type ? ", " + f.type : ""} — <b>{cols.length - empty.length} of {cols.length} columns</b> can be filled.
				</span>
				<button className="btn ghost ml-auto" onClick={() => srExport(s)}>⬇ Export CSV</button>
			</div>

			<div className="my-[.6rem]">
				<Gap>
					<b>This is not their report.</b> Nobody has opened Report Type, so what Factor HR files from
					this menu is unknown and is not reproduced here. What is shown instead is the readiness check
					underneath any monthly return: everybody in scope for {srPeriod(f)}, and which of the columns
					such a return needs our site can actually put behind it.{" "}
					{empty.length ? (
						<>
							The {empty.length} shaded column{empty.length === 1 ? " is" : "s are"} empty for every
							person:{" "}
							{empty.map((c, i) => (
								<Fragment key={c[0]}>
									{i ? ", " : ""}<code>{c[0]}</code>{c[3] ? ` (${c[3]})` : ""}
								</Fragment>
							))}.
						</>
					) : "Every column has something behind it."}
				</Gap>
			</div>

			<Scroll>
				<table className="sr" style={{ minWidth: 140 * cols.length }}>
					{!f.hidehdr && (
						<thead>
							<tr>
								{cols.map((c) => (
									<th key={c[0]} className={filled(c) ? undefined : "gapcol"}>{c[0]}</th>
								))}
							</tr>
						</thead>
					)}
					<tbody>{body}</tbody>
				</table>
			</Scroll>

			{f.hidehdr && (
				<div className="mt-[.5rem] muted">
					Header hidden, as asked. On their side that is for pasting straight into a form that carries
					its own headings.
				</div>
			)}
		</>
	);
}

export default function Statutory() {
	const s = useApp();
	const forms = (s.letterTypes || []).filter((t) => String(t.category || "") === "Statutory Form");

	return (
		<>
			<div className="legend">
				<b className="font-display">Statutory Reports</b>
				<span className="cov none">Report Type never opened</span>
				<span>
					The panel was read on 28 Aug 2026 with <b>Report Type unselected</b>, so what this menu files
					is still the open question.
				</span>
			</div>

			<div className="mt-[.8rem]">
				<SrForm s={s} />
			</div>

			{s.srRun ? <SrReport s={s} /> : (
				<div className="mt-[.9rem]">
					<Empty title="Nothing generated yet">
						Factor HR lists nothing until Generate is pressed, and that is copied — a report that runs
						on open is a report nobody chose the period for.
					</Empty>
				</div>
			)}

			<Cols>
				<Panel title="One dropdown would settle this page" cov="none" ico="❓">
					<Gap>The Report Type list, expanded.</Gap>
					<NoteBelow>
						It is the only control that says <em>what</em> is filed from here, and it was left on{" "}
						<em>Select report type</em> when the screen was photographed. Everything else on the form
						is a filter over whatever it names. <b>One screenshot with that dropdown open closes the
						whole page</b> — and until it arrives, the list above is our own statutory Letter Types
						standing in, labelled as such.
					</NoteBelow>
				</Panel>

				<Panel title="Statutory forms already loaded" cov={forms.length ? "live" : "none"} ico="📜">
					{forms.length ? (
						<div className="rows">
							{forms.map((t) => (
								<div className="row" key={t.name}>
									<span className="mono">{t.name}</span>
									<span className="val muted">Letter Type</span>
								</div>
							))}
						</div>
					) : (
						<Empty title="None loaded">
							Letter Type has no rows in the Statutory Form category.
						</Empty>
					)}
					<NoteBelow>
						<b>Nine of Factor HR’s seventeen letter formats are government forms</b>, not letters —
						Form 5, 10, 10C, 11, 13R, 19 and 25, plus the two that would not convert. They merge
						against live employee records, which is the same machinery the HR letters use.
					</NoteBelow>
				</Panel>

				<Panel title="Two would not convert" cov="none" ico="⚠">
					<Gap>
						<code>Form 2 Revised</code> and <code>Form 3A</code>.
					</Gap>
					<NoteBelow>
						Their content sits in Word form controls and images rather than in text, so nothing came
						out of the extraction. <b>A statutory layout is legally fixed: reproduce it exactly or not
						at all</b>, which makes these two a typesetting job rather than a templating one — and it
						is why <em>Report Output: PDF</em> above refuses rather than approximates.
					</NoteBelow>
				</Panel>

				<Panel title="PF is live over there" cov="part" ico="📊">
					<Note>
						The <b>ECR File</b> sits in Factor HR’s Quick Reports, which confirms the EPFO return is
						filed from it, and an IncomeTax Computation Register sits beside it for TDS. Both are
						outputs of payroll, and <b>payroll is calculated by hand today</b> — so these are
						background rather than a target for the first release.
					</Note>
				</Panel>

				<Panel title="Why this sits under Attendance" cov="none" ico="⚖">
					<Note>
						Worth a question rather than a conclusion. The forms we hold are PF and ESI forms attached
						to <em>people</em>, and the ECR file is a payroll output — neither obviously belongs on an
						attendance menu. But every monthly return needs <b>days paid</b>, and days paid is an
						attendance number. If that is why it is here, then this page is downstream of the policy
						engine like everything else on this menu.
					</Note>
				</Panel>
			</Cols>
		</>
	);
}
