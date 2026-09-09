import { useEffect, useState } from "react";

import { listAll } from "@/api/client";
import { read, remove } from "@/api/crud";
import { download, toCsv } from "@/lib/csv";
import { todayIso } from "@/lib/format";
import { Empty, Gap, Modal, Note, Scroll } from "@/components/ui";
import { canCreate, canDelete } from "@/lib/write";
import { SCHEMA, listFields } from "@/data/schema";
import RecordForm from "@/features/records/RecordForm";

/* ---------------------------------------------------------------------------
   Every record of one doctype, with New, Edit and Delete.

   The list columns and the form fields both come from `data/schema.js`, which
   is generated from the doctype JSON the server installs — so this one screen
   serves all fifteen of this app's record doctypes and none of them can drift
   from the table behind it.

   The controls are **Factor HR's own**, read off seven of their pages on
   8 September 2026 — see `data/actions.js`. Add New, Search, Generate Report,
   and a per-row `edit record` and `delete record`. Somebody who used their
   screens every morning finds the same things in the same places.

   Three decisions worth stating, because each is the opposite of the obvious
   one:

   - **A row opens the form; it does not edit in place.** An inline editor makes
     every row look writable, including the ones the site will refuse, and it
     saves on blur — which means a mis-click is a write. A form has a Cancel.
   - **Delete asks twice, and on most doctypes it is not drawn at all.** Their
     bin sits on every row of every list. Here `lib/write.NEVER_DELETE` decides,
     and where it says no the page prints the reason instead of a greyed-out
     control that reads as a permission problem.
   - **The list re-reads after a write rather than patching itself.** The site
     names the record, fills what it derives and normalises what it was sent; a
     screen that patched its own copy would disagree with the site by one
     character until somebody reloaded.
   --------------------------------------------------------------------------- */

