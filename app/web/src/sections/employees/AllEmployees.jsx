
import { useApp } from "@/state/store";
import { active, scoped } from "@/lib/scope";
import { fmt, tally } from "@/lib/format";
import { Bars, Cols, NoteBelow, Panel, Tile, Tiles } from "@/components/ui";

export default function AllEmployees() {
	const s = useApp();
	const all = scoped(s);
	const st = tally(all, "status");
	const act = all.filter((e) => e.status === "Active").length;

	return (
		<>
			<div className="legend">
				<b className="font-display">All</b>
				<span className="cov part">Partial</span>
				<span>Everybody on the site, and the 344 who are not.</span>
			</div>

			<Cols>
				<Panel title="Loaded here" cov="live" ico="👥">
					<Tiles>
						<Tile k="On the site" n={fmt(all.length)} s="every status" />
						<Tile k="Active" n={fmt(act)} cls="good" />
						<Tile k="Not active" n={fmt(all.length - act)} cls={all.length - act ? "warn" : ""}
							s="left, suspended or inactive" />
					</Tiles>
					{st.length > 1 && (
						<div className="mt-[.7rem]">
							<Bars pairs={st} />
						</div>
					)}
					<NoteBelow>
						The searchable list is on <b>Employee Master</b>. This page is about what is <em>not</em>{" "}
						in it.
					</NoteBelow>
				</Panel>

			</Cols>
		</>
	);
}
