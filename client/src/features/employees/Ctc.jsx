
import { active } from "@/lib/scope";
import { filled, fmt, tidyDept, todayIso } from "@/lib/format";
import { download, toCsv } from "@/lib/csv";
import { CTC_BY, CTC_MORE, CTC_RATING_MENU, CTC_UNITS, CTC_WHY } from "@/data/masters";
import { Empty, Gap, Html, Note, Scroll } from "@/components/ui";

import { patch, set, useApp } from "@/store";
import { go } from "@/routes/router";

/* Factor HR's CTC report is a filter panel and a Generate button, and the panel
   is copied control for control — including the controls we cannot honour,
   because a missing control hides the gap while a control that says why it
   cannot answer names it. */

const unitDiv = (unit) => (unit === "Monthly" ? 12 : unit === "Yearly" ? 1 : 0);

const amount = (e, unit) => {
	const div = unitDiv(unit);
	return e.ctc && div ? Math.round(Number(e.ctc) / div) : null;
};

/* The rows the form asks for. Read off what is already loaded — this report
   makes no request of its own, so Generate is instant and costs the site
   nothing. */
function ctcRows(s) {
	const f = s.ctc;
	const q = (f.emp || "").toLowerCase().trim();
	return s.employees
		.filter((e) => {
			if (s.company && e.company !== s.company) return false;
			if (f.status !== "All" && (e.status || "") !== f.status) return false;
			/* Factor HR means "active in this window"; on our side it can only mean
			   joined in it, because no relieving date came across. Said so on the form. */
			if (f.from && !(e.date_of_joining && e.date_of_joining >= f.from)) return false;
			if (f.till && !(e.date_of_joining && e.date_of_joining <= f.till)) return false;
			if (q) {
				const hay = `${e.employee_number || ""} ${e.employee_name || ""} ${e.name}`.toLowerCase();
				if (hay.indexOf(q) < 0) return false;
			}
			return true;
		})
		.sort((a, b) => {
			const k = f.by;
			if (k) {
				const d = String(a[k] || "—").localeCompare(String(b[k] || "—"));
				if (d) return d;
			}
			return String(a.employee_name || "").localeCompare(String(b.employee_name || ""));
		});
}

/** Download Rating Upload Template — the one item on that menu this page can
    actually do, so it does it.

    Pre-filled with whoever the criteria above cover, the way ERPNext's own Data
    Import templates are: a template of bare headings makes somebody retype 161
    employee codes, and a mistyped code is a rating landed on the wrong person.
    The rating columns are blank because they are the thing being collected.

    **The columns are ours, not theirs.** Factor HR's own template has never been
    seen, so this is what a rating import would need here — who, how much, from
    when — rather than a copy of a file nobody has opened. Whether ratings end up
    on an hrms `Appraisal` or somewhere else is still open, and the header row
    is the cheapest place to have that argument. */
function ratingTemplate(s) {
	const rows = ctcRows(s);
	const cols = ["Employee code", "Employee name", "Company", "Department",
		"Rating", "Effective from (WEF)", "Remarks"];
	download(
		"ctc-rating-template-" + todayIso() + ".csv",
		toCsv(cols, rows.map((e) => [
			e.employee_number || e.name,
			e.employee_name || "",
			e.company || "",
			tidyDept(e.department),
			"", s.ctc.wef || todayIso(), "",
		])),
	);
	return rows.length;
}

