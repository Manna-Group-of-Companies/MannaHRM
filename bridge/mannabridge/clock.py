"""Keeping a machine's clock on the site's clock.

These machines drift. BIO-MRP-GATE1 was **7 minutes 43 seconds slow** when it
was first measured, on 19 September 2026, and nothing in the system had noticed
in the three years it had been running. A slow gate writes everybody's arrival
earlier than it happened, so a late arrival is not late; a fast one makes a
whole shift late. Either way the number that decides somebody's pay is wrong and
the report looks perfectly ordinary.

**The site's clock is the one that counts**, because that is what judges a punch
(CLAUDE.md §1) — not this PC's, which is only as right as whoever set it.

Two things make this safer than it looks, and both are the reason this file is
pure:

  * **A correction is refused unless it is worth making.** A machine a few
    seconds out is not corrected at all; writing the clock every pass would be
    a write nobody asked for, five minutes apart, forever.
  * **Setting a clock *back* can hide punches.** The bridge reads what is newer
    than its cursor. Move the clock back eight minutes and the next eight
    minutes of punches carry timestamps at or before that cursor — they are
    read, judged old, and never sent. So a backward correction moves the cursor
    back by the same amount. Re-sending a punch is free (the site answers
    "already has a log"); losing one is somebody's day.
"""

from datetime import timedelta

#: Under this, a clock is left alone. Two minutes is well inside any shift's
#: grace and far outside the second or two a read costs.
TOLERANCE_SECONDS = 120

#: A drift larger than this is not corrected and is shouted about instead. A
#: machine a day out has had its battery replaced or its date typed in wrong,
#: and quietly moving it could hide months of punches at the wrong date.
REFUSE_BEYOND_SECONDS = 6 * 3600


def drift_seconds(machine_time, site_time):
	"""How far ahead the machine is. Negative means it is behind."""
	return (machine_time - site_time).total_seconds()


def decide(machine_time, site_time, tolerance=TOLERANCE_SECONDS, refuse_beyond=REFUSE_BEYOND_SECONDS):
	"""What to do about this machine's clock.

	Returns `(action, drift)` where action is "leave", "set" or "refuse".
	"""
	drift = drift_seconds(machine_time, site_time)
	if abs(drift) <= tolerance:
		return "leave", drift
	if abs(drift) > refuse_beyond:
		return "refuse", drift
	return "set", drift


def rewound_cursor(cursor, drift, when_setting_back=True):
	"""The cursor to keep, once a clock has been moved.

	`cursor` is "YYYY-MM-DD HH:MM:SS" — the newest punch this bridge has read.
	Only a backward correction needs it moved: the machine is about to reuse
	timestamps it has already passed, and anything at or before the cursor is
	skipped. Moved by the drift plus a minute, because the machine's own second
	and the read are not the same instant.
	"""
	if not cursor or drift <= 0 or not when_setting_back:
		return cursor
	from datetime import datetime

	stamp = datetime.strptime(cursor, "%Y-%m-%d %H:%M:%S")
	return (stamp - timedelta(seconds=drift + 60)).strftime("%Y-%m-%d %H:%M:%S")
