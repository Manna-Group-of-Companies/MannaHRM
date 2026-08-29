/**
 * Find a fingerprint machine on the network and read everything we need off it.
 *
 *     node bridge/probe.js                    # scan this PC's own subnet
 *     node bridge/probe.js 192.168.1.0/24     # scan a specific range
 *     node bridge/probe.js 192.168.1.201      # one machine you already know
 *
 * Prints a ready-to-paste `[[device]]` block for `config.toml`, plus the two
 * things that decide how the shift has to be configured:
 *
 *   - **Does the device report a punch direction (IN/OUT)?** Many are set up
 *     not to. If it does not, the shift must alternate punches, and one extra
 *     punch — somebody stepping out for tea and back — silently reverses the
 *     pairing for the rest of that day.
 *   - **How far is the device's own clock from this PC's?** These machines keep
 *     their own time and drift by minutes a month. A gate running eight minutes
 *     fast makes everybody there late, and nothing downstream can tell the
 *     difference between drift and lateness.
 *
 * Read-only throughout. It does not write to the device, does not clear its
 * log, and does not enable or disable it.
 */

import net from "node:net";
import dgram from "node:dgram";
import { parseArgs } from "node:util";
import { decodeRecords } from "./mannabridge/device.js";
import { describeError, readParam, readTime, withDevice } from "./mannabridge/params.js";

const { REQUEST_DATA } = await import("node-zklib/constants.js");

const ZK_PORT = 4370;

// ------------------------------------------------------------------ scan ---

/** This PC's own /24, so the common case needs no arguments.
 *
 * A UDP "connect" to work out which interface would be used to reach the
 * outside world — no packet is actually sent, and it does not need the internet
 * to be up. */
function localSubnet() {
	return new Promise((resolve) => {
		const s = dgram.createSocket("udp4");
		try {
			s.connect(80, "8.8.8.8", () => {
				const ip = s.address().address;
				s.close();
				resolve(ip.split(".").slice(0, 3).join(".") + ".0/24");
			});
		} catch {
			resolve(null);
		}
		setTimeout(() => { try { s.close(); } catch { /* already closed */ } resolve(null); }, 1500);
	});
}

function expand(target) {
	if (!target.includes("/")) return [target];
	const head = target.split("/")[0].split(".").slice(0, 3).join(".");
	return Array.from({ length: 254 }, (_, i) => `${head}.${i + 1}`);
}

const portOpen = (host, port, timeout = 400) =>
	new Promise((resolve) => {
		const s = new net.Socket();
		const done = (v) => { s.destroy(); resolve(v); };
		s.setTimeout(timeout);
		s.once("connect", () => done(true));
		s.once("timeout", () => done(false));
		s.once("error", () => done(false));
		s.connect(port, host);
	});

/** Scan with a bounded number of sockets in flight. Unbounded would open 254 at
    once and some Windows boxes simply refuse past a couple of hundred. */
async function scan(hosts, port, workers = 64) {
	const queue = [...hosts];
	const hits = [];
	await Promise.all(Array.from({ length: workers }, async () => {
		for (;;) {
			const h = queue.pop();
			if (!h) return;
			if (await portOpen(h, port)) hits.push(h);
		}
	}));
	return hits.sort((a, b) => {
		const na = a.split(".").map(Number);
		const nb = b.split(".").map(Number);
		for (let i = 0; i < 4; i++) if (na[i] !== nb[i]) return na[i] - nb[i];
		return 0;
	});
}

// ----------------------------------------------------------------- probe ---

/** Firmware varies wildly in what it answers. One unsupported call must not end
    the probe — half the details are still worth having. */
async function safe(fn, fallback = "—") {
	try {
		const v = await fn();
		return v === null || v === undefined || v === "" ? fallback : v;
	} catch {
		return fallback;
	}
}

