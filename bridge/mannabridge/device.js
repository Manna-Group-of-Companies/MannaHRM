/**
 * Reading punches off a ZK-protocol fingerprint machine.
 *
 * Covers ZKTeco and the clones sold under other names in India — eSSL, Realtime
 * and most of the rest speak the same protocol. A device that does not is not
 * supported here and needs its own reader; that is a decision to take before
 * buying, not after.
 *
 * **This module never clears the device's log.** `node-zklib` offers
 * `clearAttendanceLog()` and the sample code in every tutorial calls it. Do not.
 * The device's memory is the last copy of a punch that failed to deliver, and a
 * ring buffer that overwrites itself in six months is a better backup than a
 * program that deletes on purpose.
 *
 * ## Why the record is decoded here rather than by the library
 *
 * `node-zklib` ships its own 40-byte record decoder and it does not read the
 * direction byte at all — its records carry a user id and a time and nothing
 * else. The Python bridge this replaces used `pyzk`, which does read it, and
 * `logType` below is the only thing standing between a shift's pairing mode and
 * a guess. So the raw buffer is pulled off the library's socket and decoded
 * here, against the layout `pyzk` uses:
 *
 * **The layout below was read off the machine, not off a datasheet.** The two
 * libraries disagree about where the timestamp sits — `node-zklib` says 27,
 * `pyzk` says 28 — and this file used to follow `pyzk` on the grounds that a
 * port should not change behaviour. It was wrong, and on 29 Aug 2026 the real
 * device settled it. Identix K90+ID, serial CGKK211561350, 4,910 records whose
 * timestamps are monotonic and land in the range the device itself reports:
 *
 *     uid    H    2 bytes   offset 0
 *     user   24s  24 bytes  offset 2
 *     status B    1 byte    offset 26   verify mode; 1 on 100% of real records
 *     time   4s   4 bytes   offset 27   <- 27, not 28
 *     punch  B    1 byte    offset 31   <- 31, not 27
 *     pad    8s   8 bytes   offset 32
 *
 * At 28 every timestamp decoded to the year 2000. At 27 the first record reads
 * `2023-06-28 14:53:25`, which is the date the device's own log starts.
 *
 * **`punch` at 31 is the one that decides pay.** Read at 27 it was the low byte
 * of the timestamp — noise, mapped onto IN/OUT, and it looked plausible. At 31
 * it splits 50.1/49.9 across the log, and one night-shift worker's punches
 * alternate cleanly: in 14:54, out 03:03 the next morning. That pairing is what
 * a shift multiplies into a day's wage, so it is checked here rather than
 * assumed. `bridge/mannabridge/device.test.js` pins all three offsets.
 */

import ZKLib from "node-zklib";
import { logger } from "./log.js";

const log = logger("mannabridge.device");

/* ZK devices report direction in `punch`, when configured to at all. 0/1 is the
   common mapping; anything else means the machine was set up for break-in and
   break-out too, and those are not attendance. */
const PUNCH_IN = 0;
const PUNCH_OUT = 1;

const RECORD_SIZE = 40;
const TIME_OFFSET = 27;
const PUNCH_OFFSET = 31;
/* Not read — the verify mode, and it is 1 on every real record. Named so the
   next person can see the whole 40 bytes are accounted for and that nothing is
   hiding in the gap between the user id and the timestamp. */
const STATUS_OFFSET = 26;

/* The library's own request opcode for the attendance log. Imported from its
   constants rather than retyped, so a protocol change in the library is a
   version bump here and not a silent mismatch. */
const { REQUEST_DATA } = await import("node-zklib/constants.js");

/** ZK packs a timestamp as a base-encoded integer rather than a Unix epoch:
    months are 12, days 31, regardless of the real calendar. Reproduced from
    `pyzk`'s `decode_time`. Exported so it can be tested without a machine. */
export function decodeTime(value) {
	let t = value;
	const second = t % 60; t = (t - second) / 60;
	const minute = t % 60; t = (t - minute) / 60;
	const hour = t % 24; t = (t - hour) / 24;
	const day = (t % 31) + 1; t = (t - (day - 1)) / 31;
	const month = (t % 12) + 1; t = (t - (month - 1)) / 12;
	const year = t + 2000;
	return new Date(year, month - 1, day, hour, minute, second);
}

/** "2026-08-19 06:42:00" — local time, as the device reports it and as Frappe
    stores it. Never `toISOString`, which would shift every punch by the UTC
    offset and move a 00:30 night punch to the previous day. */
