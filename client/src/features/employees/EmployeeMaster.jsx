import { useState } from "react";
import { getState, set, useApp } from "@/store";
import { go } from "@/routes/router";
import { load } from "@/api/load";
import { saveEmployee } from "@/api/employee";
import { forgetEmployeeDoc } from "@/features/employees/useEmployeeDoc";
import { isOn, needsDetails, scoped, uniq } from "@/lib/scope";
import { fmt, tidyDept } from "@/lib/format";
import EmployeeCard from "@/components/EmployeeCard";
import { NO_SITE } from "@/components/ui";
import { deskImport, deskUrl } from "@/lib/desk";
import { ONB_BLANK } from "@/data/candidates";
import { openEmployee } from "@/features/employees/openEmployee";
import ExportEmployees from "@/features/employees/ExportEmployees";
import { EMP_IMPORTS, EMP_MORE, EXP_BLANK, IMPORT_ICON, MORE_ICON, STATUS_ROWS } from "@/data/employees";
import { employeesLocked } from "@/data/menus";
import KitIcon from "@/components/kit/KitIcon";
import { EmptyState, PageHead, Pager, Pill, Seg, Who } from "@/components/kit/ui";
import { Confirm, DotsMenu, KitDrawer, toast } from "@/components/kit/overlay";

/* Employee Master, in the HRDashboard reference's Employees layout
   (21 October 2026): its heading with Filter and Add new profile, its search
   and Export, its filter drawer and chips, and its table — sortable, ticked,
   a menu on each row, ten to a page — with everything this page already did
   kept: the caret's imports, the ⋯ list, the card view, the reload, the
   machine-code search, the biometric filter, the people added from punches,
   and the read-only lock for the company logins. */

/* The narrowing, as the reference's Filter drawer sets it: each key holds the
   values ticked, and an empty list is "any". A string is still read as one
   value, so a store from before the drawer — or a test that sets one — means
   what it meant. */
const picked = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** The filtered master list. */
export function masterRows(s) {
	const q = s.q.trim().toLowerCase();
	const all = scoped(s);
	let rows = all.filter(
		(e) => !q || [
			e.employee_number, e.employee_name, e.designation, e.department,
			/* The machine code — a punch missing on a report is looked up by it,
			   and until now that meant opening candidates one at a time to find
			   who is enrolled under it. See ATTENDANCE DEVICE ID on EmployeeList. */
			e.attendance_device_id,
			e.prefered_email, e.company_email,
		].some((v) => (v || "").toLowerCase().includes(q)),
	);
	const by = (key, field) => {
		const want = picked(s[key]);
		if (want.length) rows = rows.filter((e) => want.includes(e[field]));
	};
	by("empstatus", "status");
	by("empco", "company");
	by("empdept", "department");
	by("empdesig", "designation");
	by("emptype", "employment_type");
	if (s.empdev === "yes") rows = rows.filter((e) => e.attendance_device_id);
	if (s.empdev === "no") rows = rows.filter((e) => !e.attendance_device_id);
	if (s.empneeds) rows = rows.filter(needsDetails);
	return { all, rows };
}

/** One entry on the Add New Employee caret's list.

    An anchor when there is somewhere on the site to send it and a disabled
    button when there is not — the same bargain `Desk` makes, drawn inside a
    menu rather than as a control of its own. The reason is on the item either
    way, because "Picture Import is greyed out" is a question somebody will ask
    once and should be able to answer by hovering. */
function ImportItem({ row, site, onPick, onGo }) {
	const [label, ico, target, why] = row;
	const href = !target ? "" : target === "import" ? deskImport(site) : deskUrl(site, "Holiday List");
	/* Three states, not two. No target at all is a thing this site cannot do; a
	   target with no site yet is a link that will work in a moment. Saying the
	   first when it is the second sends somebody looking for a missing feature. */
	const dead = !target ? why : !site ? NO_SITE : "";

	const glyph = (
		<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
			strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d={IMPORT_ICON[ico]} />
		</svg>
	);

	/* A page here: navigated to, like the ⋯ menu's pages, not opened in a tab. */
	if (String(target).startsWith("page:")) {
		return (
			<button role="menuitem" title={why}
				onClick={(e) => {
					e.stopPropagation();
					onGo(target.slice(5));
					onPick();
				}}>
				{glyph}
				{label}
			</button>
		);
	}

	if (dead) {
		return (
			<button role="menuitem" disabled title={dead}>
				{glyph}
				{label}
			</button>
		);
	}
	return (
		<a role="menuitem" href={href} target="_blank" rel="noreferrer" title={why}
			/* The document handler leaves anything inside `.empdrop` alone, so a
			   menu that does not close itself here stays open behind the new tab. */
			onClick={onPick}>
			{glyph}
			{label}
		</a>
	);
}

