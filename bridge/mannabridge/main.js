/**
 * The bridge loop.
 *
 * Read every device, persist what is new, then deliver whatever is undelivered.
 * Those are two separate passes on purpose: a device that is unreachable must
 * not stop the backlog from draining, and a site that is unreachable must not
 * stop devices being read.
 *
 * Run it as a service — systemd on Linux, a Scheduled Task set to "run whether
 * logged on or not" on Windows. A bridge that only runs while somebody is
 * logged in will be found switched off in March.
 */

import { parseArgs } from "node:util";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { Device } from "./device.js";
import { PunchQueue } from "./queue.js";
import { DeliveryError, ErpSink, UnmappedEmployee } from "./sink.js";
import { logger, setLevel } from "./log.js";
import { describeError } from "./params.js";

const log = logger("mannabridge");

/* Give up retrying one punch after this many attempts and leave it in the
   queue, unsent and visible. Deliberately not dropped: an undeliverable punch
   is a question for a person, and deleting it destroys the evidence for the
   answer. */
const MAX_ATTEMPTS = 20;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "2026-08-19 06:42:00" from a Date, in local time. */
const stamp = (d) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
	+ ` ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
	+ `:${String(d.getSeconds()).padStart(2, "0")}`;

/** Read each device and persist anything new. Returns how many were new. */
export async function pollDevices(devices, queue) {
	let found = 0;
	for (const device of devices) {
		let punches;
		try {
			punches = await device.read(queue.lastSeen(device.name));
		} catch (e) {
			/* One dead machine must not stop the others, and must not stop the
			   backlog draining. Logged loudly; the site-side job notices the
			   silence separately. */
			log.error(`${device.name}: could not be read:`, describeError(e));
			continue;
		}

		let newest = null;
		for (const p of punches) {
			if (queue.offer(device.name, p.deviceUser, p.punchedAt, p.logType)) found++;
			newest = p.punchedAt;
		}

		if (newest) {
			// Advanced only after the punches are safely in SQLite. Moving it
			// first would skip everything read in a pass that then crashed.
			queue.setLastSeen(device.name, newest);
		}

		log.info(`${device.name}: read ${punches.length} record(s)`);
	}
	return found;
}

/** Deliver everything undelivered. Returns {sent, failed}. */
export async function drain(queue, sink, batch = 500) {
	let sent = 0;
	let failed = 0;

	for (const row of queue.pending(batch)) {
		if (row.attempts >= MAX_ATTEMPTS) continue;

		try {
			await sink.send({
				deviceUser: row.device_user,
				punchedAt: row.punched_at,
				deviceId: row.device_id,
				logType: row.log_type,
			});
		} catch (e) {
			if (e instanceof UnmappedEmployee) {
				// Master data, not network. Retrying will not fix it, and
				// burning attempts on it hides real failures behind noise.
				queue.markFailed(row.id, e.message);
				log.warning(e.message);
				failed++;
				continue;
			}
			if (e instanceof DeliveryError) {
				queue.markFailed(row.id, e.message);
				log.error(`delivery failed for punch ${row.id}:`, e.message);
				failed++;
				// A failing sink fails for everything. Stopping the pass here
				// beats marking five hundred punches failed against one dead line.
				break;
			}
			throw e;
		}

		queue.markSent(row.id, stamp(new Date()));
		sent++;
	}

	return { sent, failed };
}

export async function runOnce(devices, queue, sink, retainDays, erpUrl = null) {
	const found = await pollDevices(devices, queue);
	const { sent, failed } = await drain(queue, sink);

	if (sent && erpUrl) {
		/* Only after something was actually delivered, and only as far as the
		   newest punch that got through. See ErpSink.markSynced for why this
		   matters more than it looks. */
		const newest = queue.newestSent();
		if (newest) {
			const n = await sink.markSynced(erpUrl, newest);
			log.info(`last_sync_of_checkin advanced to ${newest} on ${n} shift(s)`);
		}
	}

	const cutoff = stamp(new Date(Date.now() - retainDays * 86400000));
	const pruned = queue.pruneSent(cutoff);

	const backlog = queue.backlogSize();
	log.info(
		`pass complete: ${found} new, ${sent} sent, ${failed} failed, ${pruned} pruned, ${backlog} waiting`,
	);
	if (backlog > 1000) {
		// A backlog this size is not a blip. Either the site has been
		// unreachable for a day or every punch is hitting UnmappedEmployee.
		log.error(`backlog is ${backlog} punches — something is wrong, not just slow`);
	}

	return backlog;
}

async function main() {
	const { values } = parseArgs({
		options: {
			config: { type: "string", default: "config.toml" },
			once: { type: "boolean", default: false },
			/* Without it a new install reads the device's entire history — this
			   machine holds three years and 79,000 records, and posting all of
			   them would take hours and fill the site with attendance nobody
			   asked for. Only ever moves a cursor forward. */
			from: { type: "string" },
		},
	});

	const config = loadConfig(values.config);
	setLevel(config.logLevel);

	const queue = new PunchQueue(config.queuePath);
	const sink = new ErpSink(config.erpUrl, config.apiKey, config.apiSecret);
	const devices = config.devices.map((d) => new Device(d));

	log.info(`bridge starting: ${devices.length} device(s) -> ${config.erpUrl}`);

	if (values.from) {
		/* Seeded as end-of-day so the named date is itself skipped: "--from
		   2026-08-23" means "start with the 24th". Never moved backwards, so
		   re-running it cannot cause a replay of what has already been sent. */
		const seed = values.from + " 23:59:59";
		for (const d of devices) {
			const current = queue.lastSeen(d.name);
			if (current && current >= seed) {
				log.info(`${d.name}: cursor already at ${current}, leaving it`);
			} else {
				queue.setLastSeen(d.name, seed);
				log.info(`${d.name}: cursor seeded to ${seed}`);
			}
		}
	}

	if (!(await sink.heartbeat(config.erpUrl))) {
		/* Not fatal. The queue is durable, so the right behaviour is to keep
		   reading devices and deliver when the line returns — but this line in
		   the log is what tells somebody why nothing is arriving. */
		log.error(`cannot reach ${config.erpUrl} — punches will queue locally until it returns`);
	}

	for (;;) {
		try {
			await runOnce(devices, queue, sink, config.retainDays, config.erpUrl);
		} catch (e) {
			log.exception("unexpected failure in poll cycle", e);
		}

		if (values.once) {
			queue.close();
			return;
		}
		await sleep(config.pollSeconds * 1000);
	}
}

/* Only when run directly, so the loop does not start under a test that imports
   `drain` to check what it does with a dead sink. Compared through realpath so
   a symlinked install still matches. */
const invoked = process.argv[1]
	&& import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (invoked) main();
