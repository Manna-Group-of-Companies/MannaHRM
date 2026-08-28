/**
 * Reading a device's named settings, and its clock.
 *
 * ZK firmware exposes its configuration as ordinary named parameters, fetched
 * with `CMD_OPTIONS_RRQ` — the same call the library uses internally for the
 * device name. `node-zklib` does not expose it, so it is done here over the
 * library's own `executeCmd`.
 *
 * Both diagnostics need this, which is why it is a module rather than a copy in
 * each. **Read-only: nothing here writes a setting.**
 */

import ZKLib from "node-zklib";
import { decodeTime } from "./device.js";

const { COMMANDS } = await import("node-zklib/constants.js");

/* An executeCmd reply arrives with its 8-byte command header still on the
   front — command, checksum, session, reply id — and the payload after it. */
const HEADER = 8;

/**
 * One device setting.
 *
 * @returns {Promise<{supported: boolean, value: string|null}>} `supported:
 *   false` means the firmware does not know this parameter — which, for
 *   `WebServerIP`, is the whole answer.
 */
export async function readParam(zk, name) {
	try {
		const reply = await zk.executeCmd(COMMANDS.CMD_OPTIONS_RRQ, `${name}\0`);
		if (!reply || reply.length <= HEADER) return { supported: false, value: null };
		const payload = reply.subarray(HEADER).toString("ascii");
		if (!payload.includes("=")) return { supported: false, value: null };
		const value = payload.split("=").slice(1).join("=").split("\0")[0].trim();
		return { supported: true, value };
	} catch {
		return { supported: false, value: null };
	}
}

/** Several settings in one go, as a plain object keyed by name. */
export async function readParams(zk, names) {
	const out = {};
	for (const name of names) out[name] = await readParam(zk, name);
	return out;
}

/** The device's own clock, or null if it will not say.
 *
 * These machines keep their own time and drift by minutes a month. A gate
 * running eight minutes fast makes everybody there late, and nothing
 * downstream can tell the difference between drift and lateness. */
export async function readTime(zk) {
	try {
		const reply = await zk.executeCmd(COMMANDS.CMD_GET_TIME, "");
		if (!reply || reply.length < HEADER + 4) return null;
		return decodeTime(reply.readUInt32LE(HEADER));
	} catch {
		return null;
	}
}

/** A readable sentence out of whatever was thrown.
 *
 * `node-zklib` rejects with its own `ZKError`, which is **not** an Error
 * subclass — it has no `.message`, so the obvious `e.message` prints
 * `undefined` and `String(e)` prints `[object Object]`. Both of those were the
 * first thing anybody saw when a device did not answer, which is the moment a
 * diagnostic has to be at its clearest. */
export function describeError(e) {
	if (!e) return "unknown error";
	// ZKError: ask it for its own sentence, then fall back to the wrapped cause.
	if (typeof e.toast === "function") {
		const said = e.toast();
		if (said) return said;
	}
	if (e.err) return e.err.message || e.err.code || String(e.err);
	if (e.message) return e.message;
	if (e.code) return e.code;
	return String(e);
}

/** Connect, hand the socket to `fn`, and always close it again. */
export async function withDevice(host, port, timeout, fn) {
	const zk = new ZKLib(host, port, timeout * 1000, timeout * 1000);
	await zk.createSocket();
	try {
		return await fn(zk);
	} finally {
		try {
			await zk.disconnect();
		} catch {
			// Nothing useful to do about a socket that will not close politely.
		}
	}
}
