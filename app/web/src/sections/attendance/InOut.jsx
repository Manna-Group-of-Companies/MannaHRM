import { Fragment } from "react";
import { FH_STREAMS, IO_BY, IO_MAXDAYS, IO_PERIODS } from "@/data/attendance";
import { Cols, Empty, Gap, Html, Note, NoteBelow, Panel, Scroll } from "@/components/ui";
import { cell, download } from "@/lib/csv";
import { clock, dayOf, dmy, fmt, todayIso } from "@/lib/format";
import { listAll } from "@/api/client";
import { getState, patch, set, useApp } from "@/state/store";

/* Factor HR's newer report chrome, photographed 28 Aug 2026: the title, a row
   of labelled controls, then REPORT CRITERIA / ADVANCE tabs holding a date
   range, a time window, the selfie switch, layout options and a funnel for
   additional filters.

   Copied control for control, including the four that cannot answer. The date
   range is the one that reaches the site: the dashboard loads today's punches
   on open, and any other day has to be fetched, so Generate is a request and
   the rest of the form is arithmetic on what it returned. */

/* Which stream a punch came from. The trusted device-id prefix is still one of
   the open questions, so this reads the weaker version of the same rule: a
   punch carrying a terminal is from a machine, and one carrying none is not.
   Named `Unknown` rather than `Mobile` on purpose — the strong claim needs the
   prefix, and calling it mobile would geofence it in a reader's head. */
const ioStream = (r) => (r.device_id ? "Terminal" : "Unknown");

/** Today's punches, scoped by the company picker — already loaded, so shown
    without asking. */
const todaysPunches = (s) =>
	s.checkins
		.filter((c) => !s.company || s.byName[c.employee]?.company === s.company)
		.slice()
		.sort((x, y) => String(x.time).localeCompare(String(y.time)));

/* Everything the form asks of what came back. The date range was already
   applied by the fetch; these are the filters that do not need the site. */
