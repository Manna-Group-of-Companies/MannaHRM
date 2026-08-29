import { useApp } from "@/state/store";
import { daysTo, docRows, onboardWait, scopeSaid } from "@/sections/onboard/shared";
import { active } from "@/lib/scope";
import { dmy, filled, fmt } from "@/lib/format";
import { DOC_BACKFILL, EMP_DOC_FIELDS } from "@/data/onboard";
import { Cols, Empty, Html, NoteBelow, Panel, Scroll } from "@/components/ui";

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
			<div className="legend">
				<b className="font-display">Document Entry</b>
				<span className="cov none">Never screenshotted</span>
				<span>
					Factor HR groups this as Document Management — Document Type and Document Entry. Nobody has
					opened either screen, so what it holds over there is a question, not a spec.
				</span>
			</div>

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
							<NoteBelow>
								Counted over <b>{fmt(total)} active employees</b>
								{scopeSaid(s)}.{" "}
								{s.docTier === "full"
									? "The seven custom fields are read live."
									: "The custom fields did not answer, so the seven backfilled counts are shown as read from the Factor HR export on 25 Aug 2026 — against all 504 exported rows, not the active list."}{" "}
								Four of them came back empty because they are <b>empty in Factor HR</b>: father,
								mother, spouse and religion are populated for 0 of 504.
							</NoteBelow>
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
