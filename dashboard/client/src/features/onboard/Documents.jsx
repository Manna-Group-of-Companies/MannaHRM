import { useApp } from "@/store";
import { daysTo, docRows, onboardWait, scopeSaid } from "@/features/onboard/shared";
import { active } from "@/lib/scope";
import { dmy, filled, fmt } from "@/lib/format";
import { DOC_BACKFILL, EMP_DOC_FIELDS } from "@/data/onboard";
import { Cols, Empty, Html, Panel, Scroll } from "@/components/ui";
import DocumentEntry from "@/features/onboard/DocumentEntry";

import { CoverageRow } from "./shared";

export default function Documents() {
	const s = useApp();
	const rows = docRows(s);
	const total = rows.length;

	/* The expiry list is the only thing on this page that would be used daily,
	   so it is built even though it is almost certainly empty — a watch list that
	   appears only once somebody has data is a watch list nobody trusts. */
	const expiring = rows
		.filter((r) => r.valid_upto)
		.map((r) => ({ emp: r, d: daysTo(r.valid_upto) }))
		.filter((r) => r.d != null)
		.sort((a, b) => a.d - b.d);

	const waiting = onboardWait(s, "the employee records");

	return (
		<>
			{/* Their screen first, because it is what the page is. The coverage
			    panels underneath are ours and answer the question their register
			    cannot: not what has been filed, but how much of the master behind
			    it is filled in. */}
			<DocumentEntry />

			<Cols>

				<Panel
					title="What the Employee record already holds"
					cov={s.docErr ? "none" : total ? "part" : "none"}
					ico="🗃"
				>
					{waiting || (s.docErr ? (
						<div className="gap">
							<b>Could not read the employee documents.</b> {s.docErr}
						</div>
					) : total ? (
						<>
							<div className="rows">
								{EMP_DOC_FIELDS.map((f) => (
									<CoverageRow key={f[0]} label={f[1]} n={filled(rows, f[0])} total={total} />
								))}
								{s.docTier === "full"
									? DOC_BACKFILL.map((f) => (
											<CoverageRow key={f[0]} label={<Html html={f[1]} />}
												n={filled(rows, f[0])} total={total} />
										))
									: DOC_BACKFILL.map((f) => (
											<div className="row" key={f[0]}>
												<span>
													<Html html={f[1]} />{" "}
													<span className="muted">Factor HR export, 25 Aug</span>
												</span>
												<span className="val">{fmt(f[2])} of 504</span>
											</div>
										))}
							</div>
						</>
					) : (
						<Empty title="No employees read yet">
							The document coverage is counted off the Employee master, which has not answered.
						</Empty>
					))}
				</Panel>
			</Cols>

			<Cols>
				<Panel title="Expiry watch" cov={expiring.length ? "part" : "none"} ico="⏳">
					{onboardWait(s, "the document dates") || (expiring.length ? (
						<Scroll>
							<table>
								<thead>
									<tr>
										<th>Employee</th><th>Code</th><th>Company</th>
										<th>Document</th><th>Expires</th><th>Days</th>
									</tr>
								</thead>
								<tbody>
									{expiring.slice(0, 60).map(({ emp: r, d: days }) => {
										const d = days;
										return (
											<tr key={r.name}>
												<td>{r.employee_name || r.name}</td>
												<td className="mono">{r.employee_number || "—"}</td>
												<td>{r.company || "—"}</td>
												<td>Passport {r.passport_number || ""}</td>
												<td className="mono">{dmy(r.valid_upto)}</td>
												<td className="mono">
													<span className={"cov " + (d < 0 ? "none" : d < 90 ? "part" : "live")}>
														{d < 0 ? `expired ${Math.abs(d)}d` : `${d}d`}
													</span>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</Scroll>
					) : (
						<Empty title="Nothing has an expiry date recorded">
							Not one active employee carries a passport validity, so there is nothing to watch.
							That is the finding, not a failure — it says document expiry is not tracked anywhere
							today.
						</Empty>
					))}
				</Panel>
			</Cols>

		</>
	);
}
