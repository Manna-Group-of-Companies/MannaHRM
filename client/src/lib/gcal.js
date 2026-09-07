/* ---------------------------------------------------------------------------
   The holiday list, out of this app and into somebody's own calendar.

   Two roads, because Google only paves one of them. `gcalUrl` builds the
   `render?action=TEMPLATE` link Google has published for years: it opens their
   event composer with the fields filled in, and it carries exactly one event.
   There is no bulk form of it. So a whole list travels as `.ics` — RFC 5545,
   which is what Google Calendar's *Settings → Import & export* reads, and what
   Outlook and Apple Calendar read as well.

   **Nothing here talks to Google.** No key, no OAuth, no server leg: the link
   is a URL the browser opens and the file is a Blob the browser saves. That is
   the whole reason this is the version that ships. A real sync would need a
   Google Cloud project, a client secret and somewhere to keep a refresh token,
   and a token that can write to somebody's calendar is a different class of
   thing from a dashboard that reads a holiday list.

   **All-day, always, and that is not a shortcut.** A holiday has no clock, and
   an event given a time is an event that moves: 15 August at 00:00 IST is the
   14th for anyone whose calendar is set west of here, and the day the plant is
   shut would show on the wrong day. `DTSTART;VALUE=DATE` and Google's
   `dates=YYYYMMDD/YYYYMMDD` are the date-valued forms, which have no timezone
   to be wrong about. In both of them **the end is exclusive** — a one-day
   holiday ends the following morning, and writing the same date twice produces
   an event Google quietly drops.
   --------------------------------------------------------------------------- */

/** `2026-08-15` → `20260815`. Takes the string the site stored rather than a
    Date: `holiday_date` arrives as `YYYY-MM-DD`, and parsing it into a Date to
    format it back out is only a chance to lose a day to the local offset. */
const stamp = (iso) => String(iso).slice(0, 10).replace(/-/g, "");

/** The morning after, which is where an all-day event ends.

    The one place a Date is used, because string arithmetic gets 31 December and
    28 February wrong. Built as UTC and read back as UTC — the pairing that
    cannot drift, whatever the browser's offset is. */
export function nextDay(iso) {
	const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

/** One event, opened in Google's own composer. Nothing is written to anybody's
    calendar until they press Save there, which is why this is a link and not a
    confirmation dialog: the last step happens on Google's screen, in their
    account, where it belongs. */
export function gcalUrl({ date, title, details = "", location = "" }) {
	const p = new URLSearchParams({
		action: "TEMPLATE",
		text: title,
		dates: `${stamp(date)}/${stamp(nextDay(date))}`,
	});
	if (details) p.set("details", details);
	if (location) p.set("location", location);
	return "https://calendar.google.com/calendar/render?" + p;
}

/* ------------------------------------------------------------------ the file */

/** RFC 5545 §3.3.11. A comma or a semicolon inside a summary is a field
    separator to a parser, so "Diwali, day 2" splits an event in half unless the
    comma is escaped. Backslash first, or it escapes the escapes. */
const esc = (s) =>
	String(s)
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Content lines are 75 **octets**, not 75 characters — a holiday named in
    Devanagari is three bytes a letter, and folding on character count writes
    lines a strict parser rejects. Continuation lines begin with one space,
    which the reader removes; the split must never land inside a UTF-8 sequence,
    hence the walk back off any `10xxxxxx` continuation byte. */
function fold(line) {
	const b = enc.encode(line);
	if (b.length <= 75) return line;
	const out = [];
	let start = 0;
	while (start < b.length) {
		/* 75 on the first line, 74 after it: the leading space counts. */
		let end = Math.min(start + (out.length ? 74 : 75), b.length);
		while (end > start + 1 && end < b.length && (b[end] & 0xc0) === 0x80) end--;
		out.push((out.length ? " " : "") + dec.decode(b.slice(start, end)));
		start = end;
	}
	return out.join("\r\n");
}

const slug = (s) =>
	String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

/** Stable, and that is the entire point of it. Google matches on `UID` when it
    imports, so re-importing a corrected list *updates* the days it already
    holds instead of laying a second copy over them. Derived from the date, the
    holiday and the list it came from, so the same day in the same list is the
    same UID on every export this app has ever written. */
const uid = (list, date, title) => `${stamp(date)}-${slug(title)}-${slug(list)}@manna-hrm`;

/** What to call the file. The list name as typed on the site, made safe for a
    filesystem — a holiday list is allowed a slash in its name and a download is
    not. */
export const icsName = (list) => slug(list || "holidays") + ".ics";

/** One holiday list as an importable calendar.

    `stampedAt` is injectable so a test can pin `DTSTAMP`; every caller in the
    app leaves it alone. */
export function icsFor(list, events, { stampedAt = new Date() } = {}) {
	const dtstamp = stampedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Manna HR//Holiday List//EN",
		"CALSCALE:GREGORIAN",
		/* PUBLISH, not REQUEST: this is a calendar being handed over, not an
		   invitation somebody has to answer. REQUEST would put an RSVP on every
		   national holiday in the file. */
		"METHOD:PUBLISH",
		"X-WR-CALNAME:" + esc(list),
	];

	events.forEach((e) => {
		lines.push(
			"BEGIN:VEVENT",
			"UID:" + uid(list, e.date, e.title),
			"DTSTAMP:" + dtstamp,
			"DTSTART;VALUE=DATE:" + stamp(e.date),
			"DTEND;VALUE=DATE:" + stamp(nextDay(e.date)),
			"SUMMARY:" + esc(e.title),
			"DESCRIPTION:" + esc(`From the ${list} holiday list in Manna HR.`),
			/* Free, not busy. A holiday is the day the office is shut, not a
			   meeting — marked busy it blocks every scheduling assistant that reads
			   the calendar, so nobody could be invited to anything on a day they
			   are perfectly able to attend from home. */
			"TRANSP:TRANSPARENT",
			"END:VEVENT",
		);
	});

	lines.push("END:VCALENDAR");
	/* CRLF between lines and one at the end, per §3.1. Some readers forgive a
	   bare LF and some hand back a file with one event in it. */
	return lines.map(fold).join("\r\n") + "\r\n";
}
