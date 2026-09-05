import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { DOC_COLS, DOC_KINDS, DOC_PAGE, DOC_REGISTERS, DOC_VIEW, FH_DOCS } from "@/data/onboard";
import { Desk, FieldChip, Modal, Scroll, panelProps, tabProps } from "@/components/ui";
import { daysTo, docRows, onboardWait } from "@/features/onboard/shared";
import { deskUrl } from "@/lib/desk";
import { dmy, fmt } from "@/lib/format";
import { patch, useApp } from "@/store";
import { apiDeleteFile, apiUpload, apiWrite } from "@/api/client";
import DocImport, { template as docTemplate } from "@/features/onboard/DocImport";
import DocScans, { structure as docStructure } from "@/features/onboard/DocScans";
import { loadOnBoard } from "@/api/load";

/* ---------------------------------------------------------------------------
   Factor HR's **Document** screen, photographed 3 September 2026, drawn here
   register for register.

   Three of them down one page — Employee, Dependant, Company — each with a
   folder heading, a row of type pills counting what is in it, its own columns
   and its own pager of five. See DOC_REGISTERS in data/onboard.js for what
   their capture holds and why the numbers in it are not in this repo.

   **The two registers do not overlap by a single row.** Their eleven documents
   are all National Id, and this site's Employee has no national-id field of any
   name; the two numbers this side can hold, passport and PAN, are of types
   their register carries none of. So the Employee register below is drawn from
   ours and is not a picture of theirs — it is what the same screen would show
   pointed at this site, which is the only comparison worth making.

   A document here is *not a row*. It is a pair of fields on `Employee`, so the
   register is synthesised: one row per person per field that is filled. That is
   the finding this screen produces, and it has consequences worth saying out
   loud — nothing on this side can hold two passports for one person, or record
   who uploaded one.

   **The scan is the one of those that has since been fixed.** Their paperclip
   column is the scan, and it was drawn dead here on the argument that Frappe
   hangs an attachment off a document while a document here is only a field.
   That was half right: `File` hangs off a document *and a field* —
   `attached_to_field` is ERPNext's own column — so a passport scan attaches to
   `Employee / HR-EMP-00007 / passport_number` and the synthesised row finds it
   by the same pair it was synthesised from. See doctypes/file.ts.

   So the clip is live on a row that has one and dead on a row that has not,
   and the two dead states are different sentences: nothing attached is a filing
   job, and the read was refused is a bug. Clicking it opens their small list —
   the file, Download, Open — and nothing else on the row moves.

   What the toolbar can and cannot do splits the way it does everywhere here.
   Search, the type pills and the pager act on rows already in the browser, so
   they work. Refresh re-reads the site. Add, Upload and Settings are writes, or
   masters with nothing behind them, and are drawn dead with the reason on them
   rather than left off. Import opens ERPNext's Data Import on the site, which
   is where a spreadsheet of document numbers would actually go.
   --------------------------------------------------------------------------- */

const Ic = ({ d }) => (
	<svg viewBox="0 0 24 24">
		<path d={d} />
	</svg>
);

/* Their six toolbar glyphs in their order, then the four row actions. */
const D = {
	search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
	plus: "M12 5v14M5 12h14",
	up: "M12 19V7M8 11l4-4 4 4M5 4h14",
	imp: "M14 4h6v16h-6M11 12H3M7 8l4 4-4 4",
	ref: "M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4",
	cog: "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21"
		+ "M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8",
	clip: "M20 11l-8 8a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8",
	eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
	pencil: "M4 20h4L20 8l-4-4L4 16Z",
	bin: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
	folder: "M4 6h6l2 2h8v10H4Z",
	dl: "M12 3v11M8 10l4 4 4-4M4 19h16",
};

/* Their + adds a document row. There is still no Document doctype here to add
   one to — that half of the old note was right and has not changed — so what
   it opens is the same form the pencil opens, empty, with the two boxes the
   pencil leaves fixed turned on. Picking a person and a type is choosing which
   field on which record the number goes in, which is what adding a document is
   on this side. */
const ADD_WHAT = "Add a document. It opens Factor HR's Document Entry form empty — pick an employee "
	+ "and a type, and the number is written to that field on that person. One passport per employee: "
	+ "a document here is a field, so somebody who already has one is edited rather than added to.";

const BG_SCAN_DEAD = "The same upload, handed to a queue that runs it after you have closed the tab. "
	+ "There is no queue on this side — a folder of four hundred scans is uploaded from this page, one "
	+ "after another, with the count on the button. Closing the tab stops it, and what is filed stays.";

const BG_DEAD = "The same import, handed to a queue that runs it after you have closed the tab and "
	+ "mails when it is done. There is no queue on this side and nothing to send mail from — the import "
	+ "above runs here, with its count on the button, which is what that mail would have said.";

const COG_DEAD = "Their gear opens the Document Type master, the other half of what their menu calls "
	+ "Document Management. There is no such master here: the three types this page can draw are three "
	+ "fields on Employee, and adding a fourth is a Custom Field rather than a row in a list.";

/* The three things a paperclip can mean, and they are three sentences rather
   than one greyed icon. "Nothing is attached" and "nothing was read" are the
   distinction this whole dashboard is built on, and the clip is the smallest
   place it shows up. */
const CLIP_NONE = "No scan is attached to this document. The clip is live on the rows that have one — "
	+ "this is a filing gap rather than a missing feature, and see the Upload button for why it cannot be "
	+ "closed from here.";

const CLIP_UNREAD = "The attachments could not be read, so this clip cannot say whether there is a scan "
	+ "behind it. That is not the same as there being none, which is why it is dead rather than empty.";

/* Their bin deletes a row. There is still no row here to delete — that part of
   the old note was right and has not changed — but the act it stands for is a
   real one, so the control does it and the dialog behind it says what it is:
   the fields the row was synthesised from are cleared, and the scans filed
   against them are deleted. */
const BIN_WHAT = "Delete this document. There is no row to remove here — the number is a field on the "
	+ "employee — so this clears that field and the ones that go with it, and deletes any scan filed "
	+ "against them. It asks first, and it cannot be undone.";

const NOT_READ = "This field is on the doctype and was not in the read that answered, so nothing is "
	+ "claimed for it. A count of zero and an unasked question look identical and mean opposite things.";

/** Every document this side holds, as their register would list them: one row
    per employee per document field that is filled.

    Sorted by employee code rather than by type — that is the order their
    capture is in, and the order somebody looking for a person needs. */
