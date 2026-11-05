// Read-only: HITECH_RUBBER's item groups and how many items each engineering group holds, for the demo company.
import { loadConfig, SapSession } from "./sapguard.mjs";
const s = new SapSession(loadConfig(), "HITECH_RUBBER");
await s.login();
try {
	const groups = await s.request("GET", "ItemGroups?$select=Number,GroupName&$top=500");
	const rows = groups?.value ?? groups;
	for (const g of rows.filter((g) => /eng|elec|spare|tool|stock/i.test(g.GroupName))) {
		const c = await s.request("GET", `Items/$count?$filter=ItemsGroupCode eq ${g.Number} and Valid eq 'tYES'`);
		console.log(`${g.Number}\t${g.GroupName}\tactive items: ${c}`);
	}
	const wh = await s.request("GET", "Warehouses?$select=WarehouseCode,WarehouseName&$top=50");
	console.log("warehouses:", (wh?.value ?? wh).map((w) => `${w.WarehouseCode}=${w.WarehouseName}`).join(", "));
} finally { await s.logout(); }
