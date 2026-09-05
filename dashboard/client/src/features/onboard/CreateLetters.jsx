import BulkLetter from "@/features/onboard/BulkLetter";
import DownloadLetters from "@/features/onboard/DownloadLetters";
import EmailLetters from "@/features/onboard/EmailLetters";
import PushLetters from "@/features/onboard/PushLetters";
import { Desk, Empty, Modal, Scroll } from "@/components/ui";
import { dmy, fmt, initials } from "@/lib/format";
import { download, toCsv } from "@/lib/csv";
import { deskUrl } from "@/lib/desk";
import { patch, useApp } from "@/store";
import { api } from "@/api/client";
import { load } from "@/api/load";

/* ---------------------------------------------------------------------------
   Factor HR's **Create Letters**, photographed 3 September 2026 and drawn here
   control for control: the title bar with a funnel, a search box and four
   toolbar icons, a blue Create Letter, seven columns with a tick box in front
   of them and three row actions behind, and their footer — a page-size picker
   worded "Showing 10 entries" and First / Previous / Page n of m / Next / Last.

   Their list holds one row. Ours holds twenty, which is the only reason the
   pager and the page-size picker on this page are real controls rather than
   the drawn-dead ones on Categories: there is a page 2 to go to.

   **Three of the seven columns are newer than this dashboard's first read of
   the doctype.** LETTER NUMBER, REFERENCE NUMBER and REMARKS are on
   `Employee Letter` in `server/src/doctypes/onboard.ts`, and a site running an
   older copy of that schema refuses the whole read rather than returning them
   blank — so `load()` falls back to the four columns that have always been
   there and says which list answered. `s.letterCols` is that answer, and the
   three columns say "not read" rather than "empty" when it is false. An empty
   cell and an unasked question look identical and mean opposite things; this is
   the same distinction the punch panel makes with "nothing recorded".

   What the toolbar can and cannot do divides the way it does everywhere else
   here, though the line has moved. Funnel, search, the page size and the pager
   act on what is already in the browser, so they work. Export builds a file
   from those same rows, so it works.

   The four dialogs are the writes, and they no longer hand off: Generate Bulk
   Letter issues a letter per row of a sheet, Push Letter Into Document files
   issued letters against the people they went to, and Download Existing Letter
   collects them back out. Import and New used to sit here opening the ERPNext
   desk because nothing on this bar could do either job; both were removed once
   those three could — see the note where they were.

   **Email is the one that still cannot.** Send Bulk Email to Employee draws
   their dialog, resolves every address the send would use and writes the list,
   because a browser tab has nowhere to post from and an SMTP credential behind
   a dashboard button is a decision about where the company's mail comes from.
   The ⋮ behind each row has never been opened on their side, so it is drawn
   where they draw it with that written on it rather than filled in with a
   guess.
   --------------------------------------------------------------------------- */

/** Their seven, in their order. `key` is the field on `Employee Letter`; `late`
    marks the three that a short read does not carry. */
const COLS = [
	{ key: "letter_date", label: "Letter Date", kind: "date" },
	{ key: "employee_name", label: "Employee Name" },
	{ key: "letter_number", label: "Letter Number", kind: "num", late: true },
	{ key: "letter_type", label: "Letter Type" },
	{ key: "reference_number", label: "Reference Number", late: true },
	{ key: "remarks", label: "Remarks", late: true },
];

/** Their page-size picker. Ten is the default and is what their footer reads. */
const SIZES = [10, 25, 50, 100];

const NOT_READ = "This column was not in the read that answered. The site refused the longer field list, "
	+ "so nothing is claimed here — an empty cell would be indistinguishable from a column nobody fills in.";

const MAIL_DEAD = "Their envelope mails the selected letters out of the product. Nothing here can send mail: "
	+ "the proxy holds a read token and no mail path, and a mailto: cannot carry the letters as attachments. "
	+ "Export writes the same rows to a file, which is the part a browser can do.";

const DOTS_DEAD = "Factor HR's ⋮ has never been opened, so what is behind it is not known. "
	+ "Drawn where theirs is rather than left out, because a menu quietly dropped is a menu nobody remembers to ask for.";

const Ic = ({ d }) => (
	<svg viewBox="0 0 24 24">
		<path d={d} />
	</svg>
);

/* The glyphs, in the order their toolbar carries them. Kept together so the bar
   reads as one row of decisions rather than six paths inline. */
