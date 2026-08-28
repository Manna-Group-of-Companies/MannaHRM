import { Bars, Cols, Empty, NoteBelow, Panel, Scroll, SpecTable, Tile, Tiles } from "@/components/ui";
import { dmy, fmt, tally } from "@/lib/format";
import { useApp } from "@/state/store";
import { assetRows, assetsUnread, onboardWait } from "./shared";

const FREE = [
	["Asset Category", "Depreciation rules, accounts, finance book", "stock",
		"Load this before the assets themselves"],
	["Asset", "One physical thing: name, code, cost, location, custodian, status", "stock",
		"Draft &rarr; Submitted &rarr; In Use / Issued / Scrapped / Sold"],
	["Location", "Where an asset sits", "stock",
		"Plant, office, store. Not the same as Work Location, which is a geofence for punches"],
	["Asset Movement", "Every issue, transfer and return, dated", "stock",
		"This is the audit trail Assets Assignment reads from"],
	["Asset Repair", "Downtime, cost, who fixed it", "stock", ""],
	["Asset value adjustment, depreciation", "Scheduled", "stock",
		"Accounting rather than HR. It runs whether HR wants it or not once an asset is submitted"],
];

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

			<Cols>
				<Panel title="What ERPNext gives without building anything" cov="part" ico="🧰">
					<SpecTable cols={["Doctype", "What it holds", "State", "Note"]} list={FREE} />
					<NoteBelow>
						<b>Mostly free, and that is the point.</b> Assets is the cheapest of the four On Board
						groups to match: it is configuration and a data load, not code. What it needs is the
						list of what Manna actually issues — and the categories, before the rows.
					</NoteBelow>
				</Panel>
			</Cols>
		</>
	);
}