/** One entry on the ⋯ list.

    Three destinations, in the order the table decides them:

      **a page here** — Import From Onboarding, which is a list of who is
      waiting and therefore a read. It navigates like any other page rather than
      opening a tab, so back works and the address is linkable.

      **the desk** — Import From Recruitment. The record that turns an applicant
      into an Employee is an offer with terms on it, and so is the validation
      that guards it; that belongs over there.

      **this page** — the export, which is this screen's own work and which
      nothing on the site does.

    The last of those has a fourth state the others do not: nothing to write. A
    file of headers and no rows is not an empty answer, it is a confusing one. */
function MoreItem({ row, site, empty, onPick, onExport, onGo }) {
	const [label, ico, dt, why, page] = row;

	const glyph = (
		<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
			strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d={MORE_ICON[ico]} />
		</svg>
	);

	/* A page on this site. A button rather than an anchor, because `go` pushes
	   the URL itself — an <a href> beside it would be a second answer to where
	   this leads, and the two would drift. */
	if (page) {
		return (
			<button role="menuitem" title={why}
				onClick={(e) => {
					e.stopPropagation();
					onGo(page);
					onPick();
				}}>
				{glyph}
				{label}
			</button>
		);
	}

	if (!dt) {
		const dead = empty ? "Nothing to export — nobody is loaded for this company." : "";
		return (
			<button role="menuitem" disabled={!!dead} title={dead || why}
				onClick={(e) => {
					e.stopPropagation();
					onExport();
					onPick();
				}}>
				{glyph}
				{label}
			</button>
		);
	}

	if (!site) {
		return (
			<button role="menuitem" disabled title={NO_SITE}>
				{glyph}
				{label}
			</button>
		);
	}

	return (
		<a role="menuitem" href={deskUrl(site, dt)} target="_blank" rel="noreferrer" title={why}
			/* Same as the import list: `.empdrop` is exempt from the document
			   handler, so the menu has to close itself on the way out. */
			onClick={onPick}>
			{glyph}
			{label}
		</a>
	);
}

/* The drawer's groups, in the reference's order with ours added: what each
   narrows, the store key it writes and the field it reads. Status always lists
   Active and Inactive, counted or not (STATUS_ROWS) — a filter that appears only
   once somebody has that status is one nobody knows exists. */
const FILTER_GROUPS = [
	["Company", "empco", "company"],
	["Department", "empdept", "department"],
	["Designation", "empdesig", "designation"],
	["Status", "empstatus", "status"],
	["Employment type", "emptype", "employment_type"],
];
const DEV_OPTS = [["", "Any"], ["yes", "Enrolled on a machine"], ["no", "Phone or nothing"]];
const PER = { list: 10, grid: 12 };

/** The reference's Filter drawer: a ticked list per field with how many hold
    each value, Reset, and Apply. Nothing narrows until Apply. */
