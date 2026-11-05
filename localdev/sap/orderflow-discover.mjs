// Read-only: what the Manna Treads -> Hi-Tech order flow needs to know about the two test companies.
//
//     node localdev/sap/orderflow-discover.mjs
//
// Recent sales and purchase orders (series, branch, warehouse, tax code, how NumAtCard is used), the
// inter-company business partners on each side, and the items both companies share. Every call after
// Login is a GET. Output also goes to localdev/sap/out/orderflow-discover.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, SapSession } from "./sapguard.mjs";

const MT = "TEST_MANNA_TREADS";
const HT = "TEST_HITECH_PRETREADS";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out", "orderflow-discover.json");

const cfg = loadConfig();
const found = {};

const docSel = "DocEntry,DocNum,DocDate,CardCode,CardName,NumAtCard,Series,BPL_IDAssignedToInvoice,DocumentStatus,Cancelled,Comments,DocTotal,VatSum";
const lineOf = (l) => ({
	ItemCode: l.ItemCode, Quantity: l.Quantity, UnitPrice: l.UnitPrice, Price: l.Price, PriceAfterVAT: l.PriceAfterVAT,
	TaxCode: l.TaxCode, WarehouseCode: l.WarehouseCode, LocationCode: l.LocationCode, MeasureUnit: l.MeasureUnit,
	BaseType: l.BaseType, BaseEntry: l.BaseEntry, DiscountPercent: l.DiscountPercent,
});

const recent = async (s, set, filter = "") => {
	const q = `${set}?$select=${docSel},DocumentLines&$orderby=DocEntry desc&$top=6${filter ? `&$filter=${encodeURIComponent(filter)}` : ""}`;
	const r = await s.get(q);
	return r.value.map((d) => ({ ...Object.fromEntries(docSel.split(",").map((k) => [k, d[k]])), lines: (d.DocumentLines || []).slice(0, 3).map(lineOf) }));
};

const partners = async (s, like) => {
	const f = like.map((w) => `contains(CardName,'${w}')`).join(" or ");
	const r = await s.get(`BusinessPartners?$select=CardCode,CardName,CardType,Valid,Frozen,BillToState,FederalTaxID,Currency&$filter=${encodeURIComponent(f)}&$top=40`);
	return r.value;
};

for (const db of [MT, HT]) {
	const s = new SapSession(cfg, db);
	try {
		await s.login();
		const d = (found[db] = {});
		d.salesOrders = await recent(s, "Orders");
		d.purchaseOrders = await recent(s, "PurchaseOrders");
		d.partners = await partners(s, db === MT ? ["HI-TECH", "HITECH", "Hi-Tech", "HI TECH", "PRETREAD"] : ["MANNA"]);
		d.branches = (await s.get("BusinessPlaces?$select=BPLID,BPLName,Disabled,MainBPL").catch((e) => ({ value: [{ error: e.message }] }))).value;
		d.warehouses = (await s.get("Warehouses?$select=WarehouseCode,WarehouseName,Inactive,BusinessPlaceID&$top=60")).value;
		if (db === HT) d.ordersFor10118 = await recent(s, "Orders", "CardCode eq '10118'");
		if (db === MT) d.purchaseFromHitech = await recent(s, "PurchaseOrders", "contains(CardName,'TECH')");
		// The new finished-goods codes (Nov 2026 conversion) are meant to exist in both companies.
		d.newFgSample = (await s.get(`Items?$select=ItemCode,ItemName,SalesItem,PurchaseItem,InventoryItem,Valid,Frozen,SalesUnit,PurchaseUnit,InventoryUOM&$filter=${encodeURIComponent("startswith(ItemCode,'P')")}&$top=5&$orderby=ItemCode`)).value;
		d.testItems = (await s.get(`Items?$select=ItemCode,ItemName,SalesItem,PurchaseItem,Valid,Frozen&$filter=${encodeURIComponent("ItemCode ge 'I-14636' and ItemCode le 'I-14645'")}`)).value;
	} catch (e) {
		found[db] = { error: e.message, sapCode: e.sapCode };
	} finally {
		await s.logout();
	}
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(found, null, 2));
console.log(JSON.stringify(found, null, 2));
