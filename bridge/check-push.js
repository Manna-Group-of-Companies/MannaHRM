/**
 * Ask the device whether it can push punches out by itself, and to where.
 *
 *     node bridge/check-push.js 192.168.1.40
 *
 * A datasheet says what the model can do; this says what *your unit* does, on
 * its current firmware, with its current settings. Those are different
 * questions and only the second one matters.
 *
 * ## What "push" means here
 *
 * ZK-family firmware calls it **ADMS** (Automatic Data Master Server), or
 * "Cloud Server" in the device menu. With it configured, the machine POSTs each
 * punch to an HTTP endpoint as it happens, over `/iclock/cdata`. Nothing has to
 * poll it, so no always-on PC is needed on the device's own network.
 *
 * That is the difference between needing a machine at every plant and needing
 * none.
 *
 * ## How this reads it
 *
 * Device settings are ordinary named parameters, fetched with `CMD_OPTIONS_RRQ`.
 * If a parameter comes back at all the firmware knows about it; if it comes back
 * with a value, it is configured. See mannabridge/params.js.
 *
 * Read-only. Nothing here writes a setting.
 */

import { parseArgs } from "node:util";
import { describeError, readParams, withDevice } from "./mannabridge/params.js";

// Grouped by what an answer would tell us.
const PARAMS = [
	// --- does the firmware know about ADMS at all? ---
	["WebServerIP", "ADMS server address", "push"],
	["WebServerPort", "ADMS server port", "push"],
	["EnableDomainName", "use a domain rather than an IP", "push"],
	["ADMSEnable", "ADMS switched on", "push"],
	["SupportADMS", "firmware advertises ADMS", "push"],
	// --- how eagerly would it send? ---
	["TransFlag", "what gets transmitted", "behaviour"],
	["TransTimes", "scheduled upload times", "behaviour"],
	["TransInterval", "upload interval, minutes", "behaviour"],
	["Realtime", "send each punch immediately", "behaviour"],
	["TimeZone", "device timezone offset", "behaviour"],
	// --- proxy, in case the plant network needs one ---
	["ProxyServerIP", "proxy address", "proxy"],
	["ProxyServerPort", "proxy port", "proxy"],
	["EnableProxyServer", "proxy in use", "proxy"],
	// --- context ---
	["~DeviceName", "device name", "info"],
	["~Platform", "platform", "info"],
	["FirmVer", "firmware", "info"],
	["~SerialNumber", "serial", "info"],
	["IPAddress", "device IP", "info"],
	["NetMask", "netmask", "info"],
	["GATEIPAddress", "gateway", "info"],
];

const pad = (s, n) => String(s).padEnd(n);

async function main() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			port: { type: "string", default: "4370" },
			timeout: { type: "string", default: "30" },
		},
	});

	const host = positionals[0];
	if (!host) {
		process.stderr.write("usage: node bridge/check-push.js <host> [--port 4370]\n");
		process.exit(1);
	}

	let results;
	try {
		results = await withDevice(host, Number(values.port), Number(values.timeout),
			(zk) => readParams(zk, PARAMS.map((p) => p[0])));
	} catch (e) {
		process.stderr.write(
			`Could not connect to ${host}:${values.port} — ${describeError(e)}\n`
			+ "Is the machine powered on and on this network?\n",
		);
		process.exit(1);
	}

	for (const [group, title] of [["info", "DEVICE"], ["push", "PUSH / ADMS"],
		["behaviour", "UPLOAD BEHAVIOUR"], ["proxy", "PROXY"]]) {
		console.log("\n" + title);
		console.log("-".repeat(62));
		for (const [name, label, g] of PARAMS) {
			if (g !== group) continue;
			const { supported, value } = results[name];
			console.log(supported
				? `   ${pad(name, 22)} ${pad(label, 28)} ${value === "" ? "(empty)" : JSON.stringify(value)}`
				: `   ${pad(name, 22)} ${pad(label, 28)} not supported`);
		}
	}

	// ---- the verdict ----
	const ipOk = results.WebServerIP.supported;
	const portOk = results.WebServerPort.supported;
	const ipVal = results.WebServerIP.value || "";
	const portVal = results.WebServerPort.value || "";

	console.log("\n" + "=".repeat(62));
	if (ipOk || portOk) {
		console.log("  THIS DEVICE CAN PUSH.");
		if (ipVal) {
			console.log(`  It is already configured to send to ${ipVal}:${portVal || "?"}`);
			console.log("  That is almost certainly Factor HR. Point a second copy of that");
			console.log("  setting at our own receiver and no local PC is needed at all —");
			console.log("  though most firmware holds only ONE server, so this would be a");
			console.log("  cutover rather than something that can run alongside.");
		} else {
			console.log("  The setting exists but is empty, so nothing is being pushed today.");
			console.log("  Something is therefore POLLING this device for Factor HR — find");
			console.log("  that machine before buying anything.");
		}
	} else {
		console.log("  NO ADMS SUPPORT on this firmware.");
		console.log("  Polling is the only way in, so a machine on this network has to do it.");
	}
	console.log("=".repeat(62));
}

main();