function ourDocs(rows, full) {
	const out = [];
	for (const e of rows) {
		for (const k of DOC_KINDS) {
			/* A type with no field behind it produces no rows and is not a gap in
			   this loop — it is the pill drawn dead above the table. */
			if (!k.num) continue;
			/* Not read is not the same claim as not filled in, and only the tier
			   can tell them apart. See DOC_KINDS and loadOnBoard. */
			if (k.state === "stock" && !full) continue;
			const no = e[k.num];
			if (no == null || no === "") continue;
			out.push({
				id: e.name + ":" + k.key,
				kind: k.key,
				type: k.label,
				no: String(no),
				emp: e.employee_name || e.name,
				code: e.employee_number || "",
				/* `null` where the *type* has no such field, `""` where it has one
				   and this record leaves it blank. Their Document Entry dialog
				   turns on that distinction — an empty box says somebody has not
				   filled it in, and saying that about a field which does not exist
				   is a filing complaint about nothing. See DOC_VIEW. */
				expiry: k.exp ? e[k.exp] || "" : null,
				issue: k.iss ? e[k.iss] || "" : null,
				place: k.place ? e[k.place] || "" : null,
				name: e.name,
				/* For the dot on their Employee box, which is a status light. */
				status: e.status || "",
				/* The field this row was synthesised from, carried rather than
				   re-derived: it is half the key the scans are filed under, and
				   `id` above uses the kind rather than the field so the two are
				   not interchangeable. */
				field: k.num,
			});
		}
	}
	return out.sort((a, b) => (a.code || "zz").localeCompare(b.code || "zz"));
}

/* The type pills are a real tab strip over the table under them, so they carry
   `tabProps` rather than a bare `aria-selected` — see the note above them in
   components/ui.jsx, which is about this exact mistake. One stop on the tab key,
   arrows across the pills, and the table below says which pill opened it. */
const TAB = (k) => "doctype-" + k;
const PANEL = "docreg-employee";

/* One array for every row with nothing attached, so a re-render does not hand
   sixty rows sixty new empty arrays to compare against. */
const NO_FILES = [];

/** Their type filter: a pill per document type with its count on it, All in
    front. A type this side cannot produce a row for is still drawn — at zero,
    dead, with the reason — because which types exist on which side is the whole
    finding, and a pill quietly left off is the one nobody asks about. */
function Types({ rows, full, pick, on }) {
	return (
		<div className="tabs docpills" role="tablist" aria-label="Document type">
			<button className="tab" {...tabProps(TAB("all"), PANEL, !pick)} onClick={() => on("")}
				title="Every document type this side holds.">
				All <span className="n">({fmt(rows.length)})</span>
			</button>
			{DOC_KINDS.map((k) => {
				const n = rows.filter((r) => r.kind === k.key).length;
				const unread = k.state === "stock" && !full;
				const dead = k.state === "build" || unread;
				return (
					<button key={k.key} className="tab" {...tabProps(TAB(k.key), PANEL, pick === k.key)}
						disabled={dead} title={unread ? NOT_READ : k.why}
						onClick={() => on(k.key)}>
						{k.label} <span className="n">({unread ? "not read" : fmt(n)})</span>
					</button>
				);
			})}
		</div>
	);
}

/** Their pager: the page numbers, then Last. Five rows to a page, which is what
    makes their eleven documents three pages. */
function Pager({ page, pages, go }) {
	if (pages < 2) return null;
	/* Their capture shows every number, because eleven documents is three of
	   them. Ours could be a hundred pages of passports, so the run is capped and
	   follows where you are — the alternative is a footer wider than the table
	   it belongs to. */
	const from = Math.max(1, Math.min(page - 3, pages - 6));
	const nums = [];
	for (let p = from; p <= Math.min(pages, from + 6); p++) nums.push(p);
	return (
		<div className="docpage">
			{nums.map((p) => (
				<button key={p} className="embtn" aria-current={p === page ? "page" : undefined}
					aria-label={`Page ${p}`} onClick={() => go(p)}>
					{p}
				</button>
			))}
			<button className="embtn" disabled={page >= pages} onClick={() => go(pages)}>Last</button>
		</div>
	);
}

/** How big the scan is, in the two units anybody reads. Bytes are the honest
    number and nobody wants them; a file with no size recorded says so rather
    than reading as an empty one. */
