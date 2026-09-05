import { tidyDept } from "@/lib/format";

/* Factor HR's merge tokens, resolved case-insensitively.
   118 distinct tokens across 17 templates, and the same field appears as
   EmployeeName, employeename and EMPLOYEENAME - so the key is lowercased and
   stripped of spaces, dots and underscores, and case is re-applied on output. */
export const TOKENS = {
  employeename:e=>e.employee_name, employeefullname:e=>e.employee_name,
  empcode:e=>e.employee_number, employeecode:e=>e.employee_number,
  designation:e=>e.designation, department:e=>tidyDept(e.department), branch:e=>e.branch,
  doj:e=>e.date_of_joining, dateofjoining:e=>e.date_of_joining, pastdateofjoining:e=>e.date_of_joining,
  dol:e=>e.relieving_date, dateofleaving:e=>e.relieving_date,
  dateofbirth:e=>e.date_of_birth, gender:e=>e.gender,
  nationality:e=>e.custom_nationality, maritalstatus:e=>e.marital_status,
  fathername:e=>e.custom_father_name, employeesfathername:e=>e.custom_father_name,
  employeefathername:e=>e.custom_father_name,
  employeespousename:e=>e.custom_spouse_name, employeesreligion:e=>e.custom_religion,
  employeeaddress:e=>e.current_address||e.permanent_address,
  employeepermanentaddress:e=>e.permanent_address,
  mobileno:e=>e.cell_number, mobile:e=>e.cell_number, employeemobileno:e=>e.cell_number,
  email:e=>e.company_email||e.personal_email, employeeemail:e=>e.company_email||e.personal_email,
  employeepanno:e=>e.custom_pan_no, employeeidentitypanno:e=>e.custom_pan_no,
  employeebankname:e=>e.bank_name, employeebankaccountno:e=>e.bank_ac_no,
  passportno:e=>e.passport_number,
  companyname:e=>e.company, company:e=>e.company,
  grosssalary:e=>e.ctc, currencysymbol:()=>"₹", currencytitle:()=>"Rupees",
  employeetitle:e=>(e.gender==="Female"?"Ms.":"Mr."), title:e=>(e.gender==="Female"?"Ms.":"Mr."),
  hisher:e=>(e.gender==="Female"?"Her":"His"),
  currentdate:()=>new Date().toISOString().slice(0,10),
};
/* The document fields ERPNext ships on Employee, which is all Document Entry
   has to stand on until a doctype of its own exists. Counted live, because
   "the field exists" and "the field is filled" are different findings and only
   the second one decides whether expiry tracking can be switched on. */
export const EMP_DOC_FIELDS = [
  ["passport_number", "Passport number"],
  ["valid_upto",      "Passport valid upto"],
  ["date_of_issue",   "Date of issue"],
  ["place_of_issue",  "Place of issue"],
];

/* Read off Factor HR's export on 25 Aug 2026 and backfilled into Employee.
   Fixed rather than queried only when the live read comes back without the
   custom fields — see loadOnBoard. */
export const DOC_BACKFILL = [
  ["custom_nationality",       "Nationality",       126],
  ["custom_confirmation_date", "Confirmation date",  72],
  ["custom_pan_no",            "PAN number",          2],
  ["custom_father_name",       "Father&rsquo;s name", 0],
  ["custom_mother_name",       "Mother&rsquo;s name", 0],
  ["custom_spouse_name",       "Spouse&rsquo;s name", 0],
  ["custom_religion",          "Religion",            0],
];

