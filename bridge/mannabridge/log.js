/** The one logger. Levels and a timestamp, nothing more.
 *
 * Written by hand rather than pulled in: this program's whole job is to be
 * running unattended in eighteen months' time, and a logging framework is a
 * dependency that can break an upgrade for a feature nobody here uses.
 */

const LEVELS = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40 };

let threshold = LEVELS.INFO;

export function setLevel(name) {
	threshold = LEVELS[String(name || "INFO").toUpperCase()] ?? LEVELS.INFO;
}

function emit(level, name, args) {
	if (LEVELS[level] < threshold) return;
	const at = new Date().toISOString().slice(0, 19).replace("T", " ");
	const line = `${at} ${level.padEnd(7)} ${name}: ${args.join(" ")}`;
	// Everything goes to stdout so `>> bridge.log` catches the lot. A bridge
	// whose errors land somewhere the log file does not is a bridge that looks
	// healthy right up until payroll.
	console.log(line);
}

/** A named logger, so a line says which part of the bridge produced it. */
export const logger = (name) => ({
	debug: (...a) => emit("DEBUG", name, a),
	info: (...a) => emit("INFO", name, a),
	warning: (...a) => emit("WARNING", name, a),
	error: (...a) => emit("ERROR", name, a),
	/** An error with its stack, for the failures nobody predicted.
	 *
	 * `node-zklib` rejects with a `ZKError` that is not an Error subclass, so it
	 * has neither `.stack` nor `.message` and the obvious formatting prints
	 * `[object Object]`. Unwrapped here rather than at every call site. */
	exception: (msg, err) => {
		const wrapped = err && typeof err.toast === "function" ? (err.err ?? err) : err;
		const detail = wrapped?.stack || wrapped?.message || String(wrapped);
		emit("ERROR", name, [msg, "\n" + detail]);
	},
});