function FilterDrawer({ s, all, onClose }) {
	const [draft, setDraft] = useState(() => Object.fromEntries([
		...FILTER_GROUPS.map(([, key]) => [key, picked(s[key])]),
		["empdev", s.empdev || ""],
	]));
	const values = (field) => {
		const seen = uniq(all, field);
		return field === "status" ? [...new Set([...STATUS_ROWS.map((r) => r[0]), ...seen])] : seen;
	};
	const toggle = (key, v) => setDraft((d) => ({
		...d, [key]: d[key].includes(v) ? d[key].filter((x) => x !== v) : d[key].concat([v]),
	}));
	return (
		<KitDrawer title="Filter" sub="Narrow down the employee list." onClose={onClose}>
			<form onSubmit={(e) => {
				e.preventDefault();
				set({ ...draft, empall: false });
				const n = activeCount(draft);
				toast(n ? `${n} filter${n === 1 ? "" : "s"} applied` : "Filters cleared");
				onClose();
			}}>
				{FILTER_GROUPS.filter(([, key]) => key !== "empco" || !s.company).map(([label, key, field]) => {
					const opts = values(field);
					if (!opts.length) return null;
					return (
						<div className="k-sec" style={{ padding: 16 }} key={key}>
							<h3 style={{ margin: "0 0 6px", fontSize: 14 }}>{label}</h3>
							{opts.map((o) => (
								<label className="k-chk-l" key={o}>
									<input type="checkbox" className="k-chk" checked={draft[key].includes(o)}
										onChange={() => toggle(key, o)} />
									{field === "department" ? tidyDept(o) : o}
									<span className="k-muted" style={{ marginLeft: "auto", fontSize: 12 }}>
										{all.filter((e) => e[field] === o).length}
									</span>
								</label>
							))}
						</div>
					);
				})}
				<div className="k-sec" style={{ padding: 16 }}>
					<h3 style={{ margin: "0 0 6px", fontSize: 14 }}>Biometric</h3>
					{DEV_OPTS.map(([v, l]) => (
						<label className="k-chk-l" key={v || "any"}>
							<input type="radio" name="empdev" checked={draft.empdev === v}
								onChange={() => setDraft((d) => ({ ...d, empdev: v }))} />
							{l}
						</label>
					))}
				</div>
				<div className="k-modal-f" style={{ position: "sticky", bottom: -26, background: "rgb(var(--card))", padding: "14px 0" }}>
					<button type="button" className="k-btn k-btn-line"
						onClick={() => setDraft({ ...Object.fromEntries(FILTER_GROUPS.map(([, k]) => [k, []])), empdev: "" })}>
						Reset
					</button>
					<button type="submit" className="k-btn k-btn-ink">Apply filter</button>
				</div>
			</form>
		</KitDrawer>
	);
}

/** How many values the drawer has ticked, for the count on the Filter button. */
function activeCount(st) {
	return FILTER_GROUPS.reduce((n, [, key]) => n + picked(st[key]).length, 0) + (st.empdev ? 1 : 0);
}

/** One person's line manager as the reference writes one: @ and a first name. */
const atName = (s, e) => {
	const m = s.byName[e.reports_to || ""];
	return m ? "@" + String(m.employee_name || m.name).split(" ")[0].toLowerCase() : "—";
};
const mailOf = (e) => e.prefered_email || e.company_email || e.personal_email || "";

/* The reference's sortable columns: label and the field each sorts by. */
const COLS = [
	["employee_name", "Employee Name"],
	["employee_number", "Employee ID"],
	["designation", "Job Title"],
	["reports_to", "Line Manager", false],
	["department", "Department"],
	["company", "Company"],
	["employment_type", "Type"],
	["attendance_device_id", "Device ID", false],
	["status", "Status"],
];