/* ---------------------------------------------------------------------------
   Factor HR's **Document** screen, photographed 3 September 2026 — the second
   half of what their menu calls Document Management, and the screen this page
   had been saying nobody had opened.

   It is not one register. It is **three**, stacked down a single page, each
   with its own type filter, its own columns and its own pager: Employee,
   Dependant, Company. That is the shape of the finding, because two of the
   three have nothing behind them on this side at all.

   What their capture holds:

     Employee   11 documents, every one of them **National Id**, over three
                pages of five.
     Dependant  0.
     Company    0.

   Eleven, against the 504 employees in the same tenant. So their document
   register is not a system of record anybody has been filling in either — it
   is 2% covered, and the coverage panel underneath this screen says the same
   thing about ours from the other direction.

   **The document numbers themselves are deliberately not in this repo.** Five
   are legible in the capture and they are national identity numbers of named
   people; the counts and the types are the finding, and the numbers add
   nothing to it that is worth keeping in source control.

   The headline: **this site's `Employee` has no national-id field at all** —
   checked against the live doctype on 31 August 2026, see EMP_LIST_COLS in
   data/masters.js. Their entire register is National Id. So none of the eleven
   rows has anywhere to land here, and the two document numbers this side can
   hold — passport and PAN — are of types their register does not carry one of.
   The two lists do not overlap by a single row. */

/** What their capture holds, per register. Counts and types only — see above. */
export const FH_DOCS = {
	employee:  { total: 11, types: [["National Id", 11]] },
	dependant: { total: 0,  types: [] },
	company:   { total: 0,  types: [] },
};

/** Their pager: five rows to a page, which is what makes eleven three pages. */
export const DOC_PAGE = 5;

/* The document kinds this side can actually produce a row for.

   A document on their screen is a row of its own; here it is a pair of fields
   on `Employee`, so the register below is *synthesised* — one row per employee
   per field that is filled. That is the whole difference between the two
   models and it is why nothing here can hold two passports for one person.

   `state` is what stands behind the kind:
     live  — read off the site today.
     stock — the field is on the doctype and only a full read carries it, so it
             reads "not read" rather than empty when `docTier` is not "full".
     build — their type, and no field of any name on this side. */
export const DOC_KINDS = [
	{
		key: "passport", label: "Passport", state: "live",
		num: "passport_number", exp: "valid_upto",
		/* The other two boxes on their Document Entry form, and passport is the
		   only kind here that has either. ERPNext ships all four as one block on
		   Employee — number, valid upto, date of issue, place of issue — which is
		   why this one type fills their form and PAN fills three boxes of eight. */
		iss: "date_of_issue", place: "place_of_issue",
		why: "ERPNext's own `passport_number` on Employee, with `valid_upto` beside it — the one document "
			+ "type this side can both number and expire. Their register does not carry a single one.",
	},
	{
		key: "pan", label: "PAN", state: "stock", num: "custom_pan_no",
		why: "`custom_pan_no`, added as a Custom Field on 25 Aug 2026 and carried only by the long read. "
			+ "A PAN has no expiry, so that column is empty on these rows as a fact rather than as a gap.",
	},
	{
		key: "national", label: "National Id", state: "build",
		why: "Every one of the eleven documents on their screen is this type, and this site's Employee has "
			+ "no field for it under any name — checked against the live doctype on 31 Aug 2026. Adding one "
			+ "is a Custom Field and worth asking about first: it is the most sensitive identifier on the "
			+ "form and the one with the most rules attached to holding it.",
	},
];

/** Their three registers, in their order, with their columns in their words.

    `back` is what this side puts behind the register; a register with none is
    drawn empty and says why rather than being left off the page. */
export const DOC_REGISTERS = [
	{
		key: "employee", label: "Employee", state: "part",
		cols: ["type", "no", "emp", "expiry", "remark"],
		back: "Employee",
		why: "Synthesised off the Employee master — one row per document field that is filled. There is no "
			+ "Document doctype on this site, so there is no row to read; a document here is a field on a "
			+ "person.",
	},
	{
		key: "dependant", label: "Dependant", state: "none",
		cols: ["type", "no", "emp", "dep", "expiry", "remark"],
		why: "A dependant's own paperwork — their passport, their id. Nothing on this site holds a "
			+ "dependant at all: ERPNext keeps next-of-kin as free text on the Employee form and has no "
			+ "dependant record for a document to hang off. Theirs is empty too, so nothing is being lost "
			+ "today — but the record has to exist before the document can.",
	},
	{
		key: "company", label: "Company", state: "none",
		cols: ["type", "no", "expiry", "remark"],
		why: "The company's own certificates — registration, licences, the things with renewal dates that "
			+ "somebody is meant to be watching. ERPNext's Company doctype has no document table and no "
			+ "expiry anywhere on it. Theirs is empty as well, which means the renewal dates are being kept "
			+ "wherever they were before either system.",
	},
];

