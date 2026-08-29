import { useApp } from "@/state/store";
import { assetRows, assetsUnread, onboardWait } from "@/sections/onboard/shared";
import { dmy, fmt, tally } from "@/lib/format";
import { Bars, Cols, Empty, Panel, Scroll, Tile, Tiles } from "@/components/ui";

export default function Assets() {
	const s = useApp();
	const rows = assetRows(s);
	const byCat = tally(rows, "asset_category");
	const byStatus = tally(rows, "status");
	const value = rows.reduce((n, a) => n + (Number(a.gross_purchase_amount) || 0), 0);

	return (
		<>
			<div className="legend">
				<b className="font-display">Assets Details</b>
				<span className="cov none">Never screenshotted</span>
				<span>
					Factor HR’s asset register. Read here off ERPNext’s own <code>Asset</code>, which is
					installed and free.
				</span>
			</div>

			<Cols>
				<Panel title="Asset register" cov={s.assetErr ? "none" : rows.length ? "live" : "part"} ico="💼">
					{assetsUnread(s, "asset register") || (rows.length ? (
						<>
							<Tiles>
								<Tile k="Assets" n={fmt(rows.length)} />
								<Tile k="Categories" n={fmt(byCat.length)} />
								<Tile k="In use" n={fmt(rows.filter((a) => a.status === "In Use").length)} cls="good" />
								<Tile k="Gross value" n={value ? "₹" + fmt(Math.round(value)) : "—"} s="at purchase" />
							</Tiles>
							<div className="mt-[.7rem]">
								<Bars pairs={byStatus} />
							</div>
						</>
					) : (
						<Empty title="The register is empty">
							ERPNext’s Asset doctype is installed and holds no rows. Nothing has been loaded, on
							either side — Factor HR’s Assets Details has never been opened, so whether it holds
							anything is unknown.
						</Empty>
					))}
				</Panel>

				<Panel title="Categories" cov={rows.length ? "live" : "part"} ico="🏷">
					{onboardWait(s, "the asset categories") || (rows.length ? (
						<Bars pairs={byCat} />
					) : (
						<Empty title="Nothing to group">
							Asset Category is the master to load first: it decides depreciation, and Factor HR’s
							equivalent list is the one thing worth exporting before the tenant is switched off.
						</Empty>
					))}
				</Panel>
			</Cols>

			{rows.length > 0 && (
				<Scroll>
					<table>
						<thead>
							<tr>
								<th>Asset</th><th>Code</th><th>Category</th><th>Company</th>
								<th>Location</th><th>Status</th><th>Purchased</th><th>Value</th>
							</tr>
						</thead>
						<tbody>
							{rows.slice(0, 200).map((a) => (
								<tr key={a.name}>
									<td>{a.asset_name || a.name}</td>
									<td className="mono">{a.name}</td>
									<td>{a.asset_category || "—"}</td>
									<td>{a.company || "—"}</td>
									<td>{a.location || "—"}</td>
									<td>{a.status || "—"}</td>
									<td className="mono">{dmy(a.purchase_date)}</td>
									<td className="mono">
										{a.gross_purchase_amount ? fmt(a.gross_purchase_amount) : "—"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</Scroll>
			)}

		</>
	);
}