async function probe(host, port, timeout = 12) {
	try {
		return await withDevice(host, port, timeout, async (zk) => {
			const out = { host, ok: true, port };

			const param = async (n) => {
				const r = await readParam(zk, n);
				return r.supported && r.value ? r.value : "—";
			};
			out.name = await param("~DeviceName");
			out.serial = await param("~SerialNumber");
			out.firmware = await param("FirmVer");
			out.platform = await param("~Platform");
			out.mac = await param("MAC");

			const deviceTime = await readTime(zk);
			out.deviceTime = deviceTime;
			if (deviceTime) out.driftSeconds = Math.round((Date.now() - deviceTime.getTime()) / 1000);

			const users = await safe(() => zk.getUsers(), null);
			const list = users && users.data ? users.data : [];
			out.users = list.length || "—";
			out.sampleUserIds = list.slice(0, 8).map((u) => String(u.userId ?? u.uid ?? ""));

			/* The device's own counters, which are the only honest answer to
			   "did we read everything?" — the log download can come back short
			   and there is nothing in the payload that says so. They also say
			   how close the machine is to full, and a full one either stops
			   recording or overwrites its oldest punches. Both lose wages. */
			/* Read twice and only believe an answer that is internally
			   consistent. This call is not reliable on this machine: one run in
			   three comes back with the fields shifted — `logCounts` holding
			   the user count and `logCapacity` holding 2, which renders as
			   "21850% full" if it is trusted. A counter that is sometimes wrong
			   and never says so is the same fault this file is here to catch,
			   so it is checked rather than printed. */
			for (let attempt = 0; attempt < 2 && out.logCounts === undefined; attempt++) {
				const info = await safe(() => zk.getInfo(), null);
				const counts = Number(info?.logCounts);
				const capacity = Number(info?.logCapacity);
				const sane = Number.isInteger(counts) && Number.isInteger(capacity)
					&& capacity > 0 && counts >= 0 && counts <= capacity;
				if (sane) {
					out.logCounts = counts;
					out.logCapacity = capacity;
				}
			}

			/* Deliberately not disabling the device: this is a read-only look,
			   and a probe that locks the gate while somebody is trying to punch
			   is a probe that gets run once and never again. */
			const conn = zk.connectionType === "tcp" ? zk.zklibTcp : zk.zklibUdp;
			const raw = await safe(() => conn.readWithBuffer(REQUEST_DATA.GET_ATTENDANCE_LOGS), null);
			/* `decodeRecords` refuses a short read rather than decoding it, and
			   on this network short reads are common. A probe that dies on one
			   tells you less than a probe that says which one it was — so the
			   refusal is caught and printed, and the device's own counters are
			   reported beside it so the two can be compared. */
			let logs = [];
			try {
				logs = decodeRecords(raw?.data);
				out.records = logs.length || "—";
			} catch (e) {
				out.records = "—";
				out.readError = describeError(e);
			}

			if (logs.length) {
				out.oldest = logs[0].punchedAt;
				out.newest = logs[logs.length - 1].punchedAt;
				const seen = new Set(logs.map((r) => r.logType));
				out.punchValues = [...seen].map((v) => String(v)).sort();
				/* IN and OUT both present means direction is reported. A single
				   value, or all null, means the machine sends none at all. */
				seen.delete(null);
				out.reportsDirection = seen.size > 1;
				out.samples = logs.slice(-5).map((r) => [r.deviceUser, r.punchedAt, r.logType]);
			}
			return out;
		});
	} catch (e) {
		return { host, ok: false, error: describeError(e).slice(0, 160) };
	}
}

// ---------------------------------------------------------------- report ---

const pad = (s, n) => String(s).padEnd(n);