/** Their column headings, their words and their order, and what backs each. */
export const DOC_COLS = {
	type:   { label: "Document Type", state: "live" },
	no:     { label: "Document No.",  state: "live" },
	emp:    { label: "Employee",      state: "live" },
	dep:    { label: "Dependant",     state: "build" },
	expiry: { label: "Expiry Date",   state: "live" },
	remark: { label: "Remark",        state: "build" },
};

/* ---------------------------------------------------------------------------
   Factor HR's **Document Entry** dialog, photographed 4 September 2026 — what
   opens behind the eye on a row of the register above.

   Eight boxes, three to a row, with Remarks across the bottom. Their capture is
   of a National Id belonging to HPT-001, and four of the eight are empty on it:
   Expiry Date, Issue Place, Issue Date and Remarks. That is worth saying before
   anything else, because it means their own register is not carrying the
   renewal dates either — the screen has the boxes and nobody fills them, which
   is the same finding this dashboard keeps arriving at from the other side.

   `get` fills a box from a synthesised register row. Three answers, and the
   dialog has to tell them apart:

     a value        the field is there and filled.
     ""             the field is there and empty on this record.
     null           **this document type has no such field at all.**

   The third is the one that matters and it is why `get` returns null rather
   than "" for a missing field. A PAN has no issue date on this side — not an
   empty one, none: `custom_pan_no` is a single Custom Field with nothing beside
   it, where `passport_number` arrives as a block of four. Drawing both as an
   empty box would say that somebody has not filled the PAN's issue date in,
   which is a filing complaint about a field that does not exist.

   Related To is the register the row came from and is the one box here that is
   not read off anything: this side has one register with rows in it, so the
   answer is always Employee. It is drawn rather than dropped because their
   dialog opens the same way from all three of theirs, and a box that is
   constant here is only constant because two of those three are empty. */
export const DOC_VIEW = [
	{ key: "related", label: "Related To", get: () => "Employee",
		why: "Which of their three registers the row is in. Always Employee here — Dependant and Company "
			+ "have nothing behind them on this site, so no row can come from either." },
	{ key: "employee", label: "Employee", get: (r) => (r.code ? `${r.code} - ${r.emp}` : r.emp),
		why: "`employee_number` and `employee_name`, joined the way their box shows them. Their capture "
			+ "reads HPT-001 - CHARLEYS JOSEPH; the codes on this site are MRI‑series." },
	{ key: "type", label: "Document Type", get: (r) => r.type,
		why: "Which document this row is. A type on their side is a row in the Document Type master; here "
			+ "it is which field on Employee the number was read from — see DOC_KINDS above." },
	{ key: "no", label: "Document No", mono: true, get: (r) => r.no,
		why: "The number itself, off the field this row was synthesised from. The one box on this form "
			+ "that is filled on every row, because a row exists only where it is." },
	{ key: "expiry", label: "Expiry Date", kind: "date", get: (r) => r.expiry,
		why: "`valid_upto`, on a passport. Empty on their own capture too — the box is theirs and the "
			+ "blank is everybody's." },
	{ key: "place", label: "Issue Place", get: (r) => r.place,
		why: "ERPNext's `place_of_issue`, which arrives with the passport block on Employee." },
	{ key: "issue", label: "Issue Date", kind: "date", get: (r) => r.issue,
		why: "ERPNext's `date_of_issue`, from the same block." },
	{ key: "remarks", label: "Remarks", wide: true, get: () => null,
		why: "A note against this one document. Nothing on this side holds one: a document here is a "
			+ "number on a person, and Employee has no field for a remark about a single number. It is "
			+ "empty on their capture as well, which is the more interesting half — the box exists there "
			+ "and is not used." },
];

