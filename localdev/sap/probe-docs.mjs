// Read-only: the purchase-flow probe's documents in a SAP test company - every document whose
// Reference2 starts with the probe's stamp prefix (ZT), with its lines as SAP stored them.
//
//     node localdev/sap/probe-docs.mjs                 HITECH_RUBBER
//     node localdev/sap/probe-docs.mjs SOME_TEST_DB

import { loadConfig, SapSession } from "./sapguard.mjs";

const cfg = loadConfig();
const db = process.argv[2] || "HITECH_RUBBER";
const s = new SapSession(cfg, db);
await s.login();
try {
	const kinds = [
		["PurchaseRequests", "PR"],
		["PurchaseQuotations", "Quotation"],
		["PurchaseOrders", "PO"],
		["PurchaseDeliveryNotes", "GRPO"],
	];
	for (const [entity, label] of kinds) {
		const res = await s.get(
			// No DocTotal: a Purchase Request has none, and asking for it fails the whole read.
			`${entity}?$select=DocEntry,DocNum,DocDate,Reference2,DocumentStatus,Cancelled,DocumentLines&$filter=startswith(Reference2,'ZT')&$orderby=DocEntry`,
		);
		for (const d of res?.value ?? []) {
			console.log(`${label} ${d.DocNum} (entry ${d.DocEntry}) ${d.DocDate?.slice(0, 10)} ref ${d.Reference2} status ${d.DocumentStatus}${d.Cancelled === "tYES" ? " CANCELLED" : ""}`);
			for (const l of d.DocumentLines ?? []) {
				console.log(`    line ${l.LineNum}: ${l.ItemCode} qty ${l.Quantity} ${l.MeasureUnit ?? ""} x${l.UnitsOfMeasurment} = inv ${l.InventoryQuantity}, price ${l.UnitPrice}, total ${l.LineTotal}, base ${l.BaseType}/${l.BaseEntry}/${l.BaseLine}, open ${l.RemainingOpenQuantity}, ${l.LineStatus}`);
			}
		}
	}
} finally {
	await s.logout?.();
}
