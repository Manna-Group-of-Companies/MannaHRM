import AssignEntry from "@/features/onboard/AssignEntry";

/* Their screen and nothing else.

   This page carried two panels of ours underneath it — Issued to employees,
   which counted who was holding what across everybody, and Movement history,
   a list of the last twenty-five Asset Movements. Both were removed on 3 Sep
   2026. Neither was on Factor HR's screen, and this page is a comparison
   against that screen: the custodian counts belong with the register on Assets
   Details, and a movement list with no asset, no person and no direction on it
   was a list of document names and dates.

   What they said that is worth not losing is in the legend below: in ERPNext an
   assignment is the asset's `custodian`, moved by an `Asset Movement`, so the
   register and the assignment are one record rather than two lists to
   reconcile. */

export default function AssetAssign() {
	return (
		<>
			<div className="legend">
				<b className="font-display">Assets Assignment</b>
				<span className="cov part">Photographed 3 Sep 2026</span>
				<span>
					Their screen, and it is <b>one person at a time</b> — the employee bar, the ASSETS table
					of what they are holding, and a fifteen-box form for one handover. Drawn below, box for
					box. In ERPNext this is the asset’s <code>custodian</code>, moved by an{" "}
					<code>Asset Movement</code>, so the register and the assignment are one record rather
					than two lists to reconcile.
				</span>
			</div>

			<AssignEntry />
		</>
	);
}