/* ---------------------------------------------------------------------------
   Factor HR's **Assets Details** entry form, photographed 3 September 2026 —
   the first time that screen has been seen, so the page it lands on has said
   "Never screenshotted" until today.

   Thirteen boxes, in their order and their two-column layout. `get` is what
   fills one from an ERPNext `Asset`; a box with no `get` is one nothing on this
   side answers, and `why` is what it would take.

   The split is three ways and it is the whole finding of this form:

     live   — the box is filled from a field the register already reads.
     stock  — the field is ERPNext's own and was added to our `Asset` on
              3 Sep 2026 *because of this screenshot*. Quantity, Rate's other
              half, Warranty Date, Vendor Name and Serial Number are all real
              Asset fields nobody here had asked for yet.
     build  — Detail, Qty On Hand and Attachment. These are not on ERPNext's
              Asset under any name, and two of them are not asset facts at all:
              Qty On Hand is a stock level, which lives on Bin against an Item,
              and Attachment is Frappe's File table hanging off any document.
              Drawn and dead, because a box quietly dropped is a box nobody
              remembers to ask about.

   `w` is how wide the box is drawn, measured off the capture rather than
   chosen here — and it is also what decides the pairing, because on their form
   the two are the same fact: `lg` for the three that run the width of their
   form, `sm` for the eight short ones that sit two to a row (Quantity | Rate,
   Qty On Hand | Value, and so on), `md` for Code, which is the one box
   that is neither. The two columns of equal short boxes are most of why
   their form reads as tidy, and a box sized to its own content would lose
   it. */
export const ASSET_FORM = [
	{ key: "item_code", w: "md", label: "Code", state: "live", get: (a) => a.item_code,
		why: "ERPNext's `item_code` — what kind of thing this is, not which one." },
	{ key: "asset_name", w: "lg", label: "Name", state: "live", get: (a) => a.asset_name,
		why: "`asset_name`, the register's own first column." },
	{ key: "asset_category", w: "lg", label: "Asset Type", state: "live", get: (a) => a.asset_category,
		why: "`asset_category`. Theirs has an Add Asset Types link beside it, which is a master — so ours opens that master on the site." },
	{ key: "detail", w: "lg", label: "Detail", state: "build", area: true,
		why: "A free-text note about the asset. ERPNext's Asset has no such field under any name, so there is nothing to read and nowhere to put one without adding a field to the doctype." },
	{ key: "asset_quantity", w: "sm", label: "Quantity", state: "stock", get: (a) => a.asset_quantity,
		why: "ERPNext's `asset_quantity`. Stock on their doctype and now on ours; most assets are 1, a few were bought as a batch." },
	{ key: "rate", w: "sm", label: "Rate", state: "stock",
		get: (a) => (a.gross_purchase_amount && a.asset_quantity
			? Math.round(a.gross_purchase_amount / a.asset_quantity)
			: a.gross_purchase_amount),
		why: "Not a stored field on either side — `gross_purchase_amount ÷ asset_quantity`. Computed rather than kept, so it cannot disagree with the value beside it." },
	{ key: "qty_on_hand", w: "sm", label: "Qty On Hand", state: "build",
		why: "A stock level, not an asset fact. In ERPNext this is Bin against an Item and moves with every receipt and issue; an Asset is one capitalised thing and has no on-hand quantity." },
	{ key: "gross_purchase_amount", w: "sm", label: "Value", state: "live",
		get: (a) => a.gross_purchase_amount,
		why: "`gross_purchase_amount`, at purchase. Not depreciated — Asset Category carries the schedule and none is loaded." },
	{ key: "warranty_expiry_date", w: "sm", label: "Warranty Date", state: "stock", kind: "date",
		get: (a) => a.warranty_expiry_date,
		why: "ERPNext's `warranty_expiry_date`. An expired one is the row somebody actually needs, the same way an expired passport is on Document Entry." },
	{ key: "purchase_date", w: "sm", label: "Purchase Date", state: "live", kind: "date",
		get: (a) => a.purchase_date,
		why: "`purchase_date`. It was in the register's field list already and never arrived — see AST_FULL in api/load.js." },
	{ key: "serial_no", w: "sm", label: "Serial Number", state: "stock", get: (a) => a.serial_no,
		why: "ERPNext's `serial_no` on Asset. Blank on about half of them, and that is a fact about the asset rather than a gap: a chair has no serial number." },
	{ key: "supplier", w: "sm", label: "Vendor Name", state: "stock", get: (a) => a.supplier,
		why: "ERPNext's `supplier`. A Link to the Supplier master there; plain text here, because no Supplier master is loaded and a Link with nothing behind it is worse than a name." },
	{ key: "attachment", label: "Attachment", state: "build",
		why: "Frappe keeps attachments in the File doctype against any document, so there is no field on Asset to read. Uploading is a write, and nothing on this dashboard writes." },
];

