"""A punch that has been read off a device but not yet accepted by ERPNext.

The whole reason this exists: a fingerprint machine holds its log in a small
ring buffer, and the naive sync tool reads the buffer, posts it, and clears it.
If the post fails — the site is down, the internet is out, the token expired —
the punches are gone from both ends and nobody finds out until payroll.

So the order here is: read, **persist locally**, then post, then mark sent. The
device's own log is never cleared by this program at all. Duplicates are cheap
(the sink de-duplicates); a lost punch is somebody's day's pay.

SQLite because it is in the standard library, survives a power cut, and the
machine this runs on is a mini PC on a shelf that nobody will ever maintain.
"""

import sqlite3
import threading
from contextlib import contextmanager

SCHEMA = """
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
"""


class PunchQueue:
	def __init__(self, path):
		self._path = path
		self._lock = threading.Lock()
		with self._connect() as db:
			db.executescript(SCHEMA)

	@contextmanager
	def _connect(self):
		db = sqlite3.connect(self._path, timeout=30)
		db.row_factory = sqlite3.Row
		try:
			yield db
			db.commit()
		finally:
			db.close()

	# ------------------------------------------------------------- writing ---

	def offer(self, device_id, device_user, punched_at, log_type=None):
		"""Record a punch read off a device. Returns True if it was new.

		The UNIQUE constraint is the de-duplication: a device re-read after a
		restart offers the same punches again, and they are silently ignored.
		That is why the cursor below is an optimisation and not a correctness
		mechanism — losing it costs a re-read, not a duplicate.
		"""
		with self._lock, self._connect() as db:
			cur = db.execute(
				"""
				INSERT OR IGNORE INTO punch (device_id, device_user, punched_at, log_type)
				VALUES (?, ?, ?, ?)
				""",
				(device_id, device_user, punched_at, log_type),
			)
			return cur.rowcount > 0

	def mark_sent(self, punch_id, when):
		with self._lock, self._connect() as db:
			db.execute("UPDATE punch SET sent_at = ? WHERE id = ?", (when, punch_id))

	def mark_failed(self, punch_id, error):
		with self._lock, self._connect() as db:
			db.execute(
				"UPDATE punch SET attempts = attempts + 1, last_error = ? WHERE id = ?",
				(str(error)[:500], punch_id),
			)

	# ------------------------------------------------------------- reading ---

	def pending(self, limit=500):
		"""Unsent punches, oldest first.

		Oldest first matters. Auto-attendance pairs punches in time order, so
		delivering a Tuesday punch-out before its Tuesday punch-in leaves a day
		that reads as two half-events until the next reprocess.
		"""
		with self._connect() as db:
			rows = db.execute(
				"SELECT * FROM punch WHERE sent_at IS NULL ORDER BY punched_at ASC, id ASC LIMIT ?",
				(limit,),
			).fetchall()
			return [dict(r) for r in rows]

	def newest_sent(self):
		"""The latest punch time that has actually reached ERPNext."""
		with self._connect() as db:
			row = db.execute(
				"SELECT MAX(punched_at) AS t FROM punch WHERE sent_at IS NOT NULL"
			).fetchone()
			return row["t"] if row else None

	def backlog_size(self):
		with self._connect() as db:
			row = db.execute("SELECT COUNT(*) AS n FROM punch WHERE sent_at IS NULL").fetchone()
			return row["n"]

	# -------------------------------------------------------------- cursor ---

	def last_seen(self, device_id):
		with self._connect() as db:
			row = db.execute(
				"SELECT last_seen FROM cursor WHERE device_id = ?", (device_id,)
			).fetchone()
			return row["last_seen"] if row else None

	def set_last_seen(self, device_id, when):
		with self._lock, self._connect() as db:
			db.execute(
				"""
				INSERT INTO cursor (device_id, last_seen) VALUES (?, ?)
				ON CONFLICT (device_id) DO UPDATE SET last_seen = excluded.last_seen
				""",
				(device_id, when),
			)

	def prune_sent(self, before):
		"""Drop delivered punches older than `before`, to bound the file.

		Only ever deletes rows that carry a `sent_at`. An unsent punch is never
		pruned, however old — an outage that lasted a fortnight must still
		deliver when the line comes back.
		"""
		with self._lock, self._connect() as db:
			cur = db.execute(
				"DELETE FROM punch WHERE sent_at IS NOT NULL AND punched_at < ?", (before,)
			)
			return cur.rowcount
