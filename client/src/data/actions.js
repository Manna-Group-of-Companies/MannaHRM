/* ---------------------------------------------------------------------------
   **The controls Factor HR puts on a page, read off their pages.**

   Captured 8 September 2026 by fetching seven of their screens signed in and
   listing every button, link-button and row icon on each: Employee Master,
   Attendance Regularization, Categories, Letter Types, Document Type, Manage
   Shift, Adhoc Payments/Deductions and Apply Leave.

   This is the vocabulary, not a guess at it. Every record page in this app now
   offers the same set, so somebody who used Factor HR every morning finds the
   same controls in the same places — and where one of them is missing here, the
   page says so rather than leaving a gap where a habit was.

   **What they have and this app deliberately narrows.** Their row menus carry
   `edit record` and `delete record` on every list, including lists of things
   that should not be deleted. This app draws Delete only where deleting is the
   right answer and prints the reason where it is not — `lib/write.NEVER_DELETE`
   is that list, and every entry on it is a record somebody is paid from or a
   record something else points at. That is not a missing feature; it is the one
   place this app knowingly refuses to copy them.
   --------------------------------------------------------------------------- */

/** Their control, what it does here, and where it sits.

    `where` is `bar` for the page toolbar, `row` for a control on each row, and
    `form` for one inside the record form. */
export const ACTIONS = [
	["Add New", "bar", "create",
		"Their New button. On Employee Master it reads Add New Employee, on Categories Add New, on "
		+ "Adhoc Payments it is Add — one control under three names. Opens a blank form."],
	["Search", "bar", "filter",
		"Their box filters the list that is on screen. It matches any column shown, because the "
		+ "column somebody is searching by is the one they can see."],
	["Apply", "bar", "filter",
		"Their filter panel's confirm. Here the filter takes effect as it is typed, so there is "
		+ "nothing to confirm — the control would be a click that changes nothing."],
	["Upload", "bar", "import",
		"Their Import Employees Excel. This app imports through the module that owns the records — "
		+ "Employee Master's ⋯ menu, Document Entry's importer, the category importer — because an "
		+ "import needs a column mapping and a preview, and a generic one has neither."],
	["Generate Report", "bar", "export",
		"Their download. Here it is Export CSV, and it writes the columns on screen: one column list "
		+ "for the table and the file, so the export cannot disagree with what somebody read."],
	["Edit record", "row", "edit",
		"Their pencil, on each row of a list. Opens the record in a form rather than editing in "
		+ "place — an inline editor saves on blur, which makes a mis-click a write."],
	["Delete record", "row", "delete",
		"Their bin, on each row. **Drawn here only where deleting is the right answer**, and reached "
		+ "through the record rather than from the list: a delete beside every row is a delete one "
		+ "slip away on a list somebody is scrolling."],
	["Save", "form", "save",
		"Theirs saves the whole document. This one sends only what changed — a whole-document write "
		+ "re-sends columns this reader may not write, and re-sends values that were current when "
		+ "the page loaded."],
	["Save with Remarks", "form", "save",
		"Employee Master's variant: a save carrying a note about why. Nothing here writes a remark "
		+ "against a change, because Frappe keeps its own Version trail of what changed and who "
		+ "changed it — what is missing is the why, and that is a field on the record."],
	["Submit", "form", "submit",
		"Freezes the document. **Not a save**: no field on it can be changed again, and the way back "
		+ "is cancel-and-amend, which leaves the original visible."],
	["Cancel", "form", "cancel",
		"Unwinds a submitted document and leaves it marked. This is the right answer to \"that was "
		+ "wrong\" — a cancelled document is a record that somebody made a mistake, and a deleted "
		+ "one is a hole where the evidence was."],
	["Show Details", "row", "open",
		"Their row expander. Here the row opens the record, which is the same information with an "
		+ "address that can be linked to."],
];

/** The ones that write. Drawn from the list above so the two cannot drift. */
export const WRITE_ACTIONS = ACTIONS.filter(
	(a) => ["create", "edit", "delete", "save", "submit", "cancel"].includes(a[2]),
);