const stamp = (d) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
	+ ` ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
	+ `:${String(d.getSeconds()).padStart(2, "0")}`;

/** Direction, or null when the machine does not report one.
 *
 * null is returned rather than guessed. A guessed direction is worse than no
 * direction: the shift's pairing mode can alternate IN/OUT correctly from
 * nothing, but it cannot recover from being told the wrong thing confidently.
 */
export function logType(punch) {
	if (punch === PUNCH_IN) return "IN";
	if (punch === PUNCH_OUT) return "OUT";
	return null;
}

export class Device {
	constructor({ name, host, port = 4370, password = 0, timeout = 15, forceUdp = false }) {
		this.name = name;
		this._host = host;
		this._port = port;
		this._timeout = timeout * 1000;
		this._forceUdp = forceUdp;
		// Kept but unused by this reader: node-zklib takes no comm key, so a
		// machine with one set will refuse the socket. Recorded rather than
		// dropped so the config field does not silently mean nothing.
		this._password = password;
	}

	/**
	 * Every attendance record on the device, oldest first.
	 *
	 * `since` filters client-side. The protocol has no server-side range query,
	 * so the whole log comes over the wire either way — on a device holding
	 * 100k records that is a few seconds, which is why the poll interval is
	 * minutes and not seconds.
	 */
	async read(since = null) {
		const zk = new ZKLib(this._host, this._port, this._timeout, this._timeout);
		let raw = null;
		let opened = false;

		try {
			await zk.createSocket();
			opened = true;
			// Stops the machine accepting punches while we read. Without it a
			// punch landing mid-read can be missed entirely.
			await zk.disableDevice();

			const tcp = zk.connectionType === "tcp";
			const conn = tcp ? zk.zklibTcp : zk.zklibUdp;
			raw = await conn.readWithBuffer(REQUEST_DATA.GET_ATTENDANCE_LOGS);
		} finally {
			/* Only worth releasing something that was actually taken. A device
			   that never answered has nothing to re-enable, and logging a
			   "failed to release" beside the real "could not be read" is two
			   errors for one fault — which is how a log stops being read. */
			if (opened) {
				try {
					await zk.enableDevice();
					await zk.disconnect();
				} catch (e) {
					// A failure re-enabling is worth knowing about but must not
					// lose the records we already read.
					log.exception(`${this.name}: failed to release device cleanly`, e);
				}
			}
		}

		return decodeRecords(raw?.data, since);
	}
}

/** The attendance log, decoded. Split out from `read` so the parsing can be
    tested against a crafted buffer — there is no fingerprint machine on a build
    box, and this is the half most likely to be wrong. */
export function decodeRecords(data, since = null) {
	const punches = [];

	/* The first four bytes are the payload length the device promises, not a
	   record — so they are also the only way to tell a complete read from a
	   partial one, and they are checked rather than skipped.

	   **This throws, and the direction is deliberate.** A short read used to
	   decode silently: the loop below took whole records off the front until it
	   ran out, and a stream that stopped early simply produced fewer punches.
	   Measured on the real machine on 29 Aug 2026, five reads minutes apart
	   returned 1,637 / 4,911 / 8,184 / 8,184 / 44,194 records out of a declared
	   79,356, and every one of them looked like a valid log.

	   A punch that never arrives is a person marked absent, and that costs them
	   the day. §4 of CLAUDE.md says errors round towards recording the punch,
	   so refusing the whole read is the safe end: `main.js` logs it, skips this
	   device, and leaves `lastSeen` where it was, so the same records are read
	   again next poll. Returning what arrived would advance `lastSeen` past
	   punches nobody ever saw. */
	if (!data || data.length < 4) {
		throw new Error("attendance log read returned no payload; treating as a failed read, not an empty device");
	}
	const declared = data.readUInt32LE(0);
	const arrived = data.length - 4;
	if (arrived < declared) {
		throw new Error(
			`attendance log truncated: device declared ${declared} bytes `
			+ `(${Math.floor(declared / RECORD_SIZE)} records) but ${arrived} bytes `
			+ `(${Math.floor(arrived / RECORD_SIZE)} records) arrived`,
		);
	}
	/* A whole number of records, or the stream is misaligned and every field
	   after the break is read from the wrong place. Seen on the same machine:
	   the payload ended 20 bytes into a record. */
	if (declared % RECORD_SIZE !== 0) {
		throw new Error(
			`attendance log misaligned: ${declared} bytes is not a whole number of ${RECORD_SIZE}-byte records`,
		);
	}

	/* Only what was promised. Anything past it is padding or the next reply. */
	let buf = data.subarray(4, 4 + declared);

	while (buf.length >= RECORD_SIZE) {
		const rec = buf.subarray(0, RECORD_SIZE);
		buf = buf.subarray(RECORD_SIZE);

		const deviceUser = rec.subarray(2, 26).toString("ascii").split("\0")[0].trim();
		// A record with no user on it is a device artefact, not a person.
		if (!deviceUser) continue;

		const punchedAt = stamp(decodeTime(rec.readUInt32LE(TIME_OFFSET)));
		if (since && punchedAt <= since) continue;

		punches.push({
			deviceUser,
			punchedAt,
			logType: logType(rec.readUInt8(PUNCH_OFFSET)),
		});
	}

	punches.sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));
	return punches;
}

/** The inverse of `decodeTime`, for tests and for anyone checking the offset
    question in this file's header against a real device's raw log. */
export function encodeTime(d) {
	return ((((d.getFullYear() % 100) * 12 * 31)
		+ (d.getMonth() * 31)
		+ (d.getDate() - 1)) * 86400)
		+ (d.getHours() * 3600) + (d.getMinutes() * 60) + d.getSeconds();
}
