import { Cols, NoteBelow, Panel, Tile, Tiles } from "@/components/ui";

export default function FnF() {
	return (
		<Cols>
			<Panel title="Full & Final Summary · Mar-25" cov="skip" ico="🚪">
				<Tiles>
					<Tile k="F&F Processed" n="0" />
					<Tile k="On Notice" n="0" />
					<Tile k="Exit Clearance Pending" n="0" />
				</Tiles>
				<NoteBelow>
					All zero in Factor HR. <b>344 people have left</b> over the years, so the exit process
					plainly happens — it is just not recorded through this screen.
				</NoteBelow>
			</Panel>
		</Cols>
	);
}