function report(d) {
	if (!d.ok) {
		console.log(`  ${d.host}  did not answer the ZK protocol`);
		console.log(`      ${d.error}`);
		console.log("      Three things it could be, in order of likelihood:");
		console.log("        - wrong address, or the machine is on a different network");
		console.log("        - a comm key is set on the device        -> node-zklib cannot send one");
		console.log("        - older firmware that wants UDP           -> the library falls back on its own");
		console.log("      If none of those help, it may not be a ZK-family device at all,");
		console.log("      which is worth knowing now rather than after the bridge is built.");
		return;
	}

	console.log("=".repeat(70));
	console.log(`  DEVICE FOUND at ${d.host}:${d.port}`);
	console.log("=".repeat(70));
	for (const [label, key] of [["Name", "name"], ["Serial", "serial"], ["Firmware", "firmware"],
		["Platform", "platform"], ["MAC", "mac"]]) {
		console.log(`   ${pad(label, 22)} ${d[key] ?? "—"}`);
	}

	console.log(`   ${pad("Enrolled users", 22)} ${d.users}`);
	if (d.sampleUserIds?.length) {
		console.log(`   ${pad("Sample user IDs", 22)} ${d.sampleUserIds.join(", ")}`);
		console.log("        ^ these must match Employee.attendance_device_id in ERPNext");
	}

	if (d.logCounts !== undefined) {
		const pct = d.logCapacity ? (d.logCounts / d.logCapacity) * 100 : 0;
		/* 90% is the point at which this stops being a note and becomes a date
		   in the diary: the machine fills, and then it either refuses punches
		   or overwrites the oldest ones it is holding for us. */
		const flag = pct >= 90 ? "  <-- FIX THIS, the device is nearly full" : "";
		console.log(`   ${pad("Log storage (device)", 22)} ${d.logCounts} / ${d.logCapacity}`
			+ `  (${pct.toFixed(1)}% full)${flag}`);
	}

	console.log(`   ${pad("Punch records held", 22)} ${d.records}`);
	if (d.readError) {
		console.log(`   ${pad("", 22)} ${d.readError}`);
		console.log(`   ${pad("", 22)} the log was NOT read in full — nothing was decoded`);
	}
	if (d.oldest) console.log(`   ${pad("Records span", 22)} ${d.oldest}  ->  ${d.newest}`);

	if (d.driftSeconds !== undefined) {
		const mins = d.driftSeconds / 60;
		const flag = Math.abs(mins) >= 2 ? "  <-- FIX THIS" : "";
		console.log(`   ${pad("Device clock", 22)} ${d.deviceTime?.toISOString().slice(0, 19).replace("T", " ")}`
			+ `   (device is ${Math.abs(mins).toFixed(1)} min ${d.driftSeconds > 0 ? "behind" : "ahead"} this PC)${flag}`);
	}

	if (d.reportsDirection !== undefined) {
		console.log(`   ${pad("Reports IN/OUT?", 22)} `
			+ `${d.reportsDirection ? "YES" : "NO — alternating pairing required"}`
			+ `   (punch values seen: ${(d.punchValues || []).join(", ")})`);
	}

	if (d.samples?.length) {
		console.log("\n   Last 5 punches (user, time, direction):");
		for (const [u, t, p] of d.samples) console.log(`      ${pad(u, 10)} ${t}   ${p}`);
	}

	console.log("\n   ---- paste into bridge/config.toml ----");
	console.log("   [[device]]");
	const id = String(d.serial && d.serial !== "—" ? d.serial : d.host.replace(/\./g, "-")).slice(0, 16);
	console.log(`   name     = "BIO-${id}"   # must start with BIO- and be unique across all sites`);
	console.log(`   host     = "${d.host}"`);
	console.log(`   port     = ${d.port}`);
	console.log("   password = 0");
	console.log();
}

async function main() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: { port: { type: "string", default: String(ZK_PORT) } },
	});
	const port = Number(values.port);

	const target = positionals[0] || (await localSubnet());
	if (!target) {
		process.stderr.write("Could not work out this PC's subnet. Pass one, e.g. 192.168.1.0/24\n");
		process.exit(1);
	}

	const hosts = expand(target);
	let hits = hosts;

	if (hosts.length > 1) {
		console.log(`scanning ${hosts.length} address(es) on port ${port} ...`);
		hits = await scan(hosts, port);
		if (!hits.length) {
			console.log(`\nNothing answering on port ${port}.`);
			console.log("Check the machine is on the same network as this PC, and that its");
			console.log("IP is what you think: on the device, Menu -> Comm -> Ethernet.");
			return;
		}
		console.log(`open on port ${port}: ${hits.join(", ")}\n`);
	}

	for (const h of hits) report(await probe(h, port));
}

main();