export default function RecordList({ doctype, title, note }) {
	const spec = SCHEMA[doctype];
	const [rows, setRows] = useState(null);
	const [err, setErr] = useState("");
	const [open, setOpen] = useState(null); // null | {} for new | the doc being edited
	const [busy, setBusy] = useState(false);
	const [find, setFind] = useState("");
	const [killing, setKilling] = useState(null);

	const cols = listFields(doctype);
	const fields = ["name", ...cols.map((f) => f.name)];

	async function load() {
		setBusy(true);
		setErr("");
		try {
			setRows(await listAll(doctype, fields));
		} catch (e) {
			/* A doctype this app installs but the site has not got answers 417,
			   which is the same code a missing *field* answers — so the site's own
			   message is passed through rather than being guessed at. */
			setErr(e?.message || "The site would not answer.");
			setRows([]);
		}
		setBusy(false);
	}

	useEffect(() => { load(); /* eslint-disable-next-line */ }, [doctype]);

	if (!spec) return <Gap>This app does not install a doctype called <b>{doctype}</b>.</Gap>;

	const creatable = canCreate(doctype);
	const deletable = canDelete(doctype, null);

	/* Matches any column on screen, because the column somebody is searching by
	   is the one they can see. Theirs searches the loaded page the same way. */
	const shown = (rows || []).filter((r) => {
		if (!find.trim()) return true;
		const hay = [r.name, ...cols.map((f) => r[f.name])].join(" ").toLowerCase();
		return hay.includes(find.trim().toLowerCase());
	});

	const csv = () => download(
		`${doctype.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${todayIso()}.csv`,
		toCsv(["name", ...cols.map((f) => f.name)], shown.map((r) => {
			const o = { name: r.name };
			cols.forEach((f) => { o[f.name] = r[f.name] == null ? "" : String(r[f.name]); });
			return o;
		})),
	);

	async function destroy(name) {
		setBusy(true);
		const r = await remove(doctype, name);
		setBusy(false);
		setKilling(null);
		if (!r.ok) { setErr(r.error); return; }
		load();
	}

	async function edit(name) {
		const r = await read(doctype, name);
		if (!r.ok) { setErr(r.error); return; }
		setOpen(r.doc);
	}

	return (
		<>
			<div className="legend">
				<b className="font-display">{title || doctype}</b>
				<span>{rows == null ? "reading…" : `${rows.length} ${rows.length === 1 ? "record" : "records"}`}</span>
			</div>

			<div className="embar">
				<label className="find">
					<span aria-hidden="true">🔎</span>
					<input type="search" value={find} placeholder={`Search ${title || doctype}…`}
						aria-label={`Search ${title || doctype}`}
						onChange={(e) => setFind(e.target.value)} />
				</label>
				<button type="button" className="embtn" onClick={load} disabled={busy}>
					{busy ? "Reading…" : "Refresh"}
				</button>
				<button type="button" className="embtn" onClick={csv} disabled={shown.length === 0}>
					Export CSV
				</button>
				<span className="grow" />
				{creatable.ok ? (
					<button type="button" className="embtn pri" onClick={() => setOpen({})}>New</button>
				) : (
					/* Said rather than greyed out. A disabled New reads as a permission
					   this reader has not got; every reason here is a fact about the
					   doctype instead. */
					<span className="text-fine text-ink-3">{creatable.why}</span>
				)}
			</div>

			{err ? <Gap>{err}</Gap> : null}

			{rows && rows.length && shown.length === 0 ? (
				<Empty title="Nothing matches that">
					{rows.length} {rows.length === 1 ? "record" : "records"} were read; none of them has
					“{find}” in a column shown here.
				</Empty>
			) : null}

			{rows && rows.length === 0 && !err ? (
				<Empty title={`No ${doctype} records yet`}>
					{creatable.ok
						? "New makes the first one. It is written straight to the site."
						: creatable.why}
				</Empty>
			) : null}

			{shown.length ? (
				<Scroll>
					<table>
						<thead>
							<tr>
								<th>ID</th>
								{cols.map((f) => <th key={f.name}>{f.label}</th>)}
								<th />
							</tr>
						</thead>
						<tbody>
							{shown.map((r) => (
								<tr key={r.name}>
									<td className="mono">{r.name}</td>
									{cols.map((f) => (
										<td key={f.name} className={f.kind === "check" ? "num" : undefined}>
											{cell(r[f.name], f)}
										</td>
									))}
									{/* Their two row icons, in their order. The bin is absent
									    rather than disabled where the doctype should not be
									    deleted — the reason is printed under the table. */}
									<td className="rowacts">
										<button type="button" className="embtn" title="Edit record"
											onClick={() => edit(r.name)}>Edit</button>
										{deletable.ok ? (
											<button type="button" className="embtn bad" title="Delete record"
												onClick={() => setKilling(r.name)}>Delete</button>
										) : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</Scroll>
			) : null}

			{!deletable.ok && deletable.why ? (
				<Note>
					<b>Records here are not deleted.</b> {deletable.why}
				</Note>
			) : null}

			{note ? <Note>{note}</Note> : null}

			{killing ? (
				<Modal
					title={`Delete ${killing}?`}
					onClose={() => setKilling(null)}
					extra={
						<p className="text-read">
							{deletable.warn
								|| "This removes the record from the site. It cannot be undone from here."}
						</p>
					}
					foot={
						<button type="button" className="embtn bad" disabled={busy}
							onClick={() => destroy(killing)}>
							{busy ? "Deleting…" : "Delete it"}
						</button>
					}
				/>
			) : null}

			{open ? (
				<RecordForm
					doctype={doctype}
					doc={open.name ? open : null}
					onCancel={() => setOpen(null)}
					onDone={() => { setOpen(null); load(); }}
				/>
			) : null}
		</>
	);
}

/** One value, as a person reads it. A blank is a dash on screen — the CSV
    exports elsewhere in this app write "" for the same value, because a dash is
    a thing a reader needs and a thing a data file must not have. */
function cell(v, f) {
	if (f.kind === "check") return Number(v) ? "Yes" : "No";
	if (v == null || v === "") return <span className="text-ink-3">—</span>;
	return String(v);
}
