import { useApp } from "@/state/store";
import { active } from "@/lib/scope";
import { fmt, tally, tidyDept } from "@/lib/format";
import { Bars, Cols, Note, Panel, Tile, Tiles } from "@/components/ui";

/* Reporting Manager decides who approves a correction, so a blank one is not a
   tidiness problem — it is a request with nowhere to go. */
export default function Reporting() {
	const s = useApp();
	const a = active(s);
	const none = a.filter((e) => !e.reports_to);
	const mgrs = new Set(a.filter((e) => e.reports_to).map((e) => e.reports_to));

	return (
		<Cols>
			<Panel title="Reporting lines" cov="live" ico="🗂">
				<Tiles>
					<Tile k="Active" n={fmt(a.length)} />
					<Tile k="Have a manager" n={fmt(a.length - none.length)} cls="good" />
					<Tile k="No manager" n={fmt(none.length)} cls={none.length ? "warn" : "good"}
						s="nobody to approve for them" />
					<Tile k="Distinct managers" n={fmt(mgrs.size)} />
				</Tiles>
				{none.length > 0 && (
					<div className="mt-[.7rem]">
						<Bars pairs={tally(none, "company")} />
					</div>
				)}
			</Panel>

			<Panel title="Why a blank matters" cov="part" ico="⚙">
				<Note>
					Six active employees had <b>no Reporting Manager</b> in the Factor HR master. That field
					decides who approves their attendance corrections, so a blank is not untidiness — it is a
					correction request with nowhere to go, on the system that decides what somebody is paid.
				</Note>
			</Panel>

			<Panel title="Departments are concentrated" cov="live" ico="📈">
				<Note>
					<b>Production is 120 of 160 (75%)</b>, then Maintenance 8, Finance &amp; Accounts 7,
					Logistics 7. Fifteen departments in use against the <b>53 already sitting in ERPNext</b> —
					worth pruning rather than mapping onto.
				</Note>
				<div className="mt-[.7rem]">
					<Bars pairs={tally(a, "department").slice(0, 8).map((r) => [tidyDept(r[0]), r[1]])} />
				</div>
			</Panel>
		</Cols>
	);
}