export default function EmployeeMaster() {
	const s = useApp();
	const readOnly = employeesLocked(s.user);
	const { all, rows } = masterRows(s);
	const view = s.empview === "grid" ? "grid" : "list";
	const [sort, setSort] = useState({ k: "employee_name", d: 1 });
	const [page, setPage] = useState(1);
	const [sel, setSel] = useState(() => new Set());
	const [drawer, setDrawer] = useState(false);
	const [ask, setAsk] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	/* Records the bridge made from a fingerprint punch, still to be completed. */
	const needing = all.filter((e) => isOn(e) && needsDetails(e)).length;

	const sorted = rows.slice().sort((a, b) =>
		String(a[sort.k] || "").localeCompare(String(b[sort.k] || ""), undefined, { numeric: true }) * sort.d);
	const per = PER[view];
	const pages = Math.max(1, Math.ceil(sorted.length / per));
	const at = Math.min(page, pages);
	const shown = sorted.slice((at - 1) * per, at * per);
	const nFilters = activeCount(s);
	const chips = [
		...FILTER_GROUPS.flatMap(([, key]) => picked(s[key]).map((v) => [key, v])),
		...(s.empdev ? [["empdev", DEV_OPTS.find((o) => o[0] === s.empdev)?.[1] || s.empdev]] : []),
	];
	const dropChip = ([key, v]) => {
		set(key === "empdev" ? { empdev: "" } : { [key]: picked(s[key]).filter((x) => x !== v) });
		setPage(1);
	};
	const clearAll = () => {
		set({ ...Object.fromEntries(FILTER_GROUPS.map(([, k]) => [k, []])), empdev: "", q: "", empneeds: false });
		setPage(1);
	};
	const sortBy = (k) => setSort((o) => ({ k, d: o.k === k ? -o.d : 1 }));
	const pageAllOn = shown.length > 0 && shown.every((e) => sel.has(e.name));

	/* Deactivate or Activate everybody ticked: the profile's own write, one
	   field, `status`, as the signed-in person — the site decides whether they
	   may, and a refusal names who it was. Never a delete (D11). */
	async function setStatusAll(status) {
		setBusy(true);
		setErr("");
		const refused = [];
		let done = 0;
		for (const name of sel) {
			const r = await saveEmployee(name, { status });
			if (!r.ok) { refused.push(`${s.byName[name]?.employee_name || name}: ${r.error}`); continue; }
			done++;
			const { employees, byName } = getState();
			const row = { ...byName[name], status };
			set({ employees: employees.map((e) => (e.name === name ? row : e)), byName: { ...byName, [name]: row } });
			forgetEmployeeDoc(name);
		}
		setBusy(false);
		setAsk("");
		setSel(new Set());
		if (done) toast(`${done} ${done === 1 ? "person" : "people"} set to ${status}`);
		if (refused.length) setErr(`The site refused ${refused.length}: ${refused.join("; ")}`);
	}

	const exportNow = () => set({
		exp: {
			...EXP_BLANK(),
			open: true,
			company: s.company || "",
			status: picked(s.empstatus)[0] || "",
			filterBy: picked(s.empdept).length ? "department" : picked(s.empdesig).length ? "designation" : "",
			filterVal: picked(s.empdept)[0] || picked(s.empdesig)[0] || "",
			carried: picked(s.empdept).length && picked(s.empdesig).length ? picked(s.empdesig)[0] : "",
		},
	});

	return (
		<div className="kit k-enter">
			<PageHead title="Employee" sub={`Manage your employees · ${fmt(rows.length)}${rows.length === all.length ? "" : " of " + fmt(all.length)} people`}>
				<button type="button" className="k-btn k-btn-line" onClick={() => setDrawer(true)}>
					<KitIcon name="filter" size={18} stroke={2} />Filter
					{nFilters ? <span className="k-pill k-p-green k-nodot" style={{ padding: "1px 8px" }}>{nFilters}</span> : null}
				</button>
				{/* Add one person, and the caret for many: the split button the page
				    always had, in the reference's ink. Not drawn for a login that only
				    reads employees (data/menus.js employeesLocked). */}
				{!readOnly && <span className="empdrop joined">
					<button type="button" className="k-btn k-btn-ink" style={{ borderRadius: "12px 0 0 12px" }}
						onClick={() => go({ section: "employees", subtab: "new" })}>
						<KitIcon name="plus" size={18} stroke={2} />Add new profile
					</button>
					<button type="button" className="k-btn k-btn-ink" style={{ borderRadius: "0 12px 12px 0", padding: "0 10px", marginLeft: 1 }}
						aria-haspopup="menu" aria-expanded={s.empnew} aria-label="Import employees"
						onClick={(e) => { e.stopPropagation(); set({ empnew: !s.empnew, empmore: false }); }}>
						<KitIcon name="chev" size={16} stroke={2} />
					</button>
					<div className="emmenu end" role="menu" aria-label="Import employees" hidden={!s.empnew}>
						{EMP_IMPORTS.map((row) => (
							<ImportItem key={row[0]} row={row} site={s.site}
								onPick={() => set({ empnew: false })}
								onGo={(pg) => go({ section: "employees", subtab: pg })} />
						))}
					</div>
				</span>}
				<span className="empdrop">
					<button type="button" className="k-btn k-btn-line" style={{ padding: "0 12px" }}
						aria-haspopup="menu" aria-expanded={s.empmore} aria-label="More employee actions"
						onClick={(e) => { e.stopPropagation(); set({ empmore: !s.empmore, empnew: false }); }}>
						<KitIcon name="more" size={20} stroke={2} />
					</button>
					<div className="emmenu end" role="menu" aria-label="More employee actions" hidden={!s.empmore}>
						{EMP_MORE.filter((row) => !readOnly || !row[2]).map((row) => (
							<MoreItem key={row[0]} row={row} site={s.site} empty={!all.length}
								onPick={() => set({ empmore: false })}
								onExport={exportNow}
								onGo={(pg) => go({ section: "employees", subtab: pg, onb: ONB_BLANK() })} />
						))}
					</div>
				</span>
			</PageHead>

			{(needing > 0 || s.empneeds) && (
				<div className={"k-alert empneeds" + (s.empneeds ? " on" : "")} role="status">
					<span className="k-a-ic"><KitIcon name="info" size={18} stroke={2} /></span>
					<p>
						<b>{fmt(needing)}</b> {needing === 1 ? "person was" : "people were"} added automatically from
						fingerprint punches. Their gender and date of birth are placeholders until somebody corrects them.
					</p>
					<button type="button" className="k-btn k-btn-ink k-btn-sm" aria-pressed={Boolean(s.empneeds)}
						onClick={() => { set({ empneeds: !s.empneeds }); setPage(1); }}>
						{s.empneeds ? "Show everybody" : "Show them"}
					</button>
				</div>
			)}

			<div className="k-card">
				<div className="k-filters" style={{ gridTemplateColumns: "minmax(240px,1fr) auto auto auto" }}>
					<div className="k-inp-ic">
						<KitIcon name="search" size={18} stroke={2} />
						{/* One search behind two boxes: this writes through to the top
						    bar's, so a filter typed in either is the same filter. */}
						<input className="k-inp" type="search" placeholder="Search name, email, title, code or machine code"
							aria-label="Search employees, by name or machine code" value={s.q}
							onChange={(e) => { set({ q: e.target.value }); setPage(1); }} />
					</div>
					<Seg label="View" value={view} options={[["list", "Table"], ["grid", "Cards"]]}
						onChange={(v) => { set({ empview: v }); setPage(1); }} />
					<button type="button" className="k-btn k-btn-line" style={{ padding: "0 13px" }}
						title="Reload from the site" aria-label="Reload from the site" onClick={() => void load()}>
						<KitIcon name="refresh" size={18} stroke={2} />
					</button>
					<button type="button" className="k-btn k-btn-line" disabled={!all.length} onClick={exportNow}>
						<KitIcon name="upload" size={18} stroke={2} />Export
					</button>
				</div>

				<div className="k-res-bar">
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
						<span>{fmt(rows.length)} {rows.length === 1 ? "person" : "people"}</span>
						{chips.map((c) => (
							<span className="k-tag" key={c.join(":")}>
								{c[0] === "empdept" ? tidyDept(c[1]) : c[1]}
								<button type="button" aria-label={`Remove ${c[1]} filter`} onClick={() => dropChip(c)}>
									<KitIcon name="x" size={12} stroke={2.4} />
								</button>
							</span>
						))}
						{chips.length || s.q || s.empneeds ? (
							<button type="button" className="k-btn k-btn-ghost k-btn-sm" onClick={clearAll}>Clear all</button>
						) : null}
					</div>
					{sel.size && !readOnly ? (
						<div className="k-row-act">
							<span style={{ alignSelf: "center", fontWeight: 600, color: "rgb(var(--ink))" }}>{sel.size} selected</span>
							<button type="button" className="k-btn k-btn-line k-btn-sm" onClick={() => setAsk("Active")}>Activate</button>
							<button type="button" className="k-btn k-btn-line k-btn-sm" style={{ color: "rgb(var(--bad))" }}
								onClick={() => setAsk("Inactive")}>Deactivate</button>
						</div>
					) : null}
				</div>
				{err ? <p className="k-err" role="alert" style={{ marginBottom: 10 }}>{err}</p> : null}

				{!rows.length ? (
					<EmptyState icon="search" title="No one matches these filters"
						sub={`${fmt(all.length)} people are loaded. Try a different name, or clear the filters to see everyone.`}>
						<button type="button" className="k-btn k-btn-line k-btn-sm" onClick={clearAll}>Clear filters</button>
					</EmptyState>
				) : view === "grid" ? (
					<div className="cards">
						{shown.map((e) => <EmployeeCard key={e.name} e={e} onOpen={() => openEmployee(e.name)} />)}
					</div>
				) : (
					<div className="k-tbl-wrap">
						<table className="k-rt">
							<thead>
								<tr>
									{!readOnly ? (
										<th style={{ width: 44 }} className="k-sel-col">
											<span>
												<input type="checkbox" className="k-chk" aria-label="Select all on this page" checked={pageAllOn}
													onChange={(ev) => setSel((o) => {
														const n = new Set(o);
														for (const e of shown) ev.target.checked ? n.add(e.name) : n.delete(e.name);
														return n;
													})} />
											</span>
										</th>
									) : null}
									{COLS.map(([k, l, sortable]) => {
										if (sortable === false) return <th key={k}><span>{l}</span></th>;
										const on = sort.k === k;
										return (
											<th key={k} aria-sort={on ? (sort.d > 0 ? "ascending" : "descending") : "none"}>
												<button type="button" className={`${on ? "k-on" : ""}${on && sort.d < 0 ? " k-desc" : ""}`.trim() || undefined}
													onClick={() => sortBy(k)}>
													{l}<KitIcon name="chev" size={14} stroke={2.2} />
												</button>
											</th>
										);
									})}
									<th><span /></th>
								</tr>
							</thead>
							<tbody>
								{shown.map((e) => {
									const on = isOn(e);
									/* Not Active: the name and the status. Their details stay
									   hidden while they are not active, as they always were. */
									const hid = <span className="k-muted" title="Details are hidden while this person is not active">—</span>;
									return (
										<tr key={e.name} data-emp={e.name} className={"k-click" + (on ? "" : " emp-off")} tabIndex={0}
											title="Open this record"
											onClick={() => openEmployee(e.name)}
											onKeyDown={(ev) => { if (ev.key === "Enter") openEmployee(e.name); }}>
											{!readOnly ? (
												<td className="k-sel-col" onClick={(ev) => ev.stopPropagation()}>
													<input type="checkbox" className="k-chk" aria-label={`Select ${e.employee_name}`}
														checked={sel.has(e.name)}
														onChange={(ev) => setSel((o) => {
															const n = new Set(o);
															ev.target.checked ? n.add(e.name) : n.delete(e.name);
															return n;
														})} />
												</td>
											) : null}
											<td className="k-title-cell"><Who name={e.employee_name || e.name} sub={on ? mailOf(e) : ""} /></td>
											<td data-label="Employee ID" className="k-num">{on ? e.employee_number || "—" : hid}</td>
											<td data-label="Job Title">{on ? e.designation || "—" : hid}</td>
											<td data-label="Line Manager">{on ? atName(s, e) : hid}</td>
											<td data-label="Department">{on ? tidyDept(e.department) || "—" : hid}</td>
											<td data-label="Company">{on ? e.company || "—" : hid}</td>
											<td data-label="Type">{on ? e.employment_type || "—" : hid}</td>
											<td data-label="Device ID" className="k-num">
												{!on ? hid : e.attendance_device_id ? e.attendance_device_id : <span className="k-pill k-p-grey k-nodot">phone</span>}
											</td>
											<td data-label="Status"><Pill status={e.status || "Inactive"} /></td>
											<td data-label="" onClick={(ev) => ev.stopPropagation()}>
												<DotsMenu label={`More for ${e.employee_name}`} items={[
													{ label: "View profile", icon: "user", onClick: () => openEmployee(e.name) },
													...(readOnly ? [] : [
														"-",
														on
															? { label: "Deactivate", icon: "door", danger: true, onClick: () => { setSel(new Set([e.name])); setAsk("Inactive"); } }
															: { label: "Activate", icon: "tick", onClick: () => { setSel(new Set([e.name])); setAsk("Active"); } },
													]),
												]} />
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
				{rows.length ? <Pager total={sorted.length} page={at} per={per} onPage={setPage} /> : null}
			</div>

			{drawer ? <FilterDrawer s={s} all={all} onClose={() => { setDrawer(false); setPage(1); }} /> : null}
			{ask ? (
				<Confirm
					title={`${ask === "Inactive" ? "Deactivate" : "Activate"} ${sel.size} ${sel.size === 1 ? "person" : "people"}?`}
					sub={ask === "Inactive"
						? "Their status is set to Inactive and their details are hidden until they are activated again. Nothing is deleted."
						: "Their status is set to Active and their details are shown again."}
					ok={busy ? "Working…" : ask === "Inactive" ? "Deactivate" : "Activate"}
					danger={ask === "Inactive"}
					onClose={() => { if (!busy) { setAsk(""); } }}
					onOk={() => setStatusAll(ask)} />
			) : null}
			{s.exp.open ? (
				<ExportEmployees onClose={() => set({ exp: { ...s.exp, open: false } })} />
			) : null}
		</div>
	);
}
