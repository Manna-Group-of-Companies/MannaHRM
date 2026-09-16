import { useEffect, useState } from "react";

import { listAll } from "@/api/client";
import { Empty, Gap, Scroll } from "@/components/ui";
import { RELATED } from "@/data/manage";
import { listFields } from "@/data/schema";
import { cell } from "@/features/records/cell";

/* ---------------------------------------------------------------------------
   The records that belong to the one on the form — the people on a machine.

   Read-only by design. Every row here is written by something other than a
   person at this screen (the bridge, for the machine's users), so the form it
   sits in may be editable while this list is not, and it draws no controls
   that would suggest otherwise.

   Read when the form opens rather than carried in with the list above it. The
   list shows forty machines; nobody wants 443 people per machine read to draw
   a row they will not open.
   --------------------------------------------------------------------------- */

export default function Related({ doctype, doc }) {
	const rel = RELATED[doctype];
	const [mine, theirs] = rel.match;
	const key = doc[mine];
	const [rows, setRows] = useState(null);
	const [err, setErr] = useState("");
	const [find, setFind] = useState("");

	const cols = listFields(rel.doctype);

	useEffect(() => {
		let live = true;
		if (!key) { setRows([]); return undefined; }
		setRows(null);
		setErr("");
		listAll(rel.doctype, ["name", ...cols.map((f) => f.name)], [[theirs, "=", key]])
			.then((found) => { if (live) setRows(rel.sort ? [...found].sort(rel.sort) : found); })
			.catch((e) => {
				if (!live) return;
				/* The doctype is new, and a site that has not got it yet answers
				   with its own message — passed on rather than guessed at. */
				setErr(e?.message || "The site would not answer.");
				setRows([]);
			});
		return () => { live = false; };
		/* eslint-disable-next-line */
	}, [doctype, key]);

	const shown = (rows || []).filter((r) => {
		if (!find.trim()) return true;
		const hay = [r.name, ...cols.map((f) => r[f.name])].join(" ").toLowerCase();
		return hay.includes(find.trim().toLowerCase());
	});

	return (
		<section className="related" aria-label={rel.title}>
			<div className="legend">
				<b className="font-display">{rel.title}</b>
				<span>{rows == null ? "reading…" : rel.summary ? rel.summary(rows) : `${rows.length}`}</span>
			</div>

			{rows && rows.length ? (
				<div className="embar">
					<label className="find">
						<span aria-hidden="true">🔎</span>
						<input type="search" value={find} placeholder="Search by number or name…"
							aria-label={`Search ${rel.title}`}
							onChange={(e) => setFind(e.target.value)} />
					</label>
				</div>
			) : null}

			{err ? <Gap>{err}</Gap> : null}

			{rows && rows.length === 0 && !err ? <Empty title="Nobody yet">{rel.empty}</Empty> : null}

			{shown.length ? (
				<Scroll>
					<table>
						<thead>
							<tr>{cols.map((f) => <th key={f.name}>{f.label}</th>)}</tr>
						</thead>
						<tbody>
							{shown.map((r) => (
								<tr key={r.name}>
									{cols.map((f) => (
										<td key={f.name} className={f.kind === "check" ? "num" : undefined}>
											{cell(r[f.name], f)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</Scroll>
			) : null}
		</section>
	);
}