/** Three of their thirteen have nothing behind them anywhere. Counted here so
    the page and the panel under it cannot disagree about how many. */
export const ASSET_FORM_GAPS = ASSET_FORM.filter((f) => f.state === "build").length;

/** Which of the thirteen boxes can be typed into.

    **The same nine as `ASSET_FIELDS` in server/src/doctypes/registry.ts, and
    that file is the one that decides.** This list only stops the form offering
    a box the server would refuse — a control enforced in a browser is a
    suggestion to anyone holding curl, which is why the server keeps its own and
    answers `FieldNotWritable` by name. If the two ever disagree, the server
    wins and the box goes red on Save rather than quietly doing nothing.

    The four that are missing are missing for two different reasons, and the
    boxes say which on hover: Detail, Qty On Hand and Attachment have no field
    on ERPNext's `Asset` under any name, and Rate is not stored on either side
    — it is `gross_purchase_amount / asset_quantity`, so writing it would mean
    deciding which of the two it changed. It follows what is typed into those
    two instead, live. */
export const ASSET_WRITABLE = new Set([
	"item_code", "asset_name", "asset_category", "asset_quantity",
	"gross_purchase_amount", "warranty_expiry_date", "purchase_date",
	"serial_no", "supplier",
]);

/* ---------------------------------------------------------------------------
   Factor HR's **Assets Assignment** entry form, photographed 3 September 2026 —
   the same day as Assets Details, and the second half of the same answer. That
   page turned out to be a record form with the register behind Search; this one
   is a *person* screen: their employee bar at the top, an ASSETS table of what
   that person is holding, and these fifteen boxes under it.

   So the two screens are not two views of one list. Assets Details is the asset;
   Assets Assignment is the handover — when it went out, when it is due back,
   what came back, and what did not.

   Fifteen boxes, in their order and their three-to-a-row layout. `get` fills one
   from `{ asset, issue, receipt }` — the asset, and the Asset Movements that put
   it with this person and took it back. A box with no `get` is one nothing on
   this side answers, and `why` is what it would take.

   The split is the same three ways as ASSET_FORM, and it lands very differently:

     live   — six boxes, off fields already read. Three are the asset, two are
              the movement dates, one is the code.
     stock  — two, from the Asset fields added on 3 Sep for the form on the page
              before. Assign Units is the awkward one and says so.
     build  — seven, and they are the finding. **Factor HR's assignment carries a
              validity, a return, a loss and a recovery amount; ERPNext's Asset
              Movement carries none of the four.** Over there a handover is a
              little contract with a date on it. Here it is two rows in a log —
              an Issue, and later a Receipt — with no end date, no unit count and
              no money on either. Neither shape is wrong, but they are not the
              same shape, and anybody planning to move this data needs to know
              that before the export rather than after it. */
