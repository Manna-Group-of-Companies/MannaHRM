/**
 * Loading and checking `config.toml`.
 *
 * Every check here fails at startup rather than at 3am on the first punch. A
 * bridge that starts happily with a missing API secret and then silently queues
 * a month of attendance is the specific failure this file exists to prevent.
 */

import fs from "node:fs";
import { parse as parseToml } from "smol-toml";

/** Stop with a message rather than a stack trace. Everything this function
    reports is a thing a person has to go and fix in a file. */
function die(message) {
	process.stderr.write(message + "\n");
	process.exit(1);
}

export function loadConfig(path) {
	if (!fs.existsSync(path)) {
		die(`No config at ${path}. Copy config.example.toml and fill it in.`);
	}

	let raw;
	try {
		raw = parseToml(fs.readFileSync(path, "utf8"));
	} catch (e) {
		die(`Could not read ${path}: ${e.message}`);
	}

	const erp = raw.erp || {};
	// Secrets may come from the environment instead, so the file can be readable
	// by whoever maintains the box without handing them the site.
	const apiKey = process.env.MANNA_API_KEY || erp.api_key || "";
	const apiSecret = process.env.MANNA_API_SECRET || erp.api_secret || "";

	const missing = [
		["erp.url", erp.url],
		["erp.api_key", apiKey],
		["erp.api_secret", apiSecret],
	].filter(([, v]) => !v).map(([name]) => name);
	if (missing.length) die(`Config is missing: ${missing.join(", ")}`);

	const devices = [];
	const seen = new Set();
	for (const entry of raw.device || []) {
		const name = entry.name;
		const host = entry.host;
		if (!name || !host) die("Every [[device]] needs a name and a host.");
		if (seen.has(name)) {
			// `name` becomes `Employee Checkin.device_id`, and two machines
			// sharing one would make the site-side silence alarm useless — one
			// live device would mask the other's death.
			die(`Two devices are both called ${name}.`);
		}
		seen.add(name);

		devices.push({
			name,
			host,
			port: Number(entry.port ?? 4370),
			password: Number(entry.password ?? 0),
			timeout: Number(entry.timeout ?? 15),
			forceUdp: Boolean(entry.force_udp ?? false),
		});
	}

	if (!devices.length) die("No [[device]] entries — the bridge would do nothing.");

	const bridge = raw.bridge || {};
	return {
		erpUrl: erp.url,
		apiKey,
		apiSecret,
		devices,
		queuePath: bridge.queue_path ?? "punches.sqlite3",
		pollSeconds: Number(bridge.poll_seconds ?? 300),
		retainDays: Number(bridge.retain_days ?? 90),
		logLevel: bridge.log_level ?? "INFO",
	};
}
