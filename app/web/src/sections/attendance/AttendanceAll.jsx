import { ATT_PAGES } from "@/data/attendance";
import { COV_LABEL } from "@/data/sections";
import { Cols, Gap, Html, Legend, NoteBelow, Panel, Scroll, Tile, Tiles } from "@/components/ui";
import { fmt } from "@/lib/format";
import { active } from "@/lib/scope";
import { set, useApp } from "@/state/store";
import AttReports from "./AttReports";

/* Attendance → All: the module index. Factor HR's own menu, item for item, with
   what stands behind each item here — and the two engines underneath it that
   have no menu item on either side because they are configuration rather than
   screens. */
export default function AttendanceAll() {
	const s = useApp();
	const a = active(s);
	const shifted = a.filter((e) => e.default_shift).length;
	const pend = (s.approvals.attendance || []).length;
	const shiftTypes = s.counts.shift || 0;
	const attRows = s.counts.attendance || 0;

	return (
		<>
			<Legend
				title="Attendance — All"
				states={[
					["live", "built and running on real data"],
					["part", "stock, waiting on a decision or a load"],
					["none", "exists in Factor HR, not here"],
				]}
			/>

			<Cols>
				<Panel title="Where Attendance stands" cov="part" ico="🧭">
					<Tiles>
						<Tile k="Active people" n={fmt(a.length)} />
						<Tile k="With a shift" n={fmt(shifted)} cls={shifted ? "warn" : "bad"} s={"of " + fmt(a.length)} />
						<Tile k="Shift Types" n={fmt(shiftTypes)} cls={shiftTypes ? "warn" : "bad"} s="of 23 in Factor HR" />
						<Tile k="Punches today" n={fmt(s.checkins.length)} cls={s.checkins.length ? "good" : "bad"} />
						<Tile k="Attendance rows" n={fmt(attRows)} cls={attRows ? "good" : "bad"} s="generated, never written" />
						<Tile k="Corrections pending" n={fmt(pend)} s="the queue is live" />
					</Tiles>
					<NoteBelow>
						Counted {s.company ? <>for <b>{s.company}</b></> : "across the group"}.{" "}
						<b>Every page on this menu descends from the second tile.</b> Somebody with no shift has
						nothing for a punch to be measured against, so no attendance is generated for them, so
						they are missing from the daily report, from the monthly grid, and from anything payroll
						reads — silently, and without an error anywhere.
					</NoteBelow>
				</Panel>
			</Cols>

			<Panel title="The seven pages" cov="part" ico="🗂">
				<Scroll>
					<table style={{ minWidth: 880 }}>
						<thead>
							<tr>
								<th>Factor HR page</th>
								<th>What stands behind it here</th>
								<th>State</th>
								<th>Note</th>
							</tr>
						</thead>
						<tbody>
							{ATT_PAGES.map((p) => (
								<tr key={p[0]}>
									<td>
										{/* Their menu item, as the control it is on their side: it opens the page. */}
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
					<b>The menu is Factor HR’s own, item for item and in its order.</b> What sits underneath
					each item has not been seen, so nothing here claims to be a copy of their screen. Where a
					page below lists columns, they come from an export we hold; where it shows a shape, the
					shape is ours and says so.
				</NoteBelow>
			</Panel>

			<Cols>
				<Panel title="Attendance policy" cov="none" ico="⚖">
					<Gap>
						Late and early forgiveness counts, deduction target, overtime rules, session mode, grace
						periods.
					</Gap>
					<NoteBelow>
						The engine Frappe HR has no equivalent for, and the single item deciding whether the
						custom build is a week or two months. It has no menu item of its own in Factor HR because
						it is configuration rather than a screen — but four columns of the daily report and every
						cell of the monthly grid are its outputs.
					</NoteBelow>
				</Panel>

				<Panel title="Planned overtime" cov="none" ico="⏭">
					<Gap>Plant managers select tomorrow’s overtime today, per employee.</Gap>
					<NoteBelow>
						<b>Newly identified, 23 Aug.</b> Frappe HR measures overtime backwards from punches; it
						has nothing that records an intention beforehand. Needs its own doctype and a narrow
						plant-manager screen. No menu item in Factor HR either, which is why it sits here rather
						than on a page of its own.
					</NoteBelow>
				</Panel>
			</Cols>

			<AttReports />
		</>
	);
}
