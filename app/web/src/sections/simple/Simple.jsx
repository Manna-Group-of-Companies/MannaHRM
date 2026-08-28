import { Cols, Gap, NoteBelow, Panel } from "@/components/ui";

/** A module with no page behind it. It is drawn as a page rather than left off
    the nav: a menu item that vanishes is an oversight, and these are decisions. */
export default function Simple({ title, gap, note, cov }) {
	return (
		<Cols>
			<Panel title={title} cov={cov || "none"} ico="▪">
				<Gap>{gap}</Gap>
				{note ? <NoteBelow>{note}</NoteBelow> : null}
			</Panel>
		</Cols>
	);
}