function CtcReport() {
	const s = useApp();
	const f = s.ctc;
	const rows = ctcRows(s);
	const unit = f.unit;
	const div = unitDiv(unit);

	if (!rows.length) {
		return (
			<Empty title="Nothing matches">
				No employee is left after these filters. Reset Fields puts them back.
			</Empty>
		);
	}

	const withCtc = rows.filter((e) => e.ctc);
	const sum = withCtc.reduce((n, e) => n + Number(e.ctc || 0), 0);
	const money = (v) => (v == null ? <span className="muted">—</span> : fmt(v));

	/* One pass, emitting a subtotal row whenever the grouping key changes. */
	const body = [];
	let last = null;
	let gs = 0;
	let gn = 0;
	const subtotal = (key) => {
		if (last === null) return;
		body.push(
			<tr className="grp" key={"g" + key + body.length}>
				<td colSpan={7}>{(last || "—") + " — " + gn + " " + (gn === 1 ? "person" : "people")}</td>
				<td className="n">{div ? fmt(Math.round(gs / div)) : "—"}</td>
			</tr>,
		);
		gs = 0;
		gn = 0;
	};
	rows.forEach((e) => {
		if (f.by) {
			const k = String(e[f.by] || "—");
			if (k !== last) {
				subtotal(k);
				last = k;
			}
			gs += Number(e.ctc || 0);
			gn++;
		}
		body.push(
			<tr key={e.name}>
				<td className="mono">{e.employee_number || e.name}</td>
				<td>{e.employee_name || ""}</td>
				<td className="muted">{e.company || "—"}</td>
				<td className="muted">{tidyDept(e.department)}</td>
				<td className="muted">{e.designation || "—"}</td>
				<td className="mono">{e.date_of_joining || "—"}</td>
				<td>{e.status || "—"}</td>
				<td className="n">{money(amount(e, unit))}</td>
			</tr>,
		);
	});
	if (f.by) subtotal("end");

	function exportCsv() {
		if (!rows.length) {
			set({ ctcMsg: "Nothing to export — no employee matches these filters." });
			return;
		}
		const cols = ["emp_code", "name", "company", "department", "designation",
			"date_of_joining", "status", "ctc_" + unit.toLowerCase()];
		const name = "ctc-earnings-" + todayIso() + ".csv";
		download(name, toCsv(cols, rows.map((e) => [
			String(e.employee_number || e.name), String(e.employee_name ?? ""), String(e.company ?? ""),
			tidyDept(e.department), String(e.designation ?? ""), String(e.date_of_joining ?? ""),
			String(e.status ?? ""), String(amount(e, unit) ?? ""),
		])));
		set({
			ctcMsg: `Exported ${fmt(rows.length)} row${rows.length === 1 ? "" : "s"} to ${name}. `
				+ "Written in the browser from what is already loaded — nothing was sent anywhere.",
		});
	}

	return (
		<>
			<div className="legend">
				<b className="font-display">Generated</b>
				<span className={"cov " + (withCtc.length ? "part" : "none")}>
					{fmt(rows.length)} row{rows.length === 1 ? "" : "s"}
				</span>
				<span>
					{fmt(withCtc.length)} with a CTC, {fmt(rows.length - withCtc.length)} blank
					{f.by ? `, grouped by ${f.by}` : ""}. Output unit <b>{unit}</b>.
				</span>
				<button className="btn ghost ml-auto" onClick={exportCsv}>⬇ Export CSV</button>
			</div>

			{!div && (
				<div className="my-[.6rem]">
					<Gap>
						<b>A daily rate cannot be computed here.</b> It needs the attendance-day divisor — 26
						days, calendar days or working days — which is the same unstated policy that{" "}
						<em>Based on Attendance Days</em> asks for. The column is left empty rather than filled
						with a guess: this number is somebody’s pay.
					</Gap>
				</div>
			)}

			<Scroll>
				<table className="ctc" style={{ minWidth: 900 }}>
					<thead>
						<tr>
							<th>Emp code</th><th>Name</th><th>Company</th><th>Department</th>
							<th>Designation</th><th>DOJ</th><th>Status</th>
							<th className="n">CTC ({unit.toLowerCase()})</th>
						</tr>
					</thead>
					<tbody>
						{body}
						<tr className="tot">
							<td colSpan={7}>
								Total — {fmt(withCtc.length)} of {fmt(rows.length)} with a CTC
							</td>
							<td className="n">{div ? fmt(Math.round(sum / div)) : "—"}</td>
						</tr>
					</tbody>
				</table>
			</Scroll>
		</>
	);
}

