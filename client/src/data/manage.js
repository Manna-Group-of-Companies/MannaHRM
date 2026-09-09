/* ---------------------------------------------------------------------------
   **Where each of this app's fifteen record doctypes is managed.**

   Every one now has a page with Factor HR's own control set on it — Add New,
   Search, Generate Report, and a per-row edit and delete — drawn by
   `features/records/RecordList.jsx` from `data/schema.js`, which is generated
   from the doctype JSON the server installs.

   They sit in the module that owns them rather than in a settings screen of
   their own. A person adding a letter type is doing letter work, and a screen
   called "Doctypes" is a developer's model of the system rather than an HR
   one — Factor HR puts each of these on the menu it belongs to, and so does
   this.

   `note` is what the page says under the table: what the records are for and
   what nothing here can do about them. Several are the difference between a
   master somebody may edit freely and one that decides money.
   --------------------------------------------------------------------------- */

export const MANAGED = [
	/* ---- On Board ---- */
	["onboard", "lettertypes", "Letter Types", "Letter Type",
		"Factor HR's own first On Board menu item. Seventeen formats are loaded; the merge that "
		+ "renders one against a person's record is lib/letter.js. A type is named by its own title, "
		+ "so renaming one renames every letter that points at it."],
	["onboard", "doctypes", "Document Type", "Employee Document Type",
		"The list of documents this company keeps track of — passport, licence, contract. Document "
		+ "Entry files a scan against one of these, so a type deleted here is a filing cabinet with "
		+ "papers still in it; the site refuses while any exist."],
	["onboard", "docs", "Employee Documents", "Employee Document",
		"One filed document per row, with its issue and expiry dates. The scan itself is a private "
		+ "File on the site — never public, because a document scan is somebody's passport and a "
		+ "public file in Frappe is served to anyone who guesses the URL."],
	["onboard", "assetassign", "Asset Assignment", "Asset Assignment",
		"Who is holding which asset. Ours rather than stock, because ERPNext's Asset Movement has "
		+ "nowhere to keep the condition and the acknowledgement Factor HR's form carries."],

	/* ---- Employees ---- */
	["employees", "cattypes", "Category Types", "Employee Category Type",
		"Factor HR's Categories: the master lists an employee record is filed against. Adding a "
		+ "type here adds a column somebody can group and filter by everywhere else."],
	["employees", "changes", "Profile Change Requests", "Employee Profile Change Request",
		"What an employee has asked to have changed on their own record, and what an approver did "
		+ "about it. The row-level permission on this doctype is the reason manna_hr/permissions.py "
		+ "exists — a request is visible to the person who made it and to HR, and to nobody else."],
	["employees", "letters", "Employee Letters", "Employee Letter",
		"Every letter issued, as its text was stored. A letter that was issued exists whether or not "
		+ "this row does, which is why it is not deleted from here — if one was issued in error, the "
		+ "answer is a second letter."],

	/* ---- Attendance ---- */
	["attendance", "devices", "Attendance Devices", "Attendance Device",
		"The fingerprint machines, and the thing that decides whether a punch is trusted. **A device "
		+ "id that does not start with the trusted prefix is treated as a mobile punch and "
		+ "geofenced** — so renaming one here breaks its punches, and inventing one lets an unknown "
		+ "machine skip the fence. CLAUDE.md §5."],
	["attendance", "locations", "Work Locations", "Work Location",
		"The geofence: a coordinate and a radius per site. This is what a mobile punch is measured "
		+ "against, so a radius typed too wide is a punch accepted from the next town — and one "
		+ "typed too narrow refuses somebody standing at the gate, which CLAUDE.md §4 calls the "
		+ "expensive mistake."],
	["attendance", "corrections", "Attendance Regularization", "Employee Attendance Regularization",
		"The correction queue as records rather than as a queue. **Ours is the long name**: "
		+ "`Attendance Regularization` on this site belongs to the sales system next door, keyed to "
		+ "Sales Person, and writing to the short name puts an HR correction into a sales queue "
		+ "nobody reads."],

	/* ---- Loans ---- */
	["loans", "types", "Loan Types", "Employee Loan Type",
		"Salary advance, education loan, and what each may be lent against. The interest and the "
		+ "instalment rules live on the application, not here — see docs/DOCTYPES.md."],
	["loans", "apps", "Loan Applications", "Employee Loan Application",
		"On this site's design **the application is the loan**. Deleting one erases what has already "
		+ "been recovered from somebody's salary, so it is not deleted from here."],
	["loans", "repayments", "Loan Repayments", "Employee Loan Repayment",
		"A recovery that has happened. Deleting one makes the balance owed go up, silently, for a "
		+ "payment somebody actually made."],

	/* ---- Dashboard ---- */
	["dashboard", "notices", "Announcements & CEO Speak", "Manna Announcement",
		"The two panels on Factor HR's Welcome page, and **the only thing in this app read by people "
		+ "who did not go looking for it** — a published notice is in front of every employee who "
		+ "signs in and cannot be taken back from the ones who have read it. So Published is off "
		+ "until somebody means it, and the server refuses a notice with no body or a window that "
		+ "ends before it begins."],

	/* ---- Survey ---- */
	["survey", "surveys", "Surveys", "Employee Survey",
		"The questions, and whether answering is anonymous. **An anonymous survey is only anonymous "
		+ "if the server strips the name**, and on this site the controllers do not run — see "
		+ "CLAUDE.md §7. Do not promise anonymity from this screen until they do."],
	["survey", "responses", "Survey Responses", "Employee Survey Response",
		"What people answered. Read this beside the note on Surveys: the stripping that makes an "
		+ "anonymous response anonymous is a controller, and controllers are inert on a custom "
		+ "doctype."],
];

/** The doctype managed at one address, or "". */
export const managedAt = (section, subtab) =>
	(MANAGED.find((m) => m[0] === section && m[1] === subtab) || [])[3] || "";