function size(bytes) {
	if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The paperclip, and what hangs off it.

    **Their popover, opened only on the click.** It is not a dialog: the page
    behind it is not dimmed, the tab key is not trapped, and the row it belongs
    to stays exactly where it was. That is the right weight for what it holds —
    a file, and the two things anybody does with one.

    Download and Open are two anchors at one URL and differ by a header, which
    is why the server serves them rather than `express.static`: Download that
    opens a passport scan in a tab instead of saving it is a control people
    click twice and then stop trusting. `?name=` carries what the file should be
    saved as, because the name on disk is the record and the field — unique, and
    not what anybody wants in their downloads folder.

    Both open on this origin. The page and the API are one origin on purpose,
    and a scan fetched from somewhere else would be the only thing on the screen
    that is not — see api/client.js. */
function Clip({ r, files, unread, open, onToggle }) {
	const btn = useRef(null);
	const [at, setAt] = useState(null);

	/* **Positioned against the viewport, not against the cell.** The register
	   lives in a `.scroll`, and `overflow-x: auto` clips on *both* axes — CSS
	   computes the other one to `auto` the moment either is not `visible` — so
	   an absolutely-positioned panel opened on the last row of a page is cut off
	   at the bottom of the table and adds a vertical scrollbar to it.

	   `position: fixed` is the escape: it is measured off the button's rect and
	   is not clipped by an overflow ancestor. It would still be clipped by a
	   `transform` on one, which nothing above this has — worth knowing before
	   adding one.

	   `useLayoutEffect` rather than `useEffect`, because this runs between the
	   render and the paint: on `useEffect` the panel is drawn once at the top
	   left of the window and then jumps to the clip, which is visible and reads
	   as a bug.

	   Flipped above the clip when there is not room below it. The height is
	   estimated from the row count rather than measured — measuring means
	   rendering it somewhere first, and the estimate only decides which side of
	   the icon it opens on. */
	useLayoutEffect(() => {
		if (!open || !btn.current) return;
		const b = btn.current.getBoundingClientRect();
		const tall = 52 + files.length * 46;
		const below = window.innerHeight - b.bottom;
		setAt(below < tall && b.top > below
			? { right: Math.max(8, window.innerWidth - b.right), bottom: window.innerHeight - b.top + 6 }
			: { right: Math.max(8, window.innerWidth - b.right), top: b.bottom + 6 });
	}, [open, files.length]);

	if (unread || !files.length) {
		return (
			<span className="fhact" role="img"
				aria-label={unread ? "Attachment, could not be read" : "No attachment"}
				title={unread ? CLIP_UNREAD : CLIP_NONE}>
				<Ic d={D.clip} />
			</span>
		);
	}

	const many = files.length > 1;
	return (
		<span className="clipwrap">
			<button ref={btn} className="fhact on clip" aria-haspopup="dialog" aria-expanded={open}
				aria-label={`${files.length} attachment${many ? "s" : ""} on the ${r.type} held for ${r.emp}`}
				title={`Their paperclip: the scan itself. ${files.length} file${many ? "s" : ""} attached to this document.`}
				onClick={onToggle}>
				<Ic d={D.clip} />
				{/* Only when there is more than one. A badge reading "1" on every
				    live clip is a column of ones that nobody reads twice. */}
				{many ? <b className="clipn">{files.length}</b> : null}
			</button>

			{/* `at` is null for the one frame between the click and the measurement,
			    and the panel waits for it rather than drawing at 0,0 first. */}
			{open && at ? (
				<div className="clippop" style={at} role="dialog"
					aria-label={`Attachment — ${r.type}, ${r.emp}`}>
					<h5>Attachment</h5>
					{files.map((f) => {
						const url = f.file_url || "";
						const kb = size(f.file_size);
						return (
							<div className="cliprow" key={f.name}>
								<span className="clipfile" title={`${f.file_name || f.name}${kb ? ` · ${kb}` : ""}`}>
									{f.file_name || f.name}
									{kb ? <em>{kb}</em> : null}
								</span>
								{/* `download` as well as the header the server sets. The
								    attribute alone is same-origin only and silently
								    ignored otherwise; the header alone leaves the
								    browser guessing at the name. Together they agree. */}
								<a className="cliplink" download={f.file_name || undefined}
									href={url ? `${url}?download=1&name=${encodeURIComponent(f.file_name || "")}` : undefined}
									title="Save the scan under the name it was filed as.">
									Download
								</a>
								<a className="cliplink" href={url || undefined} target="_blank" rel="noreferrer"
									title="Open the scan in a new tab.">
									Open
								</a>
							</div>
						);
					})}
				</div>
			) : null}
		</span>
	);
}

/** One document row: their five cells and their four actions.

    The expiry cell carries the days beside the date, which theirs does not.
    That is deliberate and it is the one place this screen is better than the
    one it copies — an expiry date nobody counts down from is a date nobody
    acts on, and it is the same chip the watch list under this screen uses. */
function Row({ r, s, files, unread }) {
	const d = r.expiry ? daysTo(r.expiry) : null;
	return (
		<tr>
			<td>{r.type}</td>
			<td className="mono">{r.no}</td>
			<td>
				<span className="fhname">{r.code ? `${r.code} - ${r.emp}` : r.emp}</span>
			</td>
			<td className="mono">
				{r.expiry && d != null ? (
					<>
						{dmy(r.expiry)}{" "}
						<span className={"cov " + (d < 0 ? "none" : d < 90 ? "part" : "live")}>
							{d < 0 ? `expired ${Math.abs(d)}d` : `${d}d`}
						</span>
					</>
				) : (
					<span className="muted">-</span>
				)}
			</td>
			<td className="gone" title="No field on this side holds a remark against a document.">-</td>
			<td className="act">
				<Clip r={r} files={files} unread={unread} open={s.dreg.clip === r.id}
					onToggle={() => patch("dreg", { clip: s.dreg.clip === r.id ? "" : r.id })} />
				<button className="fhact on" aria-label={`View the ${r.type} held for ${r.emp}`}
					title="Show what this side actually holds for this document — and what their row carries that it does not."
					onClick={() => patch("dreg", { show: r.id })}>
					<Ic d={D.eye} />
				</button>
				{/* Their pencil, and it now opens their form rather than the site.
				    The link to the desk has not gone — it is at the foot of the view
				    dialog beside the eye, which is where somebody goes for the rest
				    of the record. This one edits the document. */}
				<button className="fhact on" aria-label={`Edit the ${r.type} held for ${r.emp}`}
					title="Open Factor HR's Document Entry form on this row. The number, the passport dates and the scans can be changed here; nothing else about the person can."
					onClick={() => patch("dreg", { edit: r.id, clip: "" })}>
					<Ic d={D.pencil} />
				</button>
				<button className="fhact on bin" aria-label={`Delete the ${r.type} held for ${r.emp}`}
					title={BIN_WHAT}
					onClick={() => patch("dreg", { del: r.id, clip: "" })}>
					<Ic d={D.bin} />
				</button>
			</td>
		</tr>
	);
}

/** One of their three registers. Only the first has anything behind it, so the
    other two are drawn to their own columns, empty, with the reason in the
    footer where their row count would be. */
function Register({ reg, s, rows, full }) {
	const mine = reg.key === "employee";
	const pick = mine ? s.dreg.type : "";
	const shown = pick ? rows.filter((r) => r.kind === pick) : rows;

	const pages = Math.max(1, Math.ceil(shown.length / DOC_PAGE));
	const page = Math.min(Math.max(1, s.dreg.page), pages);
	const from = (page - 1) * DOC_PAGE;
	const here = mine ? shown.slice(from, from + DOC_PAGE) : [];

	const fh = FH_DOCS[reg.key];

	return (
		<section className="docreg">
			<h4>
				<Ic d={D.folder} />
				{reg.label}
				<span className={"cov " + reg.state} title={reg.why}>
					{mine
						? `${fmt(rows.length)} here · ${fmt(fh.total)} theirs`
						: `none here · ${fmt(fh.total)} theirs`}
				</span>
			</h4>

			{mine ? (
				<Types rows={rows} full={full} pick={pick}
					on={(t) => patch("dreg", { type: t, page: 1, clip: "" })} />
			) : (
				<div className="tabs docpills">
					<button className="tab" disabled title={reg.why}>
						All <span className="n">(0)</span>
					</button>
				</div>
			)}

			<div {...(mine ? panelProps(PANEL, TAB(pick || "all")) : {})}>
				<Scroll>
					<table>
						<thead>
							<tr>
								{reg.cols.map((c) => (
									<th key={c} className={DOC_COLS[c].state === "build" ? "empty" : ""}
										title={DOC_COLS[c].state === "build"
											? `Nothing on this side holds a ${DOC_COLS[c].label.toLowerCase()} against a document.`
											: undefined}>
										{DOC_COLS[c].label}
									</th>
								))}
								<th className="act">Action</th>
							</tr>
						</thead>
						<tbody>
							{here.length ? (
								here.map((r) => (
									<Row key={r.id} r={r} s={s} unread={!!s.fileErr}
										files={s.docFiles[r.name + ":" + r.field] || NO_FILES} />
								))
							) : (
								/* Their own empty state, which is a row of dashes rather than a
								   line of prose — copied, with the prose in the footer. */
								<tr>
									{reg.cols.map((c) => (
										<td key={c} className="gone">-</td>
									))}
									<td className="act gone">-</td>
								</tr>
							)}
						</tbody>
					</table>
				</Scroll>
			</div>

			<div className="docfoot">
				<span className="cnt">
					{mine ? (
						shown.length ? (
							<>
								{fmt(from + 1)}–{fmt(from + here.length)} of {fmt(shown.length)}
								{pick ? ` ${DOC_KINDS.find((k) => k.key === pick).label}` : ""} · five to a
								page, as theirs is
							</>
						) : (
							<>Nothing here{s.dreg.q || pick ? " matches" : ""}. {reg.why}</>
						)
					) : (
						reg.why
					)}
				</span>
				{/* `clip` goes with the page: the row an open popover belongs to is not
				    on the next one, and a panel left hanging over a different row is
				    worse than one that closed. Same for the type pills and Search. */}
				{mine ? <Pager page={page} pages={pages}
					go={(p) => patch("dreg", { page: p, clip: "" })} /> : null}
			</div>
		</section>
	);
}

/** Their **Document Entry** dialog, drawn box for box — what opens behind the
    eye on a row, and nothing that is not on their screen.

    Eight boxes, three to a row, Remarks across the bottom. Their labels, their
    order, their layout: small grey caps over the value, no input frames, which
    is what their capture shows. It is a detail view rather than a form, and
    drawing it as boxed inputs the way Assets Details is drawn would say it can
    be typed into.

    **Three answers per box, not two.** A value; empty, meaning the field is
    there and nobody filled it; and no such field, meaning this document type
    does not have one at all. The last greys the label — their own convention,
    borrowed from the grey Attachment label on their Assets form and used the
    same way throughout this dashboard. A PAN row shows it on three boxes, and
    that is the finding: `custom_pan_no` is one Custom Field where
    `passport_number` arrives as a block of four.

    The countdown beside an expiry date is this side's own and is the one thing
    here their dialog does not have. It is the same chip the register and the
    watch list use, and it is kept for the reason given on the register: a date
    nobody counts down from is a date nobody acts on. */
function Box({ f, r }) {
	const raw = f.get(r);
	/* `null` from a `get` is "this type has no such field" and `""` is "the
	   field is blank on this record" — see DOC_VIEW, which is where the
	   distinction is made and why it matters. */
	const gone = raw == null;
	const empty = !gone && String(raw) === "";
	const days = f.key === "expiry" && raw ? daysTo(raw) : null;

	return (
		<div className={"dvbox" + (f.wide ? " wide" : "")}>
			<span className={"dvlab" + (gone ? " off" : "")}>{f.label}</span>
			<span className={"dvval" + (f.mono ? " mono" : "") + (gone || empty ? " off" : "")}
				title={f.why}>
				{gone ? "no such field" : empty ? "empty" : (
					<>
						{f.kind === "date" ? dmy(raw) : String(raw)}
						{days != null ? (
							<span className={"cov " + (days < 0 ? "none" : days < 90 ? "part" : "live")}>
								{days < 0 ? `expired ${Math.abs(days)}d` : `${days}d`}
							</span>
						) : null}
					</>
				)}
			</span>
		</div>
	);
}

function DocView({ r, s }) {
	const files = s.docFiles[r.name + ":" + r.field] || NO_FILES;

	return (
		<>
			<div className="dvgrid">
				{DOC_VIEW.map((f) => <Box key={f.key} f={f} r={r} />)}
			</div>

			{/* Under their form rather than in it, because none of this is on their
			    dialog — it is on their *row*. The paperclip is the scan, and the
			    two after it are what their register records about the filing that
			    nothing on this side does. Keeping them out of the boxes above is
			    the difference between drawing their screen and editing it. */}
			<div className="dvmore">
				<h5>What their row carries beside these boxes</h5>
				<div className="rows">
					<div className="row">
						<span>
							Attachment{" "}
							<span className="muted">
								{s.fileErr
									? "The attachments could not be read, so this is unknown rather than empty."
									: files.length
										? `${files.length} file${files.length > 1 ? "s" : ""} on Frappe's File table, against this record and this field.`
										: "Frappe's File table hangs off a record and a field. Nothing has been filed against this one."}
							</span>
						</span>
						<span className="val">
							{files.length && !s.fileErr
								? files.map((f) => (
									<a key={f.name} className="cliplink" href={f.file_url || undefined}
										target="_blank" rel="noreferrer" title="Open the scan in a new tab.">
										{f.file_name || f.name}
									</a>
								))
								/* Not a `FieldChip`: its three states are about whether a
								   *field* is built, and this row is about whether a file was
								   filed against one that is. "To build" here would say the
								   opposite of what the live clips on the register show. */
								: <span className="cov none">{s.fileErr ? "Not read" : "None attached"}</span>}
						</span>
					</div>
					{[
						["Issued by", "Their row records who filed it. Nothing here records that."],
						["Uploaded on", "Employee carries one modified date for the whole record."],
					].map(([k, why]) => (
						<div className="row" key={k}>
							<span>
								{k} <span className="muted">{why}</span>
							</span>
							<span className="val">
								<FieldChip state="build" />
							</span>
						</div>
					))}
				</div>

				{/* Every box above is read-only, like everything else on this
				    dashboard, so the way to change one is the record it is a field
				    on. Their dialog has no such link because theirs is the system of
				    record; this one needs it for the same reason. */}
				<Desk className="embtn" label="Open the employee on the site"
					href={s.site && deskUrl(s.site, "Employee", r.name)}
					title="Open this employee on the ERPNext site. Every box above is a field on that record, which is why editing the document is editing the person.">
					Open the employee
				</Desk>
			</div>
		</>
	);
}

/** Their bin, and what deleting a document actually is on this side.

    On their screen a document is a row, so their bin removes a row. Here it is
    a number on a person, so there is no row to remove — deleting is **clearing
    the fields the row was synthesised from**, and taking the scans filed
    against them with it. Which is a different act, and the dialog says so
    rather than quietly doing the nearest thing.

    It clears the *whole block*, not just the number. A passport is four fields
    on `Employee` and they only mean anything together: leaving `valid_upto`
    behind after the number has gone is an expiry date for a passport nobody
    holds, and the watch list on the page below would carry on counting down to
    it. A PAN is one field and clears as one.

    **Confirmed rather than undone.** Nothing here writes a copy of what it
    cleared, so there is no undo to offer and it would be dishonest to imply
    one — the confirmation is the whole safety net, which is why it names the
    person, the number and the count of scans instead of asking "are you sure".
    Their own bin asks nothing at all. */
function DocDelete({ r, s, onClose }) {
	const kind = DOC_KINDS.find((k) => k.key === r.kind) || {};
	const held = s.docFiles[r.name + ":" + r.field] || NO_FILES;

	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");

	/* Every field this document occupies, in the order they read on the form. A
	   kind that has only a number clears only a number. */
	const fields = [kind.num, kind.exp, kind.iss, kind.place].filter(Boolean);

	async function remove() {
		setBusy(true);
		setErr("");
		try {
			/* The scans first, then the fields. The other order can leave a file
			   filed against a field that is now empty — invisible on the register,
			   because the row it hung off no longer exists, and still on disk. A
			   failure here stops before anything is cleared, which leaves the
			   document exactly as it was. */
			for (const f of held) await apiDeleteFile(f.name);

			const blank = {};
			for (const key of fields) blank[key] = "";
			const res = await apiWrite("Employee", r.name, blank);
			if (!res.ok) throw new Error(res.error || "The site refused the change.");

			await loadOnBoard();
			onClose();
		} catch (e) {
			setErr(String(e.message || e).slice(0, 240));
			setBusy(false);
		}
	}

	return (
		<div className="dedel">
			<p className="dedelsay">
				This removes the <b>{r.type}</b> held for{" "}
				<b>{r.code ? `${r.code} - ${r.emp}` : r.emp}</b>, number{" "}
				<span className="mono">{r.no}</span>.
			</p>

			{/* What will actually happen, named. A confirmation that does not say
			    which fields it empties is a confirmation nobody can check. */}
			<div className="rows">
				<div className="row">
					<span>
						Cleared on <span className="mono">{r.name}</span>{" "}
						<span className="muted">
							{fields.length > 1
								? "The whole block, not just the number — an expiry date left behind is one the watch list keeps counting down to."
								: "The one field this document is."}
						</span>
					</span>
					<span className="val mono">{fields.join(", ")}</span>
				</div>
				<div className="row">
					<span>
						Scans deleted{" "}
						<span className="muted">
							{held.length
								? "The File rows and the bytes behind them. This is the part that does not come back."
								: "Nothing is attached to this document."}
						</span>
					</span>
					<span className="val">
						{held.length
							? held.map((f) => <span key={f.name} className="dedelfile">{f.file_name || f.name}</span>)
							: <span className="cov none">None</span>}
					</span>
				</div>
			</div>

			<p className="dedelwarn">
				There is no undo. Nothing on this dashboard keeps a copy of what it cleared, so this is the
				only place to change your mind.
			</p>

			{err ? <div className="deerr"><b>Nothing was deleted.</b> {err}</div> : null}

			<div className="defoot">
				<button className="btn bad" disabled={busy}
					title={`Clear ${fields.join(", ")} on ${r.name}` + (held.length ? `, and delete ${held.length} scan${held.length > 1 ? "s" : ""}.` : ".")}
					onClick={() => void remove()}>
					{busy ? "Deleting…" : "Delete the document"}
				</button>
				<button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
			</div>
		</div>
	);
}

/* ---------------------------------------------------------------------------
   Their **Document Entry** form in its editing state — what opens behind the
   pencil, photographed 4 September 2026.

   The same eight boxes as the view dialog, drawn as their controls: two
   dropdowns, the employee picker with its status light, three text boxes, two
   date boxes, a Remarks note, then the Attachment strip with its plus, its
   Browse row and its bin, and Save / Close underneath.

   **This is the one screen on this dashboard that writes, and the exception is
   narrow enough to state in a sentence.** Five fields on `Employee` — the
   document numbers and the passport dates — are on the PUT allowlist in
   server/src/doctypes/registry.ts, and the attachment routes are the only place
   this API takes bytes. Nothing else about a person can be changed from here:
   asking to set `status` or `ctc` on that endpoint is refused by name.

   Why these and not the rule the rest of the app follows: a document number
   here is not a record somebody maintains elsewhere. It is a field that is
   empty on almost every employee, and this is the screen that shows it empty.
   Sending somebody to a desk to type the same passport number into the same
   field by hand is the read-only rule protecting nothing.

   **Four boxes edit and four cannot, and the four that cannot say why.** Not
   because writing them is unimplemented — because on this side they are not
   edits:

     Related To     their register. This site has one with rows in it.
     Employee       moving a document to another person is clearing a field on
                    one record and filling it on another, not a change of box.
     Document Type  a type here is *which field the number lives on*, so
                    changing it is the same two-record edit as above.
     Remarks        no field on Employee holds a note about a single number.
   --------------------------------------------------------------------------- */

/** The pencil's dialog. Its draft lives here rather than in the store: a `File`
    somebody has picked is not serialisable, and a half-typed passport number
    that outlived the dialog would reappear on the next row opened. */
function DocEdit({ r, s, onClose, making }) {
	/* **New is the same form with the two boxes above it turned on.** Their +
	   opens this dialog empty; the pencil opens it on a row. What differs is only
	   that Employee and Document Type are pickers rather than statements — the
	   six boxes under them, the attachment strip and Save are the same code,
	   because on their screen they are the same screen.

	   `pick` and `type` are those two choices. On an edit they are never read:
	   the row already says who and which. */
	const [pick, setPick] = useState("");
	const [type, setType] = useState("");
	const [q, setQ] = useState("");

	const people = docRows(s);
	const who = making ? people.find((e) => e.name === pick) : null;

	const kind = DOC_KINDS.find((k) => k.key === (making ? type : r.kind)) || {};

	/* The row this form is filling. On an edit it is the one that was clicked;
	   on a create it is composed from the two choices above and reads the
	   employee's *current* values, because a document here is a field on a
	   person and that field may already be filled. Which is the one thing this
	   dialog has to be honest about — see `taken`. */
	const row = making
		? (who && kind.num
			? {
				name: who.name,
				field: kind.num,
				type: kind.label,
				emp: who.employee_name || who.name,
				code: who.employee_number || "",
				status: who.status || "",
				no: who[kind.num] || "",
				expiry: kind.exp ? who[kind.exp] || "" : null,
				issue: kind.iss ? who[kind.iss] || "" : null,
				place: kind.place ? who[kind.place] || "" : null,
			}
			: null)
		: r;

	const held = row ? s.docFiles[row.name + ":" + row.field] || NO_FILES : NO_FILES;

	/* **The person already holds one of these.** A document on this side is a
	   field, so there is one passport per employee and no second row to add —
	   which is the finding the register keeps reporting, met here as a
	   consequence. Saving over it is an edit of that document rather than a new
	   one, and the dialog says so before Save rather than after. */
	const taken = making && row && row.no;

	const [form, setForm] = useState({
		no: r ? r.no || "" : "", expiry: r ? r.expiry || "" : "",
		place: r ? r.place || "" : "", issue: r ? r.issue || "" : "",
	});
	/* What Save will do, held until Save does it. Their bin and their Browse
	   both take effect on the button rather than on the click — which is what
	   makes Close mean "leave it as it was" rather than "leave half of it". */
	const [adds, setAdds] = useState([]);
	const [drops, setDrops] = useState([]);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");

	const put = (k, v) => setForm((f) => ({ ...f, [k]: v }));

	/* Only what changed, and compared against the row rather than against a
	   remembered copy of it: a PUT carrying every field would move `modified` on
	   records nobody edited, and on a site with an audit trail that is a change
	   somebody has to explain. */
	const patchFor = () => {
		const out = {};
		if (!row) return out;
		const same = (a, b) => (a || "") === (b || "");
		if (kind.num && !same(form.no, row.no)) out[kind.num] = form.no.trim();
		if (kind.exp && !same(form.expiry, row.expiry)) out[kind.exp] = form.expiry;
		if (kind.place && !same(form.place, row.place)) out[kind.place] = form.place.trim();
		if (kind.iss && !same(form.issue, row.issue)) out[kind.iss] = form.issue;
		return out;
	};

	const changes = patchFor();
	const dirty = Object.keys(changes).length > 0 || adds.some(Boolean) || drops.length > 0;
	/* The number is the row. Blanking it does not empty a box, it deletes the
	   document — said before Save rather than discovered after it. */
	const clearing = kind.num && !form.no.trim() && row && row.no;
	/* A new document with no number is not a document: the register is
	   synthesised from filled fields, so it would save and leave no row. */
	const blank = making && !form.no.trim();

	async function save() {
		setBusy(true);
		setErr("");
		try {
			/* The field change first. If it is refused nothing else should have
			   happened — a scan filed against a number that failed to save is
			   filed against the old one. */
			if (Object.keys(changes).length) {
				const res = await apiWrite("Employee", row.name, changes);
				if (!res.ok) throw new Error(res.error || "The site refused the change.");
			}
			for (const name of drops) await apiDeleteFile(name);
			for (const f of adds) {
				if (f) await apiUpload(f, { doctype: "Employee", name: row.name, field: row.field });
			}
			/* Re-read rather than patching the store by hand. The register is
			   synthesised off the employee rows, so a saved number has to come back
			   through the same read that built them, or the screen and the site
			   disagree about what is on it. */
			await loadOnBoard();
			onClose();
		} catch (e) {
			setErr(String(e.message || e).slice(0, 240));
			setBusy(false);
		}
	}

	/* A box with no field behind it on this type. Drawn as their control and
	   disabled, with the reason on it — the same bargain every dead control on
	   this dashboard makes. */
	const noField = (what) => `${what} on this side is part of the passport block on Employee. `
		+ `${row ? row.type : "This type"} is a single field with nothing beside it, so there is no box behind this one to `
		+ "write into. Adding one is a Custom Field on the doctype.";

	return (
		<div className="deform">
			<div className="dvgrid">
				<div className="dvbox">
					<label className="dvlab" htmlFor="de-rel">Related To</label>
					<select id="de-rel" className="dectl" value="Employee" disabled
						title="Their dropdown picks one of three registers. Dependant and Company have nothing behind them on this site, so there is nowhere else for a row to go."
						onChange={() => {}}>
						<option>Employee</option>
					</select>
				</div>

				<div className="dvbox">
					<label className="dvlab" htmlFor="de-emp">Employee</label>
					{making ? (
						/* Their Search Employee box, and on a create it has to be live:
						   a new document has no person behind it until one is picked.
						   On an edit the same box is a statement, because moving a
						   document to somebody else is clearing a field on one record
						   and filling it on another — two edits and a deletion. */
						<div className="dectl demp depick">
							<span className={"sdot " + (who ? (who.status === "Active" ? "on" : "off") : "")}
								title={who ? `This employee is ${who.status || "of unknown status"}.` : "Nobody picked yet."} />
							<input id="de-emp" type="search" autoComplete="off" disabled={busy}
								placeholder="Search Employee"
								value={who && !q ? `${who.employee_number || ""} - ${who.employee_name || who.name}` : q}
								title="Type a name or an employee code. A document here is a field on a person, so this is which person."
								onChange={(e) => { setQ(e.target.value); setPick(""); }} />
							{q.trim() && !who ? (
								<div className="dehits">
									{people
										.filter((e) => `${e.employee_number || ""} ${e.employee_name || ""}`
											.toLowerCase().includes(q.trim().toLowerCase()))
										.slice(0, 8)
										.map((e) => (
											<button key={e.name} type="button"
												onClick={() => { setPick(e.name); setQ(""); }}>
												<b>{e.employee_name || e.name}</b>
												<span className="mono">{e.employee_number || e.name}</span>
											</button>
										))}
									{people.some((e) => `${e.employee_number || ""} ${e.employee_name || ""}`
										.toLowerCase().includes(q.trim().toLowerCase()))
										? null
										: <span className="denone">Nobody matches, out of {fmt(people.length)} read.</span>}
								</div>
							) : null}
						</div>
					) : (
						<div className="dectl demp"
							title="Whose document this is. Moving it to somebody else is clearing a field on one record and filling it on another — two edits and a deletion, not a change of box.">
							{/* `on` / `off`, which are the two this palette defines — see `.sdot` in
							    the stylesheet. Their green light means the employee is active, and
							    an inactive one behind a live document is worth seeing. */}
							<span className={"sdot " + (r.status === "Active" ? "on" : "off")}
								title={`This employee is ${r.status || "of unknown status"}.`} />
							<input id="de-emp" readOnly value={r.code ? `${r.code} - ${r.emp}` : r.emp} />
						</div>
					)}
				</div>

				<div className="dvbox">
					<label className="dvlab" htmlFor="de-type">Document Type</label>
					{making ? (
						/* Live here and fixed on an edit, and the asymmetry is the model:
						   choosing a type is choosing *which field* the number goes in,
						   which is a decision when there is no number yet and a move
						   between fields once there is. The type with no field on this
						   side is drawn in the list and cannot be chosen. */
						<select id="de-type" className="dectl" value={type} disabled={busy}
							title="Which document this is. On this side a type is a field on Employee, so this decides where the number is written."
							onChange={(e) => setType(e.target.value)}>
							<option value="">select document type</option>
							{DOC_KINDS.map((k) => (
								<option key={k.key} value={k.key} disabled={!k.num} title={k.why}>
									{k.label}{k.num ? "" : " — no field on this site"}
								</option>
							))}
						</select>
					) : (
						<select id="de-type" className="dectl" value={r.type} disabled
							title="A type here is which field on Employee the number lives on, so changing it moves the number between fields rather than editing this row. Theirs is a master; ours is the schema."
							onChange={() => {}}>
							<option>{r.type}</option>
						</select>
					)}
				</div>

				<div className="dvbox">
					<label className="dvlab" htmlFor="de-no">Document No</label>
					<input id="de-no" className="dectl mono" value={form.no} disabled={busy || !row}
						title={"Writes " + kind.num + " on this employee."}
						onChange={(e) => put("no", e.target.value)} />
					{clearing ? (
						<span className="dehint warn">
							Blank removes this row. The document here <em>is</em> the number — there is nothing
							left to list once it is cleared.
						</span>
					) : null}
					{taken ? (
						<span className="dehint warn">
							This person already holds a {row.type} — <span className="mono">{row.no}</span>.
							A document here is one field, so there is no second row to add: saving replaces it.
						</span>
					) : null}
				</div>

				<div className="dvbox">
					<label className={"dvlab" + (kind.exp ? "" : " off")} htmlFor="de-exp">Expiry Date</label>
					<input id="de-exp" type="date" className="dectl" value={form.expiry}
						disabled={busy || !row || !kind.exp}
						title={kind.exp
							? "Writes valid_upto. The countdown chip on the register reads this."
							: noField("An expiry date")}
						onChange={(e) => put("expiry", e.target.value)} />
				</div>

				<div className="dvbox">
					<label className={"dvlab" + (kind.place ? "" : " off")} htmlFor="de-place">Issue Place</label>
					<input id="de-place" className="dectl" value={form.place}
						disabled={busy || !row || !kind.place}
						title={kind.place ? "Writes place_of_issue." : noField("An issue place")}
						onChange={(e) => put("place", e.target.value)} />
				</div>

				<div className="dvbox">
					<label className={"dvlab" + (kind.iss ? "" : " off")} htmlFor="de-iss">Issue Date</label>
					<input id="de-iss" type="date" className="dectl" value={form.issue}
						disabled={busy || !row || !kind.iss}
						title={kind.iss ? "Writes date_of_issue." : noField("An issue date")}
						onChange={(e) => put("issue", e.target.value)} />
				</div>

				<div className="dvbox wide">
					<label className="dvlab off" htmlFor="de-rem">Remarks</label>
					<textarea id="de-rem" className="dectl" rows={3} value="" disabled
						title="No field on Employee holds a note against a single document number. Their box is empty on their own capture too, which is the more interesting half — it exists there and is not used."
						onChange={() => {}} />
				</div>
			</div>

			{/* Their Attachment strip: a grey bar with a plus, then a row per file.
			    The plus adds an empty Browse row, which is how theirs takes a second
			    scan — and the reason this side can hold two of those where it cannot
			    hold two documents: a file hangs off the record-and-field pair, and
			    one pair can have many. */}
			<div className="deatt">
				<div className="deattbar">
					<span>Attachment</span>
					<button className="deplus" aria-label="Add another attachment row" disabled={busy}
						title="Another scan against this same document. A document here holds one number and any number of files."
						onClick={() => setAdds((a) => (a.length ? a : [null]).concat([null]))}>
						+
					</button>
				</div>

				{held.map((f) => {
					const gone = drops.includes(f.name);
					return (
						<div className={"deattrow" + (gone ? " gone" : "")} key={f.name}>
							<span className="destate">{gone ? "Removed on Save" : "On file"}</span>
							<a className="cliplink" href={f.file_url || undefined} target="_blank" rel="noreferrer"
								title="Open the scan in a new tab.">
								{f.file_name || f.name}
							</a>
							<button className="debin" disabled={busy}
								aria-label={gone ? `Keep ${f.file_name}` : `Remove ${f.file_name}`}
								title={gone
									? "Keep it after all. Nothing has been deleted yet — the bin takes effect on Save."
									: "Delete this scan. It goes on Save, and it goes for good: the row and the bytes behind it."}
								onClick={() => setDrops((d) => (gone ? d.filter((n) => n !== f.name) : d.concat(f.name)))}>
								{gone ? "↺" : <Ic d={D.bin} />}
							</button>
						</div>
					);
				})}

				{/* One empty row always, the way their form opens with one. */}
				{(adds.length ? adds : [null]).map((f, i) => (
					<div className="deattrow" key={"add" + i}>
						<label className="defilepick">
							<span className="defilename">{f ? f.name : "Choose file"}</span>
							<span className="debrowse">Browse</span>
							<input type="file" disabled={busy}
								accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.svg"
								onChange={(e) => {
									const picked = e.target.files?.[0] || null;
									setAdds((a) => {
										const next = (a.length ? a : [null]).slice();
										next[i] = picked;
										return next;
									});
								}} />
						</label>
						{f ? (
							<button className="debin" disabled={busy} aria-label={`Do not upload ${f.name}`}
								title="Drop this file. Nothing has been uploaded yet."
								onClick={() => setAdds((a) => a.filter((_, j) => j !== i))}>
								<Ic d={D.bin} />
							</button>
						) : null}
					</div>
				))}
			</div>

			{err ? <div className="deerr"><b>Nothing was saved.</b> {err}</div> : null}

			<div className="defoot">
				<button className="btn tpl" disabled={busy || !dirty || blank}
					title={making && !who
						? "Pick an employee first — a document here is a field on a person."
						: making && !kind.num
							? "Pick a document type. It decides which field the number is written to."
							: blank
								? "A document is its number. Without one this would save and leave no row on the register."
								: dirty
									? "Write the changed fields to this employee, then the attachments."
									: "Nothing has been changed."}
					onClick={() => void save()}>
					{busy ? "Saving…" : "Save"}
				</button>
				<button className="btn ghost" disabled={busy} onClick={onClose}>Close</button>
				<span className="dewhy">
					{row ? (
						<>
							Writes <span className="mono">{[kind.num, kind.exp, kind.place, kind.iss].filter(Boolean).join(", ")}</span>{" "}
							on <span className="mono">{row.name}</span>. Nothing else about this person can be
							changed from here.
						</>
					) : (
						<>
							Pick an employee and a document type. A document on this side is a field on a
							person, so those two choices are what decides where the number is written.
						</>
					)}
				</span>
			</div>
		</div>
	);
}

export default function DocumentEntry() {
	const s = useApp();
	const full = s.docTier === "full";

	const all = ourDocs(docRows(s), full);
	const q = (s.dreg.q || "").trim().toLowerCase();
	const rows = q
		? all.filter((r) => `${r.code} ${r.emp} ${r.no} ${r.type}`.toLowerCase().includes(q))
		: all;

	const open = s.dreg.show && all.find((r) => r.id === s.dreg.show);
	/* Found in `all` rather than in the filtered rows, so a save that clears the
	   Search box out from under the dialog cannot pull the record it is editing
	   out of scope halfway through. */
	const edit = s.dreg.edit && all.find((r) => r.id === s.dreg.edit);
	const del = s.dreg.del && all.find((r) => r.id === s.dreg.del);
	const waiting = onboardWait(s, "the employee documents");

	/* An open paperclip closes on Escape and on a click anywhere that is not
	   inside one. Both listeners, not one: a popover that only Escape dismisses
	   is a popover that stays up while somebody scrolls the register underneath
	   it, and one that only an outside click dismisses cannot be closed from the
	   keyboard at all.

	   `pointerdown` rather than `click`, so the popover is gone before whatever
	   was clicked reacts — on `click` the row action underneath fires first and
	   the page moves out from under an open panel.

	   `.clipwrap` is the whole control, button and panel, which is what makes
	   one test do both jobs: clicking the button that is already open toggles it
	   shut through its own handler, and clicking Download inside the panel must
	   not close it before the browser has followed the link.

	   Bound only while something is open. A document-level listener that lives
	   for the lifetime of the screen runs on every click on the page to decide,
	   almost always, that it has nothing to do. */
	/* Their ↑ menu closes the way every menu does: Escape, or a click that is
	   not inside it. Its own button stops propagation, so the toggle is not
	   fighting this. Bound only while it is open. */
	const menu = s.dreg.up || s.dreg.scan;
	useEffect(() => {
		if (!menu) return undefined;
		const shut = () => patch("dreg", { up: false, scan: false });
		const onKey = (e) => { if (e.key === "Escape") shut(); };
		document.addEventListener("keydown", onKey);
		document.addEventListener("click", shut);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("click", shut);
		};
	}, [menu]);

	const clip = s.dreg.clip;
	useEffect(() => {
		if (!clip) return undefined;
		const shut = () => patch("dreg", { clip: "" });
		const onKey = (e) => { if (e.key === "Escape") shut(); };
		const onDown = (e) => { if (!e.target.closest?.(".clipwrap")) shut(); };
		document.addEventListener("keydown", onKey);
		document.addEventListener("pointerdown", onDown);

		/* Scrolling closes it, and that is the honest half of positioning against
		   the viewport: the panel is measured off the clip once, so anything that
		   moves the clip afterwards leaves it pointing at a row it does not
		   belong to. Following the row instead means re-measuring on every frame
		   of every scroll, and this is a list of one file.

		   Capture, because the register scrolls sideways inside `.scroll` and a
		   scroll event on an element does not bubble to `document`. */
		const onMove = () => shut();
		document.addEventListener("scroll", onMove, true);
		window.addEventListener("resize", onMove);

		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("pointerdown", onDown);
			document.removeEventListener("scroll", onMove, true);
			window.removeEventListener("resize", onMove);
		};
	}, [clip]);

	return (
		<div className="fhcat docscr">
			<header>
				<h3 className="caps">DOCUMENT</h3>
				<span className={"cov " + (s.docErr ? "none" : "part")}>
					{s.docErr ? "The read failed" : "Their screen, our fields"}
				</span>

				<span className="right">
					<button className="embtn ic" aria-label="Search the documents" aria-pressed={s.dreg.find}
						title="Their magnifier. Filters the rows already loaded here — code, name, number or type."
						onClick={() => patch("dreg", { find: !s.dreg.find, q: "", page: 1, clip: "" })}>
						<Ic d={D.search} />
					</button>
					{/* Their +, and it opens the same Document Entry form the pencil
					    does — empty, with Employee and Document Type live. The old note
					    here said this button "would have to guess who first"; it does not
					    guess, it asks, which is what their Search Employee box is for. */}
					<button className="embtn ic" aria-label="Add a document"
						title={ADD_WHAT}
						onClick={() => patch("dreg", { add: true, clip: "" })}>
						<Ic d={D.plus} />
					</button>
					{/* **Their ↑ is a menu, not a button.** Three items: import from a
					    file, import in the background, and download the template. The
					    first two are the same job and differ only in where it runs —
					    which is why only one of them can be honoured here. */}
					<span className="empdrop">
						<button className="embtn ic" aria-label="Data import" aria-haspopup="menu"
							aria-expanded={s.dreg.up}
							title="Their ↑. A menu of three: import document numbers from a spreadsheet, do the same in the background, or download the template first."
							onClick={(e) => { e.stopPropagation(); patch("dreg", { up: !s.dreg.up }); }}>
							<Ic d={D.up} />
						</button>
						<div className="emmenu end" role="menu" aria-label="Data import" hidden={!s.dreg.up}>
							<button role="menuitem"
								title="Read a CSV of document numbers, match every row to an employee, and write the fields. It says what it found before it writes anything."
								onClick={(e) => { e.stopPropagation(); patch("dreg", { up: false, imp: true }); }}>
								<Ic d={D.up} /> Data import from file
							</button>
							<button role="menuitem" disabled title={BG_DEAD}>
								<Ic d={D.up} /> Data import in background
							</button>
							<button role="menuitem"
								title="The six columns the import reads, with one example row taken from a real employee on this site."
								onClick={(e) => { e.stopPropagation(); patch("dreg", { up: false }); docTemplate(s); }}>
								<Ic d={D.dl} /> Download template
							</button>
						</div>
					</span>
					{/* **This opened ERPNext's Data Import and now opens their own
					    menu.** The hand-off was answering the wrong half of the
					    question: Data Import maps spreadsheet columns to fields, which
					    the ↑ beside this now does with a preview — and it cannot carry
					    a scan at all, because an attachment is bytes rather than a
					    column. This is the scans. See DocScans.jsx. */}
					<span className="empdrop">
						<button className="embtn ic" aria-label="Upload Document" aria-haspopup="menu"
							aria-expanded={s.dreg.scan}
							title="Their upload menu: file a folder of scans against the people they belong to, or download the list of what each file should be called."
							onClick={(e) => { e.stopPropagation(); patch("dreg", { scan: !s.dreg.scan }); }}>
							<Ic d={D.imp} />
						</button>
						<div className="emmenu end" role="menu" aria-label="Upload Document"
							hidden={!s.dreg.scan}>
							<button role="menuitem"
								title="Pick or drag a folder of scans. Each is matched to a person and a document by its filename, and the dialog says what it found before anything is filed."
								onClick={(e) => { e.stopPropagation(); patch("dreg", { scan: false, scans: true }); }}>
								<Ic d={D.up} /> Upload Document
							</button>
							<button role="menuitem" disabled title={BG_SCAN_DEAD}>
								<Ic d={D.up} /> Upload Document In Background
							</button>
							<button role="menuitem"
								title="One row per employee per document type, with the exact filename that scan should be given — and the number already on file, so a row with one is a document whose scan is missing."
								onClick={(e) => { e.stopPropagation(); patch("dreg", { scan: false }); docStructure(s); }}>
								<Ic d={D.dl} /> Download Structure
							</button>
						</div>
					</span>
					<button className="embtn ic" aria-label="Read the site again"
						title="Read the employee documents again. The rows here are already loaded; this is for when somebody has filled a passport in on the site since."
						onClick={() => void loadOnBoard()}>
						<Ic d={D.ref} />
					</button>
					<button className="embtn ic" aria-label="Document Type master, not available here" disabled
						title={COG_DEAD}>
						<Ic d={D.cog} />
					</button>
				</span>
			</header>

			{s.dreg.find ? (
				<div className="find">
					<input type="search" autoFocus placeholder="Search — code, name, number or type"
						aria-label="Search documents" value={s.dreg.q}
						onChange={(e) => patch("dreg", { q: e.target.value, page: 1, clip: "" })} />
				</div>
			) : null}

			{waiting ? (
				<div className="docpad">{waiting}</div>
			) : s.docErr ? (
				<div className="docpad">
					<div className="gap">
						<b>Could not read the employee documents.</b> {s.docErr}
					</div>
				</div>
			) : (
				DOC_REGISTERS.map((reg) => (
					<Register key={reg.key} reg={reg} s={s} rows={rows} full={full} />
				))
			)}

			{open ? (
				<Modal
					title="Document Entry"
					wide
					extra={<DocView r={open} s={s} />}
					onClose={() => patch("dreg", { show: "" })}
				/>
			) : null}

			{/* The same dialog and the same title as the eye's, because on their
			    screen it is the same dialog — one form, opened to read or to
			    change. What differs is the boxes, and that is inside it. */}
			{edit ? (
				<Modal
					title="Document Entry"
					wide
					extra={<DocEdit r={edit} s={s} onClose={() => patch("dreg", { edit: "" })} />}
					onClose={() => patch("dreg", { edit: "" })}
				/>
			) : null}

			{/* The same dialog and the same title as the pencil's, because on their
			    screen it is the same dialog opened with nothing in it. */}
			{s.dreg.imp ? <DocImport onClose={() => patch("dreg", { imp: false })} /> : null}
			{s.dreg.scans ? <DocScans onClose={() => patch("dreg", { scans: false })} /> : null}

			{s.dreg.add ? (
				<Modal
					title="Document Entry"
					wide
					extra={<DocEdit making r={null} s={s} onClose={() => patch("dreg", { add: false })} />}
					onClose={() => patch("dreg", { add: false })}
				/>
			) : null}

			{/* Its own title, not "Document Entry". The other two dialogs are their
			    form; this one is a question, and a destructive question wearing the
			    same heading as the form somebody was just reading is how a Delete
			    gets clicked as though it were a Close. */}
			{del ? (
				<Modal
					title="Delete this document?"
					extra={<DocDelete r={del} s={s} onClose={() => patch("dreg", { del: "" })} />}
					onClose={() => patch("dreg", { del: "" })}
				/>
			) : null}
		</div>
	);
}
