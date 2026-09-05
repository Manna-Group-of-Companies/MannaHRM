import { patch, useApp } from "@/store";
import { scoped } from "@/lib/scope";
import { fmt, tidyDept } from "@/lib/format";
import { EMP_LIST_COLS, EMP_LIST_SIZE, FH_CATEGORY_TYPES } from "@/data/masters";

/* Factor HR's List of Employees, photographed 31 August 2026 and drawn here
   control for control: three dropdowns across the top, nine columns with a sort
   handle on each and a filter box under each, and their pager at the foot —
   First, Previous, a page number you can type into, of N, Next, Last, and a
   reload.

   It is the panel Salary Master's "List of Employees" button opens, and what it
   is *for* is choosing somebody: their screen is one person at a time, and this
   is their second way into that choice. So every row is a button, and picking
   one closes the panel and lands on that person — the same thing the search box
   above it does, and deliberately the same row shape.

   Two columns have nothing behind them on this site. See `none` in
   EMP_LIST_COLS: `Employee` here carries no PAN and no Aadhaar field, checked
   against the live doctype rather than inferred. They are drawn empty and say
   so on hover, because a column quietly dropped is a column nobody remembers to
   ask for — and the answer may well be that neither should be stored.

   The pager is theirs down to the running number down the left, which counts
   across pages rather than restarting at 1 on each. That is not decoration: it
   is what somebody reads out over a phone. */

/** Every value a column can show, in the order the fields are preferred. First
    one with something in it wins — which is how EMAIL works, ERPNext keeping
    three and Frappe treating `prefered_email` as the address. */
function cell(e, col) {
	if (!col.get) return "";
	for (const f of col.get) {
		const v = e[f];
		if (v != null && String(v).trim()) return String(v);
	}
	return "";
}

/* dd-mmm-yyyy, the way their capture writes a joining date. Frappe hands over
   `2011-06-01`; "01-Jun-2011" is what HR reads, and the month in letters is the
   one format that cannot be misread as day-first or month-first. */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function asDate(iso) {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
	if (!m) return iso || "";
	return `${m[3]}-${MON[Number(m[2]) - 1]}-${m[1]}`;
}

/** The two-step pair across the top. `type` picks which field is being filtered
    and `cat` a value of it — which is what their pair does, one list narrowing
    the next.

    Their own Category Type master holds eight rows and two of them are not
    groupings at all: Gratuity Applicable and LWF Applicable are statutory pay
    treatment, filed beside Department. Those have no field on our side to
    filter by, so they are offered and disabled with the reason rather than
    left out — the gap is the finding. See FH_CATEGORY_TYPES. */
function Cats({ s, rows }) {
	const types = FH_CATEGORY_TYPES;
	const picked = types.find((t) => t.name === s.elist.type);
	const values = picked?.field
		? [...new Set(rows.map((e) => e[picked.field]).filter(Boolean))].sort()
		: [];

	return (
		<div className="elcats">
			<label>
				<span>Category type</span>
				<select value={s.elist.type} aria-label="Category type"
					title="Their first dropdown. It chooses which field the second one filters on — the same two steps their Category Type master is built as."
					onChange={(e) => patch("elist", { type: e.target.value, cat: "", page: 1 })}>
					<option value="">All</option>
					{types.map((t) => (
						<option key={t.name} value={t.name} disabled={!t.field}>
							{t.name}{t.field ? "" : " — nothing on this site answers it"}
						</option>
					))}
				</select>
			</label>

			<label>
				<span>Category</span>
				<select value={s.elist.cat} disabled={!picked?.field} aria-label="Category"
					title={picked?.field
						? `Values of ${picked.field} across the people loaded — read off them rather than from a list, so it cannot offer a category nobody is in.`
						: "Pick a category type first."}
					onChange={(e) => patch("elist", { cat: e.target.value, page: 1 })}>
					<option value="">All</option>
					{values.map((v) => (
						<option key={v} value={v}>{picked.field === "department" ? tidyDept(v) : v}</option>
					))}
				</select>
			</label>

			<label>
				<span>Employee status</span>
				<select value={s.elist.status} aria-label="Employee status"
					onChange={(e) => patch("elist", { status: e.target.value, page: 1 })}>
					<option value="">All</option>
					{["Active", "Inactive", "Suspended", "Left"].map((v) => (
						<option key={v} value={v}>{v}</option>
					))}
				</select>
			</label>
		</div>
	);
}

