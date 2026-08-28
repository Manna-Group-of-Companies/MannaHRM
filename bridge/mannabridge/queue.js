/**
 * A punch that has been read off a device but not yet accepted by ERPNext.
 *
 * The whole reason this exists: a fingerprint machine holds its log in a small
 * ring buffer, and the naive sync tool reads the buffer, posts it, and clears
 * it. If the post fails — the site is down, the internet is out, the token
 * expired — the punches are gone from both ends and nobody finds out until
 * payroll.
 *
 * So the order here is: read, **persist locally**, then post, then mark sent.
 * The device's own log is never cleared by this program at all. Duplicates are
 * cheap (the sink de-duplicates); a lost punch is somebody's day's pay.
 *
 * `node:sqlite` because it ships with Node, survives a power cut, and the
 * machine this runs on is a mini PC on a shelf that nobody will ever maintain.
 * It is still marked experimental, which is a real trade — but the alternative
 * is a native module that has to be rebuilt every time somebody upgrades Node,
 * and a bridge that stops starting after a routine upgrade is exactly the
 * maintenance burden this choice is avoiding.
 */

import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS punch (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id    TEXT    NOT NULL,
    device_user  TEXT    NOT NULL,
    punched_at   TEXT    NOT NULL,
    log_type     TEXT,
    sent_at      TEXT,
    attempts     INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT,
    UNIQUE (device_id, device_user, punched_at)
);

CREATE INDEX IF NOT EXISTS punch_unsent ON punch (sent_at, id);

CREATE TABLE IF NOT EXISTS cursor (
    device_id  TEXT PRIMARY KEY,
    last_seen  TEXT NOT NULL
);
`;

export class PunchQueue {
	constructor(path) {
		/* One long-lived handle rather than one per call. Node is single
		   threaded here, so the lock the Python version needed has nothing to
		   guard — the passes are sequential and awaited. */
		this._db = new DatabaseSync(path);
		// Survives a power cut without losing the last write, which is the only
		// reason this file is SQLite and not a text log.
		this._db.exec("PRAGMA journal_mode = WAL");
		this._db.exec(SCHEMA);
	}

	close() {
		this._db.close();
	}

	// ------------------------------------------------------------- writing ---

	/**
	 * Record a punch read off a device. Returns true if it was new.
	 *
	 * The UNIQUE constraint is the de-duplication: a device re-read after a
	 * restart offers the same punches again, and they are silently ignored.
	 * That is why the cursor below is an optimisation and not a correctness
	 * mechanism — losing it costs a re-read, not a duplicate.
	 */
	offer(deviceId, deviceUser, punchedAt, logType = null) {
		const r = this._db.prepare(
			`INSERT OR IGNORE INTO punch (device_id, device_user, punched_at, log_type)
			 VALUES (?, ?, ?, ?)`,
		).run(deviceId, deviceUser, punchedAt, logType);
		return r.changes > 0;
	}

	markSent(punchId, when) {
		this._db.prepare("UPDATE punch SET sent_at = ? WHERE id = ?").run(when, punchId);
	}

	markFailed(punchId, error) {
		this._db.prepare(
			"UPDATE punch SET attempts = attempts + 1, last_error = ? WHERE id = ?",
		).run(String(error).slice(0, 500), punchId);
	}

	// ------------------------------------------------------------- reading ---

	/**
	 * Unsent punches, oldest first.
	 *
	 * Oldest first matters. Auto-attendance pairs punches in time order, so
	 * delivering a Tuesday punch-out before its Tuesday punch-in leaves a day
	 * that reads as two half-events until the next reprocess.
	 */
	pending(limit = 500) {
		return this._db.prepare(
			"SELECT * FROM punch WHERE sent_at IS NULL ORDER BY punched_at ASC, id ASC LIMIT ?",
		).all(limit);
	}

	/** The latest punch time that has actually reached ERPNext. */
	newestSent() {
		const row = this._db.prepare(
			"SELECT MAX(punched_at) AS t FROM punch WHERE sent_at IS NOT NULL",
		).get();
		return row ? row.t : null;
	}

	backlogSize() {
		return this._db.prepare(
			"SELECT COUNT(*) AS n FROM punch WHERE sent_at IS NULL",
		).get().n;
	}

	// -------------------------------------------------------------- cursor ---

	lastSeen(deviceId) {
		const row = this._db.prepare(
			"SELECT last_seen FROM cursor WHERE device_id = ?",
		).get(deviceId);
		return row ? row.last_seen : null;
	}

	setLastSeen(deviceId, when) {
		this._db.prepare(
			`INSERT INTO cursor (device_id, last_seen) VALUES (?, ?)
			 ON CONFLICT (device_id) DO UPDATE SET last_seen = excluded.last_seen`,
		).run(deviceId, when);
	}

	/**
	 * Drop delivered punches older than `before`, to bound the file.
	 *
	 * Only ever deletes rows that carry a `sent_at`. An unsent punch is never
	 * pruned, however old — an outage that lasted a fortnight must still deliver
	 * when the line comes back.
	 */
	pruneSent(before) {
		return this._db.prepare(
			"DELETE FROM punch WHERE sent_at IS NOT NULL AND punched_at < ?",
		).run(before).changes;
	}
}
