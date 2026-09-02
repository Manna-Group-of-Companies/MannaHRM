import { SUBTABS } from "@/routes/registry";
import { COV_LABEL, SECTIONS } from "@/data/sections";

import { Scroll } from "@/components/ui";

/* Ours, not Factor HR's. The comparison is the whole point of this page, so it
   deserves stating outright somewhere rather than only being implied by badges
   scattered across nine screens — and it is the one view that shows which of
   their menus nobody has looked at yet. */
export default function Coverage() {
	const n = (k) => SECTIONS.filter((s) => s.cov === k).length;
	return (
		<>
			<div className="legend">
				<b className="font-display">Module coverage</b>
				<span>
					{n("live")} live · {n("part")} partial · {n("none")} not built · {n("skip")} deferred
				</span>
			</div>

			<Scroll>
				<table>
					<thead>
						<tr>
							<th>Factor HR module</th>
							<th>Here</th>
							<th>Pages captured</th>
						</tr>
					</thead>
					<tbody>
						{SECTIONS.map((s) => (
							<tr key={s.key}>
								<td>{s.label}</td>
								<td>
									<span className={"cov " + s.cov}>{COV_LABEL[s.cov]}</span>
								</td>
								<td className="muted">
									{SUBTABS[s.key] ? (
										SUBTABS[s.key].map((t) => t[1]).join(" · ")
									) : (
										<span className="tag warn">menu not captured</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>

		</>
	);
}
