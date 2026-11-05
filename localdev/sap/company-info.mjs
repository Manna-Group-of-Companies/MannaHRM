// Read-only: what a SAP test company holds about itself - name, address, phone, email, GSTIN.
//
//     node localdev/sap/company-info.mjs              HITECH_RUBBER
//
// CompanyService_GetAdminInfo is called with POST, as the Service Layer requires, but only reads.

import { loadConfig, SapSession } from "./sapguard.mjs";

const db = process.argv[2] || "HITECH_RUBBER";
const s = new SapSession(loadConfig(), db);
await s.login();
try {
	const admin = await s.request("POST", "CompanyService_GetAdminInfo", {});
	const keep = Object.entries(admin || {}).filter(([k, v]) => v !== null && v !== "" && typeof v !== "object" && /name|addr|street|block|city|county|state|zip|country|phone|fax|mail|tax|gst|pan|tin|building|print|header|footer/i.test(k));
	console.log("AdminInfo:");
	for (const [k, v] of keep) console.log(`  ${k} = ${v}`);
	const addr = await s.request("POST", "CompanyService_GetAdminInfo", {}).then((a) => a?.AdminInfoAddresses ?? a?.Addresses ?? null).catch(() => null);
	if (addr) console.log("addresses:", JSON.stringify(addr).slice(0, 600));
	const info = await s.request("POST", "CompanyService_GetCompanyInfo", {}).catch((e) => ({ error: e.message }));
	console.log("CompanyInfo:", JSON.stringify(info).slice(0, 800));
} finally {
	await s.logout();
}