/** Their sort handle, and which way it is pointing. Both arrows drawn when the
    column is not the sorted one — that is their control, and it is also the
    honest one: it says the column *can* be sorted rather than implying it is. */
const Sorter = ({ on, dir }) => (
	<svg viewBox="0 0 10 14" width="9" height="12" aria-hidden="true" className="srt">
		<path d="M5 1L9 6H1z" className={on && dir < 0 ? "dim" : ""} />
		<path d="M5 13L1 8h8z" className={on && dir > 0 ? "dim" : ""} />
	</svg>
);

/** Everything the three dropdowns and the eight boxes leave. One pass, so a
    count in the footer cannot disagree with the rows above it. */
function filtered(s, rows) {
	const type = FH_CATEGORY_TYPES.find((t) => t.name === s.elist.type);
	const f = s.elist.f;

	let out = rows;
	if (type?.field && s.elist.cat) out = out.filter((e) => e[type.field] === s.elist.cat);
	if (s.elist.status) out = out.filter((e) => e.status === s.elist.status);

	for (const col of EMP_LIST_COLS) {
		const q = (f[col.key] || "").trim().toLowerCase();
		if (!q) continue;
		out = out.filter((e) => {
			const v = col.kind === "date" ? String(e.date_of_joining || "") : cell(e, col);
			return v.toLowerCase().includes(q);
		});
	}

	if (s.elist.sort) {
		const col = EMP_LIST_COLS.find((c) => c.key === s.elist.sort);
		if (col) {
			/* Copied before sorting: `rows` is the store's own array, and sorting it
			   in place would reorder every other screen reading the same list. */
			out = [...out].sort((a, b) => {
				/* Dates compare as the ISO strings they arrive as, which sorts
				   correctly; everything else compares as text, case-insensitively,
				   with a numeric pass so EMPCODE MT-2 lands before MT-10. */
				const x = col.kind === "date" ? String(a.date_of_joining || "") : cell(a, col);
				const y = col.kind === "date" ? String(b.date_of_joining || "") : cell(b, col);
				return s.elist.dir * x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });
			});
		}
	}
	return out;
}

/** Their pager, and the two things it has to be right about: which rows are on
    screen, and how many there are altogether. */
function Pager({ s, total, from, to, pages, onReload, busy }) {
	const go = (p) => patch("elist", { page: Math.min(Math.max(1, p), pages) });
	const page = Math.min(s.elist.page, pages);

	return (
		<div className="elpage">
			<span className="cnt">
				{total
					? <>Showing {fmt(from + 1)} to {fmt(to)} of {fmt(total)} entries</>
					: "No entries"}
			</span>
			<span className="pg">
				<button className="embtn" disabled={page <= 1} onClick={() => go(1)}>First</button>
				<button className="embtn" disabled={page <= 1} onClick={() => go(page - 1)}>Previous</button>
				<label>
					Page
					<input type="number" min="1" max={pages || 1} value={page} aria-label="Page number"
						onChange={(e) => go(Number(e.target.value) || 1)} />
					of {fmt(pages || 1)}
				</label>
				<button className="embtn" disabled={page >= pages} onClick={() => go(page + 1)}>Next</button>
				<button className="embtn" disabled={page >= pages} onClick={() => go(pages)}>Last</button>
				{/* Theirs is a reload of the table. Ours re-reads the site, which is
				    the only thing that could have changed — the rows are already all
				    in the browser. */}
				<button className="embtn ic" aria-label="Reload from the site" disabled={busy}
					title={busy ? "Reading…" : "Re-read the people from the site. The rows here are already loaded; this is for when somebody has been added on the site since."}
					onClick={onReload}>
					{busy ? "…" : "⟳"}
				</button>
			</span>
		</div>
	);
}

