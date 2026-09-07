import { Cols, Gap, Panel } from "@/components/ui";

/** A module with no page behind it. It is drawn as a page rather than left off
    the nav: a menu item that vanishes is an oversight, and these are decisions. */
export default function Simple({ title, gap, cov }) {
	return (
		<Cols>
			<Panel title={title} cov={cov || "none"} ico="▪">
				<Gap>{gap}</Gap>
			</Panel>
		</Cols>
	);
}
