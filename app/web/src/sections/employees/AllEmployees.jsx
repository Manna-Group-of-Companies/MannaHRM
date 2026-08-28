import { FH_HEADCOUNT } from "@/data/attendance";
import { Bars, Cols, Gap, Note, NoteBelow, Panel, Tile, Tiles } from "@/components/ui";
import { fmt, tally } from "@/lib/format";
import { scoped } from "@/lib/scope";
import { useApp } from "@/state/store";

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

				<Panel title="Factor HR, 23 Aug 2026" cov="part" ico="✓">
					<div className="rows">
						{FH_HEADCOUNT.map((r) => (
							<div className="row" key={r[0]}>
								<span>{r[0]}</span>
								<span className="val">{fmt(r[1])}</span>
							</div>
						))}
					</div>
					<NoteBelow>
						<b>The active count reconciles exactly</b> — 160 there, {fmt(act)} here. The employee
						master export was complete and current and nothing was missed. Factor HR bills per
						licensed head at that same 160; ERPNext does not charge per employee at all.
					</NoteBelow>
				</Panel>

				<Panel title="The 344 leavers were skipped" cov="none" ico="🗄">
					<Gap>
						Every employee who has left — their service dates, their exit records, and whatever was
						settled with them.
					</Gap>
					<NoteBelow>
						<b>A decision rather than an oversight.</b> They were left out so the load would
						reconcile against the live headcount instead of hiding a discrepancy inside a table five
						times the size. What brings them across is a use: a service certificate somebody asks
						for, a PF query, an F&amp;F reopened. Until one is named,{" "}
						<b>the export sits in Factor HR and nothing is lost</b> — that tenant is still there.
					</NoteBelow>
				</Panel>

				<Panel title="Deciding it properly" cov="part" ico="❓">
					<Note>
						Two questions settle this and both are for Manna rather than for the build.{" "}
						<b>How long must a leaver’s record stay reachable</b> — statutory retention for PF and
						gratuity is measured in years. And <b>how long does Factor HR stay paid for</b>: an
						archive that lives only in a tenant nobody is renewing is not an archive. Whether the
						sales system’s <code>Attendance Log</code> history migrates is the same question in a
						different place, and also still open.
					</Note>
				</Panel>
			</Cols>
		</>
	);
}
