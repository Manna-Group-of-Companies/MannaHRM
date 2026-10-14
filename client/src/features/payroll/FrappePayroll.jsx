/** Payroll → Frappe Payroll: the stock hrms payroll this site already runs.
 *
 *  A map rather than a form. Every doctype hrms pays people through, how many
 *  of each the site holds for this login, the latest runs and slips, and the
 *  way into each on the desk — see data/frappepayroll.js for why these and in
 *  this order. **It writes nothing.** Payroll is run where hrms runs it, and a
 *  second place to submit a salary slip from is a second set of rules to keep
 *  in step with the first.
 */

import { useEffect, useState } from "react";
import { useApp } from "@/store";
import { loadFrappePayroll } from "@/api/frappepayroll";
import { FRAPPE_PAYROLL, FRAPPE_PAYROLL_REPORTS, docState } from "@/data/frappepayroll";
import { deskUrl } from "@/lib/desk";
import { MON, dmy, fmt, lastOfMonth } from "@/lib/format";
import { Cols, Desk, Empty, Panel, Scroll } from "@/components/ui";
import Link from "@/routes/Link";

const money = (n) => (n == null || n === "" ? "—" : "₹" + fmt(Math.round(Number(n))));

/** A pay period as people say it. Nearly every run is a calendar month, and
    "01-Aug-2026 – 31-Aug-2026" in a half-width table pushed the State column
    out of sight; anything that is not a whole month keeps both dates. */
export function periodText(start, end) {
	const a = String(start || "").slice(0, 10);
	const b = String(end || "").slice(0, 10);
	const ym = a.slice(0, 7);
	if (a && a.endsWith("-01") && b === lastOfMonth(ym)) return `${MON[Number(a.slice(5, 7)) - 1]} ${a.slice(0, 4)}`;
	return `${dmy(a)} – ${dmy(b)}`;
}

/** A card that opens its doctype's list on the desk — the whole card, so the
    target is the size of the thing being pointed at. Without a site to point
    at it is the same card, not a link. */
function DocCard({ site, dt, n, groupWide }) {
	const body = (
		<>
			<span className="fptop">
				<b>{dt}</b>
				<span className="fpn" aria-label={`${dt}: ${n === undefined ? "reading" : n == null ? "not counted" : n}`}>
					{n === undefined ? "…" : n == null ? "—" : fmt(n)}
				</span>
			</span>
			{n === null ? <span className="fpnote">The site would not count these for this login.</span>
				: groupWide ? <span className="fpnote">Every company — this one has no company field.</span> : null}
		</>
	);
	return site ? (
		<a className="fpcard" href={deskUrl(site, dt)} target="_blank" rel="noreferrer"
			title={`Open the ${dt} list in Frappe`}>
			{body}
		</a>
	) : <div className="fpcard">{body}</div>;
}

export default function FrappePayroll() {
	const s = useApp();
	const { company, site } = s;
	const [data, setData] = useState(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let live = true;
		setData(null);
		loadFrappePayroll(company).then((d) => { if (live) setData(d); });
		return () => { live = false; };
	}, [company]);

	const refresh = async () => {
		setBusy(true);
		const d = await loadFrappePayroll(company, { fresh: true });
		setData(d);
		setBusy(false);
	};

	const runs = data ? data.runs : undefined;
	const slips = data ? data.slips : undefined;

	return (
		<>
			<div className="emhead">
				<h2>Frappe Payroll</h2>
				<span className="n">
					{company || "all companies"}
				</span>
				<span className="right">
					<button type="button" className="embtn" disabled={busy || !data} onClick={() => void refresh()}>
						{busy ? "Reading…" : "Refresh"}
					</button>
					<Desk className="embtn pri" href={site && `${site}/app/payroll`}
						label="Open Payroll in Frappe" title="hrms' own Payroll workspace, on the desk">
						Open in Frappe
					</Desk>
				</span>
			</div>

			{FRAPPE_PAYROLL.map((g) => (
				<section className="fpgroup" key={g.title} aria-label={g.title}>
					<h3>{g.title}</h3>
					<div className="fpgrid">
						{g.rows.map(([dt, , byCo]) => (
							<DocCard key={dt} site={site} dt={dt}
								n={data ? data.counts[dt] : undefined} groupWide={Boolean(company) && !byCo} />
						))}
					</div>
				</section>
			))}

			<Cols>
				<Panel title="Latest payroll runs" ico="🗓">
					{runs === undefined ? <p className="muted">Reading…</p>
						: runs === null ? <Empty title="The site would not list payroll runs">This login cannot read Payroll Entry.</Empty>
						: runs.length === 0 ? (
							<Empty title="No payroll has been run yet">
								Start one from <Link section="payroll" subtab="process">Salary Process</Link>, or
								as a Payroll Entry in Frappe.
							</Empty>
						) : (
							<Scroll>
								<table className="fptable">
									<thead><tr><th>Run</th><th>Company</th><th>Period</th><th>State</th></tr></thead>
									<tbody>
										{runs.map((r) => (
											<tr key={r.name}>
												<td>{site ? <a href={deskUrl(site, "Payroll Entry", r.name)} target="_blank" rel="noreferrer">{r.name}</a> : r.name}</td>
												<td>{r.company || "—"}</td>
												<td className="mono">{periodText(r.start_date, r.end_date)}</td>
												<td><span className={"fpstate " + docState(r).toLowerCase()}>{docState(r)}</span></td>
											</tr>
										))}
									</tbody>
								</table>
							</Scroll>
						)}
				</Panel>

				<Panel title="Latest salary slips" ico="🧾">
					{slips === undefined ? <p className="muted">Reading…</p>
						: slips === null ? <Empty title="The site would not list salary slips">This login cannot read Salary Slip.</Empty>
						: slips.length === 0 ? (
							<Empty title="No salary slips yet">
								A payroll run makes them — one for each person in it.
							</Empty>
						) : (
							<Scroll>
								<table className="fptable">
									<thead><tr><th>Employee</th><th>Period</th><th>Gross</th><th>Net</th><th>State</th></tr></thead>
									<tbody>
										{slips.map((r) => (
											<tr key={r.name}>
												<td>{site
													? <a href={deskUrl(site, "Salary Slip", r.name)} target="_blank" rel="noreferrer">{r.employee_name || r.employee}</a>
													: (r.employee_name || r.employee)}</td>
												<td className="mono">{periodText(r.start_date, r.end_date)}</td>
												<td className="num">{money(r.gross_pay)}</td>
												<td className="num">{money(r.net_pay)}</td>
												<td><span className={"fpstate " + docState(r).toLowerCase()}>{docState(r)}</span></td>
											</tr>
										))}
									</tbody>
								</table>
							</Scroll>
						)}
				</Panel>
			</Cols>

			<Panel title="Payroll reports in Frappe" ico="📊">
				<ul className="fpreports">
					{FRAPPE_PAYROLL_REPORTS.map(([name]) => (
						<li key={name}>
							{site
								? <a href={`${site}/app/query-report/${encodeURIComponent(name)}`} target="_blank" rel="noreferrer">{name}</a>
								: <b>{name}</b>}
						</li>
					))}
				</ul>
			</Panel>
		</>
	);
}
