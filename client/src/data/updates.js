/* ---------------------------------------------------------------------------
   **Product Updates** — the third tab on Factor HR's Welcome page.

   Theirs is factoHR's release notes, written by the vendor, about a product
   Manna buys. This one is about the system Manna is building, which is the only
   honest thing that tab can hold here.

   Hand-written rather than generated from the git log, deliberately. A commit
   subject is written for whoever reads the diff; a release note is written for
   whoever has to change what they do on Monday. The two are not the same
   sentence, and a tab that showed the first would be read once and never again.

   Newest first. `on` is the day the change landed, `what` says what is
   different, and `who` says who has to do something about it — because a
   release note nobody can act on is an announcement.
   --------------------------------------------------------------------------- */

export const UPDATES = [
	{
		on: "2026-09-08",
		title: "The front page is Factor HR's Start Up, panel for panel",
		who: "Everyone",
		what: "This page is now laid out against Factor HR's own Welcome screen so the two can be "
			+ "read side by side: their Employees Summary, their six attendance buckets, their Quick "
			+ "Links and Quick Reports, their Payroll and F&F tiles, and their Wish Celebration. "
			+ "Panels of theirs with nothing behind them are drawn empty rather than left off — four "
			+ "of them are empty in Factor HR too, and that is worth being able to see.",
	},
	{
		on: "2026-09-08",
		title: "The fingerprint machines push their punches",
		who: "Whoever runs the bridge",
		what: "The bridge now listens on port 8081 for machines that post to it, instead of only "
			+ "dialling out to read them. A punch reaches the site in about two seconds rather than "
			+ "at the next poll. A machine whose serial nobody has registered is parked, never "
			+ "dropped, and released the moment it is added to the config — an unknown machine is "
			+ "not given an invented id, because that would let it skip the geofence.",
	},
	{
		on: "2026-09-08",
		title: "The pencil on Employee Profile edits the record here",
		who: "HR",
		what: "It used to open the ERPNext desk. It now opens the boxes on the page itself: one edit "
			+ "and one Save for the whole record, and only the fields that changed are written. A "
			+ "field this site has no column for gets no box at all, because Frappe accepts a key it "
			+ "does not have and drops it silently — which looks exactly like a save that worked.",
	},
	{
		on: "2026-09-08",
		title: "ERPNext is the only place data lives",
		who: "Anyone installing this",
		what: "All 21 doctypes were created on the site and the JSON copies were removed from the "
			+ "repo. The site owns the schema; export_from_site.py brings it back into the repo's "
			+ "layout, and check_schema.py checks the live site against what the code assumes.",
	},
];