const D = {
	funnel: "M3 5h18l-7 8v6l-4 2v-8Z",
	search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
	out: "M14 3v5h5M14 3H6v18h12V8Z M12 12v6M9 15l3 3 3-3",
	mail: "M3 6h18v12H3zM3 7l9 6 9-6",
	eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
	pencil: "M4 20h4L20 8l-4-4L4 16Z",
	dots: "M12 5h.01M12 12h.01M12 19h.01",
	/* Their bulk glyph: a sheet with rows, and an arrow out of it. */
	bulk: "M14 3v5h5M14 3H6v18h12V8Z M9 12h6M9 16h6",
	/* Their Download Existing Letter glyph: a sheet with an arrow coming down
	   out of it, against the bulk one's plain rows. */
	dlx: "M14 3v5h5M14 3H6v18h12V8Z M12 11v6M9.5 14.5l2.5 2.5 2.5-2.5",
	/* Push: a folder with a sheet going into it. A folder rather than a second
	   document, because this is the one of the three that moves a letter to
	   another screen — the employee's documents — and three near-identical
	   sheets in a row would be three controls nobody can tell apart. */
	push: "M3 7h6l2 2h10v10H3Z M12 11v5M9.5 13.5l2.5 2.5 2.5-2.5",
};

/** "MT-003-PRADEEP A K" — their Employee Name cell is the code and the name run
    together, and the code is what somebody searches on. It is not on the letter,
    so it comes off the employee record the letter points at; a letter for
    somebody the company filter has excluded has no record here and falls back
    to the name the letter itself stored. */
const whoOf = (s, l) => {
	const code = s.byName[l.employee]?.employee_number;
	const name = l.employee_name || l.employee || "";
	return code ? `${code}-${name}` : name;
};

/** Everything the search box and the row of column boxes leave, newest first.
    One pass, so the footer's count cannot disagree with the rows above it. */
function filtered(s, all) {
	const q = (s.llist.q || "").trim().toLowerCase();
	let out = all;

	if (q) {
		out = out.filter((l) =>
			(whoOf(s, l) + " " + (l.letter_type || "")).toLowerCase().includes(q));
	}
	for (const c of COLS) {
		const v = (s.llist.f[c.key] || "").trim().toLowerCase();
		if (!v) continue;
		out = out.filter((l) => {
			const cell = c.key === "employee_name" ? whoOf(s, l) : l[c.key];
			return String(cell == null ? "" : cell).toLowerCase().includes(v);
		});
	}
	/* Copied before sorting — `s.letters` is the store's own array and every
	   other reader of it gets the order the site sent. */
	return [...out].sort((a, b) => String(b.letter_date || "").localeCompare(String(a.letter_date || "")));
}

/** The stored text of one letter, as it went out.

    Read on demand rather than with the list: a body is a page of HTML and
    twenty of them are not what a table needs. It is also deliberately the
    stored text and not a re-merge — a letter re-merged from a record that has
    since changed is not the letter somebody was handed. */
async function openLetter(name) {
	patch("llist", { show: name, body: "", err: "" });
	try {
		const r = await api(`/api/resource/${encodeURIComponent("Employee Letter")}/${encodeURIComponent(name)}`);
		patch("llist", { body: r?.data?.body || "" });
	} catch (e) {
		patch("llist", { err: String(e.message || e) });
	}
}

/** Their tick column. The head one is the three-state box every list has: on
    when every row on the page is ticked, indeterminate when some are. */
function Tick({ on, mixed, label, onChange }) {
	return (
		<input
			type="checkbox"
			className="letck"
			checked={on}
			aria-label={label}
			ref={(el) => {
				if (el) el.indeterminate = Boolean(mixed) && !on;
			}}
			onChange={onChange}
		/>
	);
}

