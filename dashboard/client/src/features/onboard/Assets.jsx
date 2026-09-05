import AssetEntry from "@/features/onboard/AssetEntry";

/* Their screen and nothing else.

   This page carried two panels and a table of ours underneath the form — Asset
   register, which counted the rows and totalled what they cost, Categories,
   which grouped them, and a two-hundred-row listing of the register itself.
   All three were removed on 3 Sep 2026, the same day the two panels came off
   Assets Assignment, and for the same reason: none of them is on Factor HR's
   screen, and this page is a comparison against that screen.

   The register has not gone anywhere. It is behind the form's own Search, which
   is where Factor HR keeps it too — their Assets Details is one asset at a time
   and the list is a control on it, not a second screen under it. */

export default function Assets() {
	return (
		<>
			<div className="legend">
				<b className="font-display">Assets Details</b>
				<span className="cov part">Photographed 3 Sep 2026</span>
				<span>
					Factor HR’s screen, and it is a <b>record form</b> rather than a register — thirteen boxes,
					one asset at a time, with the list behind Search. Drawn below, box for box. Read off
					ERPNext’s own <code>Asset</code>, which is installed and free.
				</span>
			</div>

			<AssetEntry />
		</>
	);
}
