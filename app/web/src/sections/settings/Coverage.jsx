import { SECTIONS, COV_LABEL } from "@/data/sections";
import { SUBTABS } from "@/App";
import { Cols, Gap, Note, NoteBelow, Panel, Scroll } from "@/components/ui";

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

			<Cols>
				<Panel title="What is missing from this comparison" cov="none" ico="📷">
					<Gap>The second-level menus for Loans and Survey.</Gap>
					<NoteBelow>
						Every page here came from <code>docs/FACTOHR_SCREENS.md</code> (screenshots of the live
						tenant) or <code>docs/FACTOHR_DATA.md</code> (the nine exports).{" "}
						<b>Loans and Survey appear in neither</b>, so their sub-menus are unknown, and are shown
						as unknown rather than guessed at. A screenshot of each menu is all it takes.
					</NoteBelow>
				</Panel>

				<Panel title="Employees is built from the export, not the menu" cov="part" ico="⚠">
					<Note>
						Worth being exact about. The four Employees pages come from the{" "}
						<b>employee master export</b>, not from a screenshot of Factor HR’s Employees menu.
						They are the right questions asked of real data — enrolment gaps, the company mismatch,
						missing reporting lines — but they are <b>not a claim about what that menu contains</b>.
						If it holds screens beyond a directory, nobody here has seen them.
					</Note>
				</Panel>
			</Cols>
		</>
	);
}
