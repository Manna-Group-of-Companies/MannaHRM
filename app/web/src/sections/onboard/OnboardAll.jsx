import { COV_LABEL } from "@/data/sections";
import { ONBOARD_PAGES } from "@/data/onboard";
import { Cols, Html, Legend, NoteBelow, Panel, Scroll, SpecTable, Tile, Tiles } from "@/components/ui";
import { fmt } from "@/lib/format";
import { set, useApp } from "@/state/store";
import { assetRows, scopeSaid } from "./shared";

const OPEN = [
	["Is Document Entry used at all?", "Nothing has been entered here and the screen has never been opened",
		"build", "If it is empty over there too, it is a decision not to build rather than a gap"],
	["Does anybody chase document expiry today?", "It is the only part ERPNext cannot already do",
		"build", "A reminder off a date field is free; the register under it is a day"],
	["Is there an asset register anywhere?", "Spreadsheet, Factor HR, or nothing",
		"build", "Decides whether Assets is a load or a fresh start"],
	["Are assets signed for on issue?", "No stock doctype records that the employee agreed",
		"build", "And whether unreturned assets are deducted on separation"],
	["Do letters need approving before issue?",
		"Factor HR carries a Letter Assignment queue and it reads 0",
		"build", "One letter in three years suggests not, but it is theirs to say"],
	["Which of the 17 formats matter?", "Nine are statutory PF forms with fixed layouts",
		"build", "Reproduce exactly or not at all &mdash; a different job from the six HR letters"],
];

export default function OnboardAll() {
	const s = useApp();
	const rows = assetRows(s);
	const unread = s.onboardBusy || s.assetErr;

	return (
		<>
			<Legend
				title="On Board — All"
				states={[
					["live", "built and running on real data"],
					["part", "stock and waiting on a decision or a load"],
					["none", "exists in Factor HR, not here"],
					["skip", "empty on both sides"],
				]}
			/>

			<Cols>
				<Panel title="Where On Board stands" cov="part" ico="🧭">
					<Tiles>
						<Tile k="Candidates" n="0" s="empty in Factor HR too" />
						<Tile k="Letter formats" n={fmt(s.letterTypes.length)} cls="good" s="of 17" />
						<Tile k="Letters issued" n={fmt(s.letters.length)} s="one in three years" />
						<Tile k="Documents" n="0" cls="bad" s="no register either side" />
						<Tile k="Assets" n={unread ? "—" : fmt(rows.length)} s="registered in ERPNext" />
						<Tile k="Assigned" n={unread ? "—" : fmt(rows.filter((a) => a.custodian).length)}
							s="named custodian" />
					</Tiles>
					<NoteBelow>
						Counted{scopeSaid(s)}. Letters are the only part of On Board doing real work today;
						documents are the only part with nothing behind it at all.
					</NoteBelow>
				</Panel>
			</Cols>

			<Panel title="The five pages" cov="part" ico="🗂">
				<Scroll>
					<table style={{ minWidth: 820 }}>
						<thead>
							<tr>
								<th>Factor HR page</th>
								<th>What stands behind it here</th>
								<th>State</th>
								<th>Note</th>
							</tr>
						</thead>
						<tbody>
							{ONBOARD_PAGES.map((p) => (
								<tr key={p[0]}>
									<td>
										{/* The All page lists the module's own menu, so a line on it
										    is a way in. */}
										<button className="gbtn" onClick={() => set({ subtab: p[1] })}>{p[0]}</button>
									</td>
									<td className="muted" style={{ whiteSpace: "normal" }}>
										<Html html={p[2]} />
									</td>
									<td>
										<span className={"cov " + p[3]}>{COV_LABEL[p[3]]}</span>
									</td>
									<td className="muted" style={{ whiteSpace: "normal", minWidth: 280 }}>
										<Html html={p[4]} />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</Scroll>
				<NoteBelow>
					<b>Only one of the five has ever been screenshotted in Factor HR.</b> Create Letter / Form
					was read on 25 Aug 2026; the other four are known from the menu and nothing more.
					Everything above is therefore a reading of <em>our</em> site against a menu, and the gap
					list below is what would close it.
				</NoteBelow>
			</Panel>

			<Cols>
				<Panel title="What On Board still needs answering" cov="none" ico="❓">
					<SpecTable cols={["Question", "Why it decides something", "State", "Note"]} list={OPEN} />
					<NoteBelow>
						None of these is code. All six are one conversation, and four of them decide whether
						anything gets built at all.
					</NoteBelow>
				</Panel>
			</Cols>
		</>
	);
}