export const ASSIGN_FORM = [
	{ key: "asset_status", label: "Asset Status", state: "live",
		get: (c) => c.asset?.status,
		why: "`status` on the asset — In Use, Available, Scrapped. A dropdown on their form; here it is what the register already says." },
	{ key: "asset_type", label: "Asset Type", state: "live",
		get: (c) => c.asset?.asset_category,
		why: "`asset_category`, the same master Assets Details links to." },
	{ key: "assets", label: "Assets", state: "live",
		get: (c) => c.asset?.asset_name,
		why: "`asset_name`. Their third dropdown narrows to the type above it; ours is filled by picking a row from the table." },
	{ key: "serial_no", label: "Serial Number", state: "stock",
		get: (c) => c.asset?.serial_no,
		why: "ERPNext's `serial_no` on Asset. Blank on about half of them, and that is a fact about the asset rather than a gap — a chair has no serial number." },
	{ key: "assign_units", label: "Assign Units", state: "stock",
		get: (c) => c.asset?.asset_quantity,
		why: "Read off `asset_quantity`, and it is not quite the same question. That is how many were capitalised together; theirs is how many of them went out with this person. ERPNext moves a whole Asset, so issuing 3 of a batch of 12 has nowhere to be recorded." },
	{ key: "assign_date", label: "Assign Date", state: "live", kind: "date",
		get: (c) => c.issue?.transaction_date,
		why: "The `transaction_date` of the Asset Movement that issued it. Read live since 3 Sep 2026 — before that the movement list carried only a date and a purpose, which could not say whose." },
	{ key: "valid_till", label: "Valid Till", state: "build", kind: "date",
		why: "Nothing holds it. An ERPNext handover ends when a second movement brings the asset back, so there is no date set in advance to read — the difference between a log and a little contract." },
	{ key: "return_unit", label: "Return Unit", state: "build",
		why: "A return in ERPNext is a Receipt movement of the whole asset, not a count of units coming back. Same reason as Assign Units, one step later." },
	{ key: "returned_on", label: "Returned On", state: "live", kind: "date",
		get: (c) => c.receipt?.transaction_date,
		why: "The `transaction_date` of the Receipt movement that took it back, when there is one. Empty means it is still out — which is what the custodian on the asset says too." },
	{ key: "lost_units", label: "Lost Units", state: "build",
		why: "Nothing holds it. ERPNext writes off an asset by scrapping it, which is an accounting entry against the whole asset rather than a count against a person." },
	{ key: "lost_on", label: "Lost On", state: "build", kind: "date",
		why: "The date of that write-off is `disposal_date` on Asset, which is set by scrapping and not by anybody saying a laptop went missing. It is not on our Asset at all, so the box is drawn dead rather than filled from something adjacent." },
	{ key: "recovery_amount", label: "Recovery Amount", state: "build",
		why: "Money recovered from somebody who lost kit is a payroll deduction — a salary component on their next slip. It is not a field on any asset doctype, here or there, and putting a figure on this form would be the one number nobody could act on." },
	{ key: "remarks", label: "Remarks", state: "build", area: true,
		why: "Asset Movement has no remarks field. Frappe hangs Comments off any document instead, which is a different thing: a comment is signed and dated and cannot be edited into agreement later." },
	{ key: "assets_detail", label: "Assets Detail", state: "build", area: true,
		why: "The same box Assets Details greys out, for the same reason: a free-text note about the asset, which ERPNext's Asset has no field for under any name. Theirs is greyed on their own screen too." },
	{ key: "assets_code", label: "Assets Code", state: "live", area: true,
		get: (c) => c.asset?.item_code || c.asset?.name,
		why: "`item_code`, falling back to the asset's own name. Greyed on their form because the picker fills it rather than a typist; read-only here rather than greyed, because it holds a real value somebody may want to copy and a disabled box cannot be selected." },
];

/** How many of their fifteen have nothing behind them anywhere. Counted here so
    the form and the note under it cannot disagree about the number. */
export const ASSIGN_FORM_GAPS = ASSIGN_FORM.filter((f) => f.state === "build").length;