/** @param {{pool: object[], onPick: (e: object) => void, onReload?: () => void, busy?: boolean}} p */
export default function EmployeeList({ pool, onPick, onReload, busy }) {
	const s = useApp();
	const rows = pool || scoped(s);
	const shown = filtered(s, rows);

	const pages = Math.max(1, Math.ceil(shown.length / EMP_LIST_SIZE));
	const page = Math.min(s.elist.page, pages);
	const from = (page - 1) * EMP_LIST_SIZE;
	const here = shown.slice(from, from + EMP_LIST_SIZE);

	const sortBy = (key) => patch("elist", {
		sort: key,
		dir: s.elist.sort === key ? -s.elist.dir : 1,
		page: 1,
	});
	const setF = (key, v) => patch("elist", { f: { ...s.elist.f, [key]: v }, page: 1 });

	const anyFilter = s.elist.type || s.elist.status
		|| EMP_LIST_COLS.some((c) => (s.elist.f[c.key] || "").trim());

	return (
		<div className="ellist">
			<Cats s={s} rows={rows} />

			<div className="elscroll">
				<table className="eltab">
					<thead>
						<tr>
							{/* Their running number. Not sortable and not filterable: it is a
							    position in the list, not a fact about a person. */}
							<th className="n">SL NO</th>
							{EMP_LIST_COLS.map((c) => (
								<th key={c.key} className={c.none ? "empty" : ""}
									title={c.none || `Sort by ${c.label.toLowerCase()}`}>
									<button className="hd" onClick={() => sortBy(c.key)} disabled={Boolean(c.none)}>
										{c.label}
										{c.none ? null : <Sorter on={s.elist.sort === c.key} dir={s.elist.dir} />}
									</button>
								</th>
							))}
						</tr>
						<tr className="filt">
							<th className="n" />
							{EMP_LIST_COLS.map((c) => (
								<th key={c.key}>
									{c.none ? null : (
										<input
											type={c.kind === "date" ? "date" : "search"}
											value={s.elist.f[c.key] || ""}
											aria-label={`Filter by ${c.label.toLowerCase()}`}
											onChange={(e) => setF(c.key, e.target.value)} />
									)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{here.map((e, i) => (
							<tr key={e.name}>
								<td className="n">{from + i + 1}</td>
								{EMP_LIST_COLS.map((c) => {
									const v = cell(e, c);
									/* The whole row is the control, so every cell carries the
									   button — one tab stop per cell is worse than one per row,
									   but a row of nine buttons is what makes any part of it
									   clickable, which is what somebody expects of a list they
									   are picking from. */
									return (
										<td key={c.key} className={c.key}>
											<button className="pick" onClick={() => onPick(e)}
												title={`Pick ${e.employee_name}`}>
												{c.none ? <span className="muted">—</span>
													: c.kind === "date" ? asDate(v)
														: c.key === "status" ? <><i className={"sdot " + (v === "Active" ? "on" : "off")} />{v}</>
															: v || <span className="muted">-</span>}
											</button>
										</td>
									);
								})}
							</tr>
						))}
						{here.length ? null : (
							<tr className="none">
								<td colSpan={EMP_LIST_COLS.length + 1}>
									{rows.length
										? <>Nobody matches, out of {fmt(rows.length)} loaded{anyFilter ? " — clear a filter above" : ""}.</>
										: "Nobody is loaded."}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<Pager s={s} total={shown.length} from={from} to={from + here.length}
				pages={pages} onReload={onReload} busy={busy} />
		</div>
	);
}