/** @param {{onCreate: () => void}} p — what their blue button does here. */
export default function CreateLetters({ onCreate }) {
	const s = useApp();
	const full = s.letterCols;

	/* One pass per render, like every other list here. Every screen in this app
	   re-reads the whole store on any change and at this size that is cheap —
	   which is what lets the footer's count, the tick column and the rows above
	   them be incapable of disagreeing. */
	const rows = filtered(s, s.letters);

	const size = s.llist.size;
	const pages = Math.max(1, Math.ceil(rows.length / size));
	const page = Math.min(Math.max(1, s.llist.page), pages);
	const from = (page - 1) * size;
	const here = rows.slice(from, from + size);

	const sel = s.llist.sel;
	const picked = new Set(sel);
	const onPage = here.filter((l) => picked.has(l.name)).length;

	const go = (p) => patch("llist", { page: Math.min(Math.max(1, p), pages) });
	const setF = (key, v) => patch("llist", { f: { ...s.llist.f, [key]: v }, page: 1 });

	const toggle = (name) =>
		patch("llist", { sel: picked.has(name) ? sel.filter((x) => x !== name) : sel.concat(name) });

	/* The head box acts on the page, not on the register — which is what a list
	   with a pager has to mean by it, and why the count beside it says how many
	   are ticked altogether. */
	const toggleAll = () =>
		patch("llist", {
			sel: onPage === here.length
				? sel.filter((n) => !here.some((l) => l.name === n))
				: [...new Set(sel.concat(here.map((l) => l.name)))],
		});

	/* Export writes what is ticked, or everything the filters left when nothing
	   is — which is what somebody pressing it with an empty tick column means.
	   The three late columns are written as they are read: absent, not blank. */
	function exportCsv() {
		const out = sel.length ? rows.filter((l) => picked.has(l.name)) : rows;
		const cols = COLS.filter((c) => full || !c.late);
		download(
			"create-letters.csv",
			toCsv(
				cols.map((c) => c.label),
				out.map((l) => cols.map((c) =>
					c.key === "employee_name" ? whoOf(s, l)
						: c.kind === "date" ? dmy(l.letter_date)
							: l[c.key] == null ? "" : l[c.key])),
			),
		);
	}

	const open = s.llist.show && s.letters.find((l) => l.name === s.llist.show);

	return (
		<div className="fhcat lettab">
			<header>
				<h3>Create Letters</h3>
				<span className={"cov " + (full ? "live" : "part")}>
					{full ? "Their screen, our register" : "Four of seven columns read"}
				</span>

				<span className="right">
					<button className="embtn ic" aria-label="Filter Columns"
						aria-pressed={s.llist.filt}
						title="Their funnel. Opens a box under each heading — the same filtering their column boxes do, on the rows already loaded here."
						onClick={() => patch("llist", { filt: !s.llist.filt, f: {}, page: 1 })}>
						<Ic d={D.funnel} />
					</button>

					{/* Their search sits in the title bar rather than under it, and the
					    magnifier is on the left of the box with a second glyph on the
					    right. Only the left one is a control anywhere. */}
					<span className="letfind">
						<Ic d={D.search} />
						<input type="search" placeholder="Search Employee" aria-label="Search employee"
							value={s.llist.q}
							/* Back to page 1 on every keystroke: a filter that leaves you on
							   page 3 of one result shows an empty table and blames the data. */
							onChange={(e) => patch("llist", { q: e.target.value, page: 1 })} />
					</span>

					<button className="embtn ic" aria-label="Export" onClick={exportCsv}
						disabled={!rows.length}
						title={sel.length
							? `Write the ${sel.length} ticked letter(s) to a CSV file.`
							: "Write these rows to a CSV file — everything the search and the column boxes left. Tick rows to export only those."}>
						<Ic d={D.out} />
					</button>
					{/* **Import and New Letter Document were here and are gone.** Both
					    were hand-offs to the ERPNext desk from a time when nothing on
					    this bar could do the job, and both were superseded on this same
					    toolbar:

					      New Letter Document opened a blank `Employee Letter` on the
					      site. Create Letter, two controls along, opens their own
					      five-field form — which its own tooltip already called "the
					      shorter way in".

					      Import opened the site's Data Import. Generate Bulk Letter does
					      that job here, and does it better: it matches every row to an
					      employee and says what it found *before* anything is written,
					      which is the preview Data Import was being kept for.

					    Removed rather than left as a second way to reach the same place.
					    Eight glyphs on one bar is already the most a person will read,
					    and two of them going somewhere else to do what the bar now does
					    is how a toolbar stops being trusted. The desk is still one click
					    away from every row's own Open on the site. */}
					{/* Their envelope, and it is no longer merely dead. It opens Send
					    Bulk Email to Employee — the dialog it was always the entrance
					    to — which resolves every address the send would use and writes
					    the list, because the send itself is the one thing on these four
					    screens that cannot be made to work. The reason is in the dialog
					    and on its Send button. */}
					<button className="embtn ic" aria-label="Send Bulk Email to Employee"
						title="Open Send Bulk Email to Employee. Nothing here can post mail — the dialog says why, resolves every To, CC and BCC the send would have used, and writes the list for something that can."
						onClick={() => patch("llist", { mail: true })}>
						<Ic d={D.mail} />
					</button>

					{/* Their Generate Bulk Letter, beside the blue one. It is the
					    entrance this register has been missing: one letter has been
					    issued through the single-record form in three years against
					    seventeen maintained formats, because nobody issues letters one
					    at a time. See BulkLetter.jsx. */}
					{/* Their third, and the one that joins this screen to Document
					    Entry: it files an issued letter against the person it went to,
					    so it turns up in that employee's documents. See
					    PushLetters.jsx. */}
					<button className="embtn ic" aria-label="Push Letter Into Document"
						onClick={() => patch("llist", { push: true })}
						title="File issued letters against the people they went to, so they appear in each employee's documents beside their passport and PAN. One file per letter, carrying the letter's own text.">
						<Ic d={D.push} />
					</button>

					{/* Their second dialog, beside the first. The two are siblings and
					    only one of them writes — this one collects letters that have
					    already been issued and hands them back as a printable file. */}
					<button className="embtn ic" data-tip="end" aria-label="Download Existing Letter"
						onClick={() => patch("llist", { dl: true })}
						title="Collect letters already on the register — by type, by date range, optionally narrowed to a list of employee codes — and download them as one printable file, each carrying the text as it was issued.">
						<Ic d={D.dlx} />
					</button>

					<button className="embtn ic" data-tip="end" aria-label="Generate Bulk Letter"
						onClick={() => patch("llist", { bulk: true })}
						title="Issue a letter to every employee in a spreadsheet — their bulk dialog, photographed 4 Sep 2026. Pick a type, attach a CSV of employee codes, and it writes one Employee Letter per row.">
						<Ic d={D.bulk} />
					</button>

					{/* Theirs opens Create New Letter, and so does this: the form
					    photographed 4 Sep 2026, drawn in NewLetter.jsx, in place of this
					    page while it is up. */}
					<button className="embtn pri" onClick={onCreate}
						title="Open Create New Letter — their form, with the letter type, the date, a reference number and remarks. Cancel comes back here.">
						Create Letter
					</button>
				</span>
			</header>

			<Scroll>
				<table>
					<thead>
						<tr>
							<th className="ck">
								<Tick on={here.length > 0 && onPage === here.length} mixed={onPage > 0}
									label="Select every letter on this page" onChange={toggleAll} />
							</th>
							{COLS.map((c) => (
								<th key={c.key} className={(c.kind === "num" ? "num " : "") + (c.late && !full ? "empty" : "")}
									title={c.late && !full ? NOT_READ : undefined}>
									{c.label}
								</th>
							))}
							<th className="act">Actions</th>
						</tr>
						{s.llist.filt ? (
							<tr className="filt">
								<th className="ck" />
								{COLS.map((c) => (
									<th key={c.key}>
										{c.late && !full ? null : (
											<input type="search" value={s.llist.f[c.key] || ""}
												aria-label={`Filter by ${c.label.toLowerCase()}`}
												onChange={(e) => setF(c.key, e.target.value)} />
										)}
									</th>
								))}
								<th className="act" />
							</tr>
						) : null}
					</thead>
					<tbody>
						{here.map((l) => (
							<tr key={l.name}>
								<td className="ck">
									<Tick on={picked.has(l.name)} label={`Select ${l.employee_name || l.name}`}
										onChange={() => toggle(l.name)} />
								</td>
								<td>{dmy(l.letter_date)}</td>
								<td>
									<span className="letwho">
										<i className="letav" aria-hidden="true">{initials(l.employee_name)}</i>
										<span className="fhname">{whoOf(s, l)}</span>
									</span>
								</td>
								<Cell l={l} c={COLS[2]} full={full} />
								<td>{l.letter_type || <span className="muted">-</span>}</td>
								<Cell l={l} c={COLS[4]} full={full} />
								<Cell l={l} c={COLS[5]} full={full} />
								<td className="act">
									<button className="fhact on" aria-label="View the letter"
										title="Show the letter as it was issued — the text stored on the document, not a fresh merge against a record that may have changed since."
										onClick={() => void openLetter(l.name)}>
										<Ic d={D.eye} />
									</button>
									<Desk className="fhact on" label="Edit"
										href={s.site && deskUrl(s.site, "Employee Letter", l.name)}
										title="Open this letter on the ERPNext site, where it can be changed. Nothing on this dashboard writes.">
										<Ic d={D.pencil} />
									</Desk>
									<span className="fhact" role="img" aria-label="More, not available here"
										title={DOTS_DEAD}>
										<Ic d={D.dots} />
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>

			{here.length ? null : (
				<Empty title={s.letters.length ? "Nothing matches" : "No letters on the site"}>
					{s.letters.length
						? <>Nothing matches, out of {fmt(s.letters.length)} issued — clear the search or a column box.</>
						: <>The site holds no <b>Employee Letter</b> at all. Factor HR has issued exactly one in
							three years, so an empty register here is the expected answer rather than a failed read.</>}
				</Empty>
			)}

			<div className="fhfoot">
				<label className="letsize">
					Showing
					<select value={size} aria-label="Rows per page"
						/* Back to page 1: page 3 of a ten-row list is nowhere on a
						   hundred-row one, and landing on an empty table after changing the
						   size reads as the size having broken something. */
						onChange={(e) => patch("llist", { size: Number(e.target.value), page: 1 })}>
						{SIZES.map((n) => <option key={n} value={n}>{n} entries</option>)}
					</select>
					<span className="cnt">
						{rows.length
							? <>· {fmt(from + 1)}–{fmt(from + here.length)} of {fmt(rows.length)}
								{rows.length === s.letters.length ? "" : ` (filtered from ${fmt(s.letters.length)})`}
								{sel.length ? ` · ${fmt(sel.length)} ticked` : ""}</>
							: "· none"}
					</span>
				</label>

				<span className="fhpage">
					<button className="embtn" disabled={page <= 1} onClick={() => go(1)}>First</button>
					<button className="embtn" disabled={page <= 1} onClick={() => go(page - 1)}>Previous</button>
					<label className="cnt">
						Page
						<input type="number" min="1" max={pages} value={page} aria-label="Page number"
							onChange={(e) => go(Number(e.target.value) || 1)} />
						of {fmt(pages)}
					</label>
					<button className="embtn" disabled={page >= pages} onClick={() => go(page + 1)}>Next</button>
					<button className="embtn" disabled={page >= pages} onClick={() => go(pages)}>Last</button>
					<button className="embtn ic" aria-label="Reload from the site" onClick={() => void load()}
						title="Read the site again. The rows here are already loaded; this is for when a letter has been issued there since.">
						↻
					</button>
				</span>
			</div>

			{open ? (
				<Modal
					title={`${open.letter_type || "Letter"} — ${whoOf(s, open)}`}
					wide
					msg={`Issued ${dmy(open.letter_date)}${full && open.letter_number ? ` · letter number ${open.letter_number}` : ""}`}
					why="The text stored on the document, as it went out. Nothing here re-merges it: a letter rebuilt from a record that has changed since is a different letter from the one that was handed over."
					actions={
						<Desk className="embtn" label="Open on the site"
							href={s.site && deskUrl(s.site, "Employee Letter", open.name)}
							title="Open this letter on the ERPNext site.">
							Open on the site
						</Desk>
					}
					extra={
						s.llist.err ? <div className="gap">{s.llist.err}</div>
							: s.llist.body
								/* The site's own stored HTML, written by whoever issued the
								   letter. The site's own stored HTML, rendered as it was stored;
								   nothing here re-merges it — see the note on this dialog. */
								? <div className="letter" dangerouslySetInnerHTML={{ __html: s.llist.body }} />
								: <Empty title="reading the letter…" />
					}
					onClose={() => patch("llist", { show: "", body: "", err: "" })}
				/>
			) : null}

			{s.llist.bulk ? <BulkLetter onClose={() => patch("llist", { bulk: false })} /> : null}
			{s.llist.dl ? <DownloadLetters onClose={() => patch("llist", { dl: false })} /> : null}
			{s.llist.push ? <PushLetters onClose={() => patch("llist", { push: false })} /> : null}
			{s.llist.mail ? <EmailLetters onClose={() => patch("llist", { mail: false })} /> : null}
		</div>
	);
}

/** One of the three columns a short read does not carry. Drawn as "not read"
    rather than as a dash, because a dash is what a column somebody has simply
    not filled in looks like, and those are different answers. */
function Cell({ l, c, full }) {
	if (!full) return <td className="gone" title={NOT_READ}>not read</td>;
	const v = l[c.key];
	return (
		<td className={c.kind === "num" ? "num" : ""}>
			{v == null || v === "" ? <span className="muted">-</span> : v}
		</td>
	);
}