export default function Ctc() {
	const s = useApp();
	const f = s.ctc;
	const withCtc = s.employees.filter((e) => e.ctc);

	const field = (k, v) => {
		patch("ctc", { [k]: v });
		/* The answer arrives where the question was asked, and only when the box
		   is ticked — unticking it is not a question. */
		if (typeof v === "boolean") set({ ctcMsg: v ? CTC_WHY[k] || "" : "" });
	};

	const Chk = ({ k, label }) => (
		<label className="chk">
			<input type="checkbox" checked={f[k]} onChange={(e) => field(k, e.target.checked)} />
			{label}
		</label>
	);

	function button(k) {
		if (k === "generate") return set({ ctcRun: true, ctcMsg: "" });
		if (k === "reset") {
			set({
				ctc: { by: "", status: "All", from: "", till: "", emp: "", wef: todayIso(),
					unit: "Yearly", attdays: false, hidegroup: false, incr: false,
					catcode: false, grouptotal: false, qual: false, exp: false, rating: false },
				ctcRun: false, ctcPick: false, ctcMenu: false, ctcMsg: "Fields reset.",
			});
			return;
		}
		if (k === "background") {
			return set({
				ctcMsg:
					"There is no queue behind this page. In ERPNext a long report is enqueued and mailed when "
					+ "it finishes; here it is computed in the browser from records already loaded, so Generate "
					+ "is instant and this button has nothing to hand off to.",
			});
		}
		if (k === "close") return go({ ctcRun: false, ctcMsg: "", subtab: "overview" });
		if (k === "pick") return set({ ctcPick: !s.ctcPick });
		/* Both remaining buttons write, and one of them writes salary. Refused
		   here rather than half-built: an import that silently pays somebody the
		   wrong amount is the single most expensive thing this page could learn
		   to do. */
		set({
			ctcMsg:
				(k === "rating"
					? "<b>CTC Rating Data Import writes salary.</b> "
					: "<b>Import Employees from Excel writes employee records.</b> ")
				+ "This page proxies GET only — see <code>server/index.js</code>, where the one write allowed is "
				+ "a decision on an approval. "
				+ (k === "rating"
					? "A spreadsheet import onto CTC is also the one action here that can pay somebody the "
						+ "wrong amount without anybody noticing, so it wants a server rule in front of it rather "
						+ "than a file picker."
					: "Loading people is a migration step with its own tooling in <code>tools/</code>, run "
						+ "deliberately and checked, not a button on a report."),
		});
	}

	return (
		<>
			<div className="legend">
				<b className="font-display">CTC / Earnings</b>
				{withCtc.length ? (
					<span className="cov part">Partial</span>
				) : (
					<span className="cov none">No data</span>
				)}
				<span>Their criteria panel, control for control — <b>Generate</b> puts the report underneath.</span>
			</div>

			{/* Theirs is a menu, not a button: two items, both of them a file moving
			    in or out, and both refused here for reasons that differ. Drawn as the
			    menu it is — a single button would hide that there are two. */}
			<div className="repbar">
				<span className="ctcdrop">
					<button className="btn ghost" aria-haspopup="menu" aria-expanded={s.ctcMenu}
						onClick={(e) => { e.stopPropagation(); set({ ctcMenu: !s.ctcMenu, ctcMsg: "" }); }}>
						⬇ CTC Rating Data Import <b className="cx">▾</b>
					</button>
					<div className="ctcmenu" role="menu" hidden={!s.ctcMenu}>
						{CTC_RATING_MENU.map(([k, ico, label, why]) => (
							<button key={k} role="menuitem"
								onClick={(e) => {
									e.stopPropagation();
									/* One of the two is a file leaving, which this page can do; the
									   other is a file arriving, which it must not. */
									if (k !== "template") return set({ ctcMenu: false, ctcMsg: why });
									const n = ratingTemplate(s);
									set({
										ctcMenu: false,
										ctcMsg: `<b>Template downloaded</b> — ${n} ${n === 1 ? "person" : "people"}, `
											+ "at the criteria above, with the rating columns blank. " + why,
									});
								}}>
								<span className="ico" aria-hidden="true">{ico}</span>
								{label}
							</button>
						))}
					</div>
				</span>
			</div>

			<div className="repform">
				<fieldset className="repset">
					<legend>Filters</legend>
					<div className="repgrid">
						<label htmlFor="ctcby">Filter By:</label>
						<span className="ctl">
							<select id="ctcby" className="wide" value={f.by} onChange={(e) => field("by", e.target.value)}>
								{CTC_BY.map((b) => (
									<option key={b[0]} value={b[0]}>{b[1]}</option>
								))}
							</select>
							<span className="hint">groups the output</span>
						</span>
					</div>
				</fieldset>

				<div className="repgrid">
					<label htmlFor="ctcstatus">Employee Status:</label>
					<span className="ctl">
						<select id="ctcstatus" value={f.status} onChange={(e) => field("status", e.target.value)}>
							{["All", "Active", "Inactive", "Suspended", "Left"].map((v) => (
								<option key={v}>{v}</option>
							))}
						</select>
					</span>

					<label htmlFor="ctcfrom">Active Date From:</label>
					<span className="ctl">
						<input type="date" id="ctcfrom" value={f.from} onChange={(e) => field("from", e.target.value)} />
						<label htmlFor="ctctill" className="text-ink-2">Date Till:</label>
						<input type="date" id="ctctill" value={f.till} onChange={(e) => field("till", e.target.value)} />
						<span className="hint">on date of joining — no relieving date came across</span>
					</span>

					<label htmlFor="ctcemp">Particular Employee:</label>
					<span className="ctl">
						<input type="text" id="ctcemp" className="wide" placeholder="Type to search"
							value={f.emp} onChange={(e) => field("emp", e.target.value)} />
						<button className="dots" title="Pick from the list" onClick={() => button("pick")}>…</button>
						<button className="btn imp" onClick={() => button("xls")}>☷ Import Employees from Excel</button>
					</span>

					{s.ctcPick && (
						<>
							<span />
							<span className="ctl">
								<select
									size={8}
									className="wide"
									value=""
									onChange={(e) => {
										patch("ctc", { emp: e.target.value });
										set({ ctcPick: false });
									}}
								>
									<option value="">— clear —</option>
									{s.employees.slice(0, 400).map((e) => (
										<option key={e.name} value={e.employee_number || e.name}>
											{(e.employee_number || e.name) + "  " + (e.employee_name || "")}
										</option>
									))}
								</select>
							</span>
						</>
					)}

					<label htmlFor="ctcwef">WEF:</label>
					<span className="ctl">
						<input type="date" id="ctcwef" value={f.wef || todayIso()}
							onChange={(e) => field("wef", e.target.value)} />
						<span className="hint">(Categories / Salary Rates WEF)</span>
						<Chk k="incr" label="With Increment History" />
					</span>

					<label htmlFor="ctcunit">Output Unit:</label>
					<span className="ctl">
						<select id="ctcunit" value={f.unit} onChange={(e) => field("unit", e.target.value)}>
							{CTC_UNITS.map((v) => (
								<option key={v}>{v}</option>
							))}
						</select>
					</span>

					<span />
					<span className="ctl">
						<Chk k="attdays" label="Based on Attendance Days" />
						<Chk k="hidegroup" label="Hide Wage Type Group" />
					</span>
				</div>

				{/* Open by default, because theirs is: the capture of 31 August 2026
				    caught it expanded, and the five boxes under it turned out to be the
				    most interesting thing on the screen. Not one of them can be
				    honoured — see CTC_WHY, which answers each where it is ticked. */}
				<details className="repmore" open>
					<summary>More options:</summary>
					<div className="body repopts">
						{CTC_MORE.map(([k, label]) => <Chk key={k} k={k} label={label} />)}
					</div>
				</details>

				<div className="repacts">
					<button className="btn imp" onClick={() => button("generate")}>▤ Generate</button>
					<button className="btn ghost" onClick={() => button("reset")}>↺ Reset Fields</button>
					<button className="btn ghost" onClick={() => button("background")}>⏳ Generate In Background</button>
					<button className="btn ghost" onClick={() => button("close")}>✕ Close</button>
				</div>

				{s.ctcMsg && (
					<div className="mt-[.8rem]">
						<Note><Html html={s.ctcMsg} /></Note>
					</div>
				)}
			</div>

			{/* Their screen is the criteria and the button row, and nothing else
			    until Generate is pressed. The directory of everybody it would cover
			    and the CTC summary panel both sat here and neither is on it; the
			    counts they carried are on Employees → All. */}
			{s.ctcRun ? <CtcReport /> : null}
		</>
	);
}