function ioFiltered(s) {
	const f = s.io;
	const q = (f.emp || "").toLowerCase().trim();
	return (s.ioRows || [])
		.filter((r) => {
			const e = s.byName[r.employee] || {};
			if (s.company && e.company !== s.company) return false;
			if (f.status && (e.status || "") !== f.status) return false;
			if (f.logtype && (r.log_type || "") !== f.logtype) return false;
			if (f.stream && ioStream(r) !== f.stream) return false;
			const hm = String(r.time || "").slice(11, 16);
			if (f.t1 && hm && hm < f.t1) return false;
			if (f.t2 && hm && hm > f.t2) return false;
			if (q) {
				const hay = `${e.employee_number || ""} ${e.employee_name || r.employee_name || ""} ${r.employee}`
					.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		})
		.sort((a, b) => {
			if (f.period === "Employee Wise") {
				const an = s.byName[a.employee]?.employee_name || a.employee;
				const bn = s.byName[b.employee]?.employee_name || b.employee;
				const d = String(an).localeCompare(String(bn));
				if (d) return d;
			}
			return String(a.time || "").localeCompare(String(b.time || ""));
		});
}

/* The one request this page makes. Both field lists are tried in turn: an
   `Employee Checkin` without `device_id` on it would otherwise take the whole
   report down, and the report is more useful without that column than absent. */
async function ioGenerate() {
	const f = getState().io;
	const from = f.from || todayIso();
	const till = f.till || todayIso();
	patch("io", { from, till });

	if (from > till) return set({ ioMsg: "The date range ends before it starts." });

	const days = Math.round((new Date(till).getTime() - new Date(from).getTime()) / 86400000) + 1;
	if (days > IO_MAXDAYS) {
		/* The site has a daily compute limit and this is a per-punch table: at 160
		   people a year is on the order of a hundred thousand rows. */
		return set({
			ioMsg: `That is ${fmt(days)} days. This report asks the site for every punch in the range, so it `
				+ `is capped at ${IO_MAXDAYS} days — the site has a daily compute limit and a punch table `
				+ "grows by 320 rows a day once the bridge is running.",
		});
	}

	set({ ioState: "loading", ioMsg: "" });
	const range = [["time", ">=", from + " 00:00:00"], ["time", "<=", till + " 23:59:59"]];

	let rows = await listAll("Employee Checkin",
		["name", "employee", "employee_name", "time", "log_type", "device_id"], range).catch(() => null);
	let err = "";
	if (rows === null) {
		rows = await listAll("Employee Checkin", ["name", "employee", "time", "log_type"], range)
			.catch((e) => { err = String(e.message || e).slice(0, 220); return null; });
	}

	if (err) return set({ ioState: "error", ioMsg: err, ioRows: null });
	set({ ioRows: rows || [], ioState: "done", ioRan: `${from} to ${till}` });
}

function ioExport(s) {
	const rows = ioFiltered(s);
	if (!rows.length) {
		return set({ ioMsg: "Nothing to export — generate the report first, or widen the filters." });
	}
	const cols = ["date", "time", "emp_code", "name", "log_type", "terminal", "stream", "company"];
	const csv = [cols.join(",")]
		.concat(rows.map((r) => {
			const e = s.byName[r.employee] || {};
			return [
				String(r.time || "").slice(0, 10), clock(r.time), e.employee_number || r.employee,
				e.employee_name || r.employee_name || "", r.log_type || "", r.device_id || "",
				ioStream(r), e.company || "",
			].map(cell).join(",");
		}))
		.join("\r\n");
	const name = `in-out-activity-${s.io.from || todayIso()}.csv`;
	download(name, csv);
	set({
		ioMsg: `Exported ${fmt(rows.length)} punch${rows.length === 1 ? "" : "es"} to ${name}. `
			+ "Written in the browser from what was already read — nothing was sent anywhere.",
	});
}

/** Factor HR's coloured status dot, the same control as on Employee Master —
    and here it writes the same value as the Employee Status box beside it. Two
    controls, one filter, which is what a duplicated control has to mean if it
    is not to lie. */
function IoDot({ s }) {
	const f = s.io;
	const opts = [
		["Active", "on", "Active"], ["Inactive", "off", "InActive"], ["", "all", "All"],
	];
	const cur = opts.find((o) => o[0] === f.status) || opts[2];
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="listbox" aria-label="Filter by status"
				aria-expanded={f.menu} title={"Status: " + cur[2]}
				onClick={(e) => { e.stopPropagation(); patch("io", { menu: !f.menu }); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!f.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === f.status}
						onClick={(e) => { e.stopPropagation(); patch("io", { status: o[0], menu: false }); }}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

function IoForm({ s }) {
	const f = s.io;

	function button(k) {
		if (k === "generate") return void ioGenerate();
		if (k === "refresh") {
			if (s.ioState !== "done") {
				return set({ ioMsg: "Nothing has been generated yet — Generate reads the range first." });
			}
			return void ioGenerate();
		}
		if (k === "more") return void (patch("io", { more: !f.more }), set({ ioMsg: "" }));
		if (k === "logo" || k === "nologo") {
			patch("io", { logo: k === "logo" });
			return set({
				ioMsg: "<b>Layout Options are about their PDF, not about the data.</b> This dashboard renders "
					+ "HTML and exports CSV; the Manna wordmark is already in the page chrome, and a logo on a "
					+ "CSV is not a thing. Kept because it is on their screen and somebody will look for it.",
			});
		}
		if (k === "excel") return ioExport(s);
		if (k === "excelmore") {
			return set({
				ioMsg: "Only CSV. It opens in Excel, and it is the one export format that does not need a "
					+ "library shipped to the browser.",
			});
		}
		if (k === "genmore") {
			return set({
				ioMsg: "There is no queue behind this page. In ERPNext a long report is enqueued and mailed "
					+ "when it finishes; here Generate is one read against the site and the rest is arithmetic "
					+ "in the browser.",
			});
		}
		if (k === "upload") {
			set({
				ioMsg: "<b>That button imports.</b> This page proxies GET only — see <code>app/serve.py</code>, "
					+ "where the one write allowed is a decision on an approval. Punches in particular are never "
					+ "typed in: a correction writes a missing <em>punch</em> through Attendance Regularization, "
					+ "so that the shift job stays the only thing generating Attendance.",
			});
		}
	}

	const state = s.ioState === "loading" ? "reading the site…"
		: s.ioState === "done" ? s.ioRan : "not generated";

	return (
		<section className="fhcat">
			<header>
				<h3>IN / OUT ACTIVITY REPORT</h3>
				<span className="right">
					<span className={"cov " + (s.ioState === "done" ? "live" : "part")}>{state}</span>
				</span>
			</header>

			<div className="iotop">
				<div className="iof">
					<span className="lab">Particular Employee</span>
					<span className="ctl">
						<IoDot s={s} />
						<input type="text" className="grow" placeholder="Search Employee" aria-label="Search employee"
							value={f.emp} onChange={(e) => patch("io", { emp: e.target.value })} />
						<button className="embtn" title="Import employees" onClick={() => button("upload")}>↑</button>
					</span>
				</div>

				<div className="iof">
					<span className="lab">Employee Status</span>
					<span className="ctl">
						<select value={f.status} onChange={(e) => patch("io", { status: e.target.value })}>
							{[["Active", "Active"], ["Inactive", "Inactive"], ["", "All"]]
								.map((o) => <option key={o[1]} value={o[0]}>{o[1]}</option>)}
						</select>
					</span>
				</div>

				<div className="iof">
					<span className="lab">Filter By</span>
					<span className="ctl">
						<select className="grow" value={f.by} onChange={(e) => patch("io", { by: e.target.value })}>
							{IO_BY.map((b) => <option key={b[0]} value={b[0]}>{b[1]}</option>)}
						</select>
					</span>
				</div>

				<div className="iof">
					<span className="lab">Report Period</span>
					<span className="ctl">
						<select value={f.period} onChange={(e) => patch("io", { period: e.target.value })}>
							{IO_PERIODS.map((v) => <option key={v}>{v}</option>)}
						</select>
					</span>
				</div>

				<div className="right">
					<button className="embtn" title="Export what is generated" onClick={() => button("excel")}>
						📊 Excel
					</button>
					<button className="embtn" title="Other formats" onClick={() => button("excelmore")}>▾</button>
					<button className="embtn" title="Run it again" onClick={() => button("refresh")}>↻</button>
					<button className="embtn pri" onClick={() => button("generate")}>Generate</button>
					<button className="embtn pri" title="More ways to run it" onClick={() => button("genmore")}>▾</button>
				</div>
			</div>

			<div className="iotabs">
				{[["criteria", "Report Criteria"], ["advance", "Advance"]].map((t) => (
					<button key={t[0]} className="iotab" aria-selected={f.tab === t[0]}
						onClick={() => patch("io", { tab: t[0] })}>
						{t[1]}
					</button>
				))}
			</div>

			{f.tab === "advance" ? (
				<div className="iobody">
					<Note>
						<b>The ADVANCE tab has never been opened.</b> It is on their screen and nothing behind it
						has been seen, so nothing is invented here. What our side would put on it is already on the
						criteria tab under <em>Additional Filters</em>: in / out, and which stream the punch came
						from.
					</Note>
				</div>
			) : (
				<div className="iobody">
					<div className="iorow">
						<div className="iof">
							<span className="lab">Date Range</span>
							<span className="ctl">
								<input type="date" aria-label="From date" value={f.from || todayIso()}
									onChange={(e) => patch("io", { from: e.target.value })} />
								<span className="text-ink-3">–</span>
								<input type="date" aria-label="To date" value={f.till || todayIso()}
									onChange={(e) => patch("io", { till: e.target.value })} />
							</span>
						</div>
						<div className="iof">
							<span className="lab">From Time</span>
							<span className="ctl">
								<input type="time" aria-label="From time" value={f.t1}
									onChange={(e) => patch("io", { t1: e.target.value })} />
							</span>
						</div>
						<div className="iof">
							<span className="lab">Till Time</span>
							<span className="ctl">
								<input type="time" aria-label="Till time" value={f.t2}
									onChange={(e) => patch("io", { t2: e.target.value })} />
							</span>
						</div>
					</div>

					<div className="iorow">
						<label className="chk">
							<input type="checkbox" checked={f.selfie}
								onChange={(e) => {
									patch("io", { selfie: e.target.checked });
									set({
										ioMsg: e.target.checked
											? "Nothing in Frappe HR captures a photo on punch, so the column is shown empty "
											+ "rather than dropped. Their export carried 35 images for 34 punches — the selfie "
											+ "is real, it is stored, and at 160 people it is on the order of 5 MB a day."
											: "",
									});
								}} />
							Show Selfie Images in Report
						</label>
					</div>

					<div className="iorow block">
						<span className="lab font-mono text-[.6rem] tracking-[.1em] uppercase text-ink-3">
							Layout Options
						</span>
						<div className="chipbox mt-[.3rem]">
							{f.logo ? (
								<span className="chip">
									With Logo
									<button aria-label="Remove With Logo" onClick={() => button("nologo")}>×</button>
								</span>
							) : (
								<button className="embtn" onClick={() => button("logo")}>+ With Logo</button>
							)}
						</div>
					</div>

					<div className="iorow block">
						<button className="iofun" aria-expanded={f.more} onClick={() => button("more")}>
							Additional Filters
							<svg viewBox="0 0 24 24"><path d="M3 5h18l-7 8v6l-4 2v-8Z" /></svg>
						</button>
						{f.more && (
							<div className="iorow mt-[.7rem]">
								<div className="iof">
									<span className="lab">In / Out</span>
									<span className="ctl">
										<select value={f.logtype} onChange={(e) => patch("io", { logtype: e.target.value })}>
											<option value="">All</option>
											<option>IN</option>
											<option>OUT</option>
										</select>
									</span>
								</div>
								<div className="iof">
									<span className="lab">Stream</span>
									<span className="ctl">
										<select value={f.stream} onChange={(e) => patch("io", { stream: e.target.value })}>
											<option value="">All</option>
											<option>Terminal</option>
											<option>Unknown</option>
										</select>
										<span className="hint text-[.79rem] text-ink-3">
											a punch with no terminal; the trusted prefix is still an open question
										</span>
									</span>
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{s.ioMsg && (
				<div className="px-[.9rem] pb-[.9rem]">
					<Note><Html html={s.ioMsg} /></Note>
				</div>
			)}
		</section>
	);
}

/* The generated table. Their export carries Terminal, Location, Punch Info and
   a selfie per row; ours carries the two of those four that Employee Checkin
   has a column for, and says so where the others would be. */
function IoReport({ s }) {
	const f = s.io;
	const rows = ioFiltered(s);

	if (s.ioState === "loading") {
		return (
			<div className="mt-[.9rem]">
				<Empty title="Reading the site">Every punch between {f.from} and {f.till}.</Empty>
			</div>
		);
	}
	if (s.ioState === "error") {
		return (
			<div className="mt-[.9rem]">
				<Gap><b>The site refused the read.</b> {s.ioMsg}</Gap>
			</div>
		);
	}
	if (!rows.length) {
		return (
			<div className="mt-[.9rem]">
				<Empty title="No punches in that range">
					{(s.ioRows || []).length
						? `${fmt(s.ioRows.length)} came back for ${s.ioRan} and the filters on this form removed all of them.`
						: `Employee Checkin is empty for ${s.ioRan}. It stays empty until the fingerprint bridge is `
						+ "running and the phone app is live — shown as nothing recorded rather than as 0%, because "
						+ "an empty attendance table and an empty factory produce identical numbers."}
				</Empty>
			</div>
		);
	}

	/* Group headings, emitted as the sorted list is walked. Which field heads a
	   group is Filter By first, then the Report Period — the same precedence
	   their form implies by putting the two controls side by side. */
	const keyOf = (r) => {
		if (f.by) return String(s.byName[r.employee]?.[f.by] || "—");
		if (f.period === "Employee Wise") return s.byName[r.employee]?.employee_name || r.employee;
		return String(r.time || "").slice(0, 10);
	};
	let last = null;

	return (
		<>
			<div className="legend mt-[.9rem]">
				<b className="font-display">Generated</b>
				<span className="cov live">{fmt(rows.length)} punch{rows.length === 1 ? "" : "es"}</span>
				<span>
					{s.ioRan}, {f.t1}–{f.t2}
					{f.by ? `, grouped by ${f.by}` : `, ${f.period.toLowerCase()}`}.
				</span>
				<button className="embtn ml-auto" onClick={() => ioExport(s)}>⬇ Export CSV</button>
			</div>

			{f.selfie && (
				<div className="my-[.6rem]">
					<Gap>
						<b>Show Selfie Images has nothing to show.</b> Nothing in Frappe HR captures a photo on
						punch, so the column is present and empty rather than absent. Their mobile export carried{" "}
						<b>35 images for 34 punches</b> at roughly 14 KB each — on the order of <b>5 MB a day</b> at
						160 people, which is a storage decision as much as a feature.
					</Gap>
				</div>
			)}

			<Scroll style={{ marginTop: ".6rem" }}>
				<table className="io" style={{ minWidth: 880 }}>
					<thead>
						<tr>
							<th>Date</th><th>Time</th><th>Emp code</th><th>Name</th><th>In / Out</th>
							<th>Terminal</th><th>Company</th>{f.selfie && <th>Selfie</th>}
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => {
							const e = s.byName[r.employee] || {};
							const k = keyOf(r);
							const first = k !== last;
							if (first) last = k;
							const label = !f.by && f.period !== "Employee Wise" ? `${dmy(k)}, ${dayOf(k)}` : k;
							return (
								<Fragment key={r.name}>
									{first && (
										<tr className="grp"><td colSpan={f.selfie ? 8 : 7}>{label}</td></tr>
									)}
									<tr>
										<td className="mono">{String(r.time || "").slice(0, 10)}</td>
										<td className="mono">{clock(r.time)}</td>
										<td className="mono">{e.employee_number || r.employee}</td>
										<td>{e.employee_name || r.employee_name || ""}</td>
										<td>{r.log_type || "—"}</td>
										<td className="mono">{r.device_id || "—"}</td>
										<td className="muted">{e.company || "—"}</td>
										{f.selfie && <td className="sel">no photo</td>}
									</tr>
								</Fragment>
							);
						})}
					</tbody>
				</table>
			</Scroll>
		</>
	);
}

export default function InOut() {
	const s = useApp();
	const p = todaysPunches(s);

	return (
		<>
			<div className="legend">
				<b className="font-display">In Out Activities Report</b>
				<span className={"cov " + (p.length ? "live" : "part")}>
					{p.length ? `${fmt(p.length)} today` : "nothing today"}
				</span>
				<span>
					One Factor HR report, <code>rptInOutActivitiesSelfiePunch</code>, carries both streams.
				</span>
			</div>

			<div className="mt-[.8rem]">
				<IoForm s={s} />
			</div>

			{s.ioState ? <IoReport s={s} /> : (
				<div className="mt-[.9rem]">
					<Panel title="Today's punches, before anybody asks" cov={p.length ? "live" : "part"} ico="👆">
						{p.length ? (
							<Scroll>
								<table>
									<thead>
										<tr>
											<th>Time</th><th>Emp code</th><th>Name</th><th>In / Out</th><th>Company</th>
										</tr>
									</thead>
									<tbody>
										{p.map((c) => {
											const e = s.byName[c.employee] || {};
											return (
												<tr key={c.name}>
													<td className="mono">{clock(c.time)}</td>
													<td className="mono">{e.employee_number || c.employee}</td>
													<td>{e.employee_name || ""}</td>
													<td>{c.log_type || "—"}</td>
													<td className="muted">{e.company || "—"}</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</Scroll>
						) : (
							<Empty title="No punches recorded">
								Employee Checkin is empty until the fingerprint bridge is running and the phone app is
								live. Shown as <em>nothing recorded</em> rather than as 0%, because an empty attendance
								table and an empty factory produce identical numbers.
							</Empty>
						)}
						<NoteBelow>
							Today’s punches are already loaded, so they are shown without asking.{" "}
							<b>Generate above reads any other range from the site</b> — one request, capped at{" "}
							{IO_MAXDAYS} days. <b>The bridge must never clear a device log</b>: the machine’s own
							memory is the last copy of a punch that failed to deliver.
						</NoteBelow>
					</Panel>
				</div>
			)}

			<div className="mt-[.9rem]">
				<Panel title="The two streams, column by column" cov="live" ico="↔">
					<Scroll>
						<table>
							<thead>
								<tr><th>Column</th><th>Biometric</th><th>Mobile</th></tr>
							</thead>
							<tbody>
								{FH_STREAMS.map((r) => (
									<tr key={r[0]}>
										<td className="mono">{r[0]}</td>
										<td className={r[1] === "blank" || r[1] === "none" ? "muted" : undefined}>{r[1]}</td>
										<td className={r[2] === "blank" ? "muted" : undefined}>{r[2]}</td>
									</tr>
								))}
							</tbody>
						</table>
					</Scroll>
					<NoteBelow>
						The same single-funnel design as <code>Employee Checkin</code>, which is why the mapping is
						clean. Of their four columns this report can fill <b>two</b>: Terminal, and the punch
						itself. Location and Punch Info have no column on our side yet, and <b>a{" "}
						<code>device_id</code> that does not start with the trusted prefix is a mobile punch</b> —
						geofenced — because no fingerprint machine sends a coordinate.
					</NoteBelow>
				</Panel>
			</div>

			<Cols>
				<Panel title="Selfie on punch" cov="none" ico="📸">
					<Gap>Nothing in Frappe HR captures a photo on punch.</Gap>
					<NoteBelow>
						The mobile export carried <b>35 embedded images for 34 punches</b>, roughly 14 KB each. So
						the selfie is real and it is stored — at 160 people that is on the order of <b>5 MB a
						day</b>. A gap nobody knew about until the export was read, and the reason <em>Show Selfie
						Images in Report</em> is on the form above with nothing behind it.
					</NoteBelow>
				</Panel>

				<Panel title="GPS accuracy is the useful column" cov="part" ico="📍">
					<Note>
						<code>Punch Info</code> carries accuracy (<code>Loc Acc: 22.7 m</code> in the samples) and
						the handset model. Accuracy is the more useful of the two: <b>a geofence that ignores it
						refuses honest punches made indoors.</b> Sample values sit around 20 m, which is good.
					</Note>
				</Panel>

				<Panel title="The device list is still needed" cov="none" ico="🖥">
					<Gap>
						The full list of terminals, per company, with the trusted device-id prefix each sends.
					</Gap>
					<NoteBelow>
						Only one terminal name appears in the sample — <code>Manna_Rubber_Products</code> — but that
						is one report from one company. Until the prefixes are known, the <em>Stream</em> filter
						above can only say whether a punch carries a terminal at all, which is the weaker half of
						the same rule.
					</NoteBelow>
				</Panel>
			</Cols>
		</>
	);
}
