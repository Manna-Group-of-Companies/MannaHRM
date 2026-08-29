/**
 * The record decoder, pinned.
 *
 *     node --test bridge/mannabridge/
 *
 * No machine needed: every buffer here is built by hand to the layout in
 * `device.js`, which was itself read off Identix K90+ID serial CGKK211561350 on
 * 29 August 2026. The offsets are the point — two of them were wrong for the
 * whole life of the file, the build was green throughout, and the only thing
 * that caught it was decoding a real device's log and finding the year 2000.
 *
 * Tests state the rule in their name. When one fails at midnight, the name is
 * what tells the reader what was supposed to be true.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRecords, decodeTime, encodeTime } from "./device.js";

const RECORD_SIZE = 40;

/** One record, at the layout the real device uses. */
function record({ user, at, punch = 0, status = 1 }) {
	const r = Buffer.alloc(RECORD_SIZE);
	r.writeUInt16LE(1, 0);
	r.write(user, 2, 24, "ascii");
	r.writeUInt8(status, 26);
	r.writeUInt32LE(encodeTime(at), 27);
	r.writeUInt8(punch, 31);
	return r;
}

/** A well-formed reply: four bytes of declared length, then the records. */
function reply(records) {
	const body = Buffer.concat(records);
	const head = Buffer.alloc(4);
	head.writeUInt32LE(body.length, 0);
	return Buffer.concat([head, body]);
}

test("a punch is decoded at the offsets the real device uses", () => {
	const at = new Date(2023, 5, 28, 14, 53, 25);
	const [p] = decodeRecords(reply([record({ user: "911", at, punch: 1 })]));
	assert.equal(p.deviceUser, "911");
	assert.equal(p.punchedAt, "2023-06-28 14:53:25");
	assert.equal(p.logType, "OUT");
});

test("the timestamp is read at byte 27, not byte 28", () => {
	/* The bug this pins: at 28 the same buffer decoded to the year 2000, which
	   is what a whole log of impossible dates looked like. */
	const at = new Date(2023, 5, 28, 14, 53, 25);
	const [p] = decodeRecords(reply([record({ user: "911", at })]));
	assert.equal(p.punchedAt.slice(0, 4), "2023");
	assert.notEqual(p.punchedAt.slice(0, 4), "2000");
});

test("the direction is read at byte 31, not byte 27", () => {
	/* At 27 the direction was the low byte of the timestamp. These two records
	   differ ONLY in byte 31, so a decoder reading 27 cannot tell them apart. */
	const at = new Date(2023, 5, 28, 14, 53, 25);
	const inn = decodeRecords(reply([record({ user: "882", at, punch: 0 })]))[0];
	const out = decodeRecords(reply([record({ user: "882", at, punch: 1 })]))[0];
	assert.equal(inn.logType, "IN");
	assert.equal(out.logType, "OUT");
});

test("a truncated read is refused rather than decoded as fewer punches", () => {
	/* The failure that made this file worth testing: the device declared 79,356
	   records and 3,273 arrived, and the old decoder returned 3,273 punches as
	   though that were the whole log. */
	const whole = reply([
		record({ user: "911", at: new Date(2023, 5, 28, 14, 53, 25) }),
		record({ user: "882", at: new Date(2023, 5, 28, 14, 54, 17) }),
	]);
	const short = whole.subarray(0, whole.length - RECORD_SIZE);
	assert.throws(() => decodeRecords(short), /truncated/);
});

test("a payload ending mid-record is refused as misaligned", () => {
	const r = record({ user: "911", at: new Date(2023, 5, 28, 14, 53, 25) });
	const head = Buffer.alloc(4);
	head.writeUInt32LE(RECORD_SIZE + 20, 0);           // 20 bytes into the next
	const buf = Buffer.concat([head, r, Buffer.alloc(20)]);
	assert.throws(() => decodeRecords(buf), /misaligned/);
});

test("an empty payload is a failed read, not a device with no punches", () => {
	/* Silence and emptiness look identical on the wire and mean opposite
	   things. Only one of them is safe to treat as "nothing new". */
	assert.throws(() => decodeRecords(null), /no payload/);
	assert.throws(() => decodeRecords(Buffer.alloc(2)), /no payload/);
});

test("a device holding no punches decodes to no punches", () => {
	assert.deepEqual(decodeRecords(reply([])), []);
});

test("trailing bytes past the declared length are ignored, not decoded", () => {
	const good = reply([record({ user: "911", at: new Date(2023, 5, 28, 14, 53, 25) })]);
	const withJunk = Buffer.concat([good, Buffer.alloc(RECORD_SIZE, 0xff)]);
	assert.equal(decodeRecords(withJunk).length, 1);
});

test("since filters out punches already seen, and keeps the rest", () => {
	const buf = reply([
		record({ user: "911", at: new Date(2023, 5, 28, 14, 53, 25) }),
		record({ user: "882", at: new Date(2023, 5, 28, 14, 54, 17) }),
	]);
	const got = decodeRecords(buf, "2023-06-28 14:53:25");
	assert.equal(got.length, 1);
	assert.equal(got[0].deviceUser, "882");
});

test("a night punch keeps the clock time it was made at", () => {
	/* Never toISOString: it would shift a 00:30 punch into the previous day and
	   move a night worker's shift with it. */
	const [p] = decodeRecords(reply([record({ user: "882", at: new Date(2023, 5, 29, 3, 3, 4) })]));
	assert.equal(p.punchedAt, "2023-06-29 03:03:04");
});

test("decodeTime and encodeTime round-trip a real punch", () => {
	const at = new Date(2023, 5, 29, 3, 3, 4);
	assert.equal(decodeTime(encodeTime(at)).getTime(), at.getTime());
});
