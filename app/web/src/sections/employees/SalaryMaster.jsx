import { patch, set, useApp } from "@/state/store";
import { scoped } from "@/lib/scope";
import { fmt, tidyDept, todayIso } from "@/lib/format";
import { download, toCsv } from "@/lib/csv";
import { Desk, Empty } from "@/components/ui";
import { deskImport, deskNew, deskUrl } from "@/lib/desk";

/* Factor HR's Salary Master, photographed 29 August 2026: the title with three
   icons at its right edge, one bar — the status dot, Search Employee, add, a
   list icon, and List of Employees over on the right — and under it nothing at
   all until somebody is picked:

       No Employee Selected
       Please select employee for show salary revisions

   Their words and their grammar, copied rather than tidied, for the same reason
   the regularization screen copies its own: this page exists to be held up
   against theirs, and a sentence rewritten is a sentence that cannot be
   compared. **Their screen is one person at a time**, and that is the model
   being reproduced — not the report on Employees → CTC, which is everybody at
   once.

   What this screen cannot do is show a revision: no salary doctype is on the
   proxy's allowlist, and none of them holds a row on the site anyway. It is
   drawn regardless, because an empty screen that names the thing it is missing
   is the shape payroll will have to fill, and it can be put in front of HR
   before a rupee is loaded. */

/** One of the title-bar icons. `href` sends it to the site, `onClick` does the
    job here, and neither draws it disabled with the reason on it — which is
    still the right answer for the one that has nowhere to go. */
function TitleIcon({ path, label, title, href, onClick }) {
	const ico = (
		<svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" fill="none"
			strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
			<path d={path} />
		</svg>
	);
	if (href !== undefined) {
		return <Desk className="embtn" href={href} label={label} title={title}>{ico}</Desk>;
	}
	return (
		<button className="embtn" disabled={!onClick} title={title} aria-label={label} onClick={onClick}>
			{ico}
		</button>
	);
}

/* The same coloured dot as Employee Master and Regularization, because it is
   the same control on their screen. Its own selection, though: a filter set on
   one screen is not a filter set on another, and sharing them would silently
   hide people here. */
function SalDot({ s }) {
	const opts = [
		["Active", "on", "Active"], ["Inactive", "off", "InActive"], ["", "all", "All"],
	];
	const cur = opts.find((o) => o[0] === s.sal.status) || opts[2];
	return (
		<span className="empdrop">
			<button className="embtn" aria-haspopup="listbox" aria-label="Filter by status"
				aria-expanded={s.sal.menu} title={"Status: " + cur[2]}
				/* Out of the document handler's way, which would otherwise close the
				   menu in the same click that opened it. */
				onClick={(e) => { e.stopPropagation(); patch("sal", { menu: !s.sal.menu }); }}>
				<i className={"sdot " + cur[1]} />
				<b className="cx">▾</b>
			</button>
			<div className="emmenu" role="listbox" aria-label="Status" hidden={!s.sal.menu}>
				{opts.map((o) => (
					<button key={o[0] || "all"} role="option" aria-selected={o[0] === s.sal.status}
						onClick={(e) => { e.stopPropagation(); patch("sal", { status: o[0], menu: false }); }}>
						<i className={"sdot " + o[1]} />
						{o[2]}
					</button>
				))}
			</div>
		</span>
	);
}

/** A person, as the search picker and the List of Employees panel both draw
    them — one row shape, so a choice made either way is the same choice. */
const PickRow = ({ e }) => (
	<button onClick={() => patch("sal", { emp: e.name, q: "", list: false })}>
		<i className={"sdot " + (e.status === "Active" ? "on" : "off")} />
		<b>{e.employee_name}</b>
		<span className="mono">{e.employee_number || "—"}</span>
		<span className="muted">{tidyDept(e.department)}</span>
	</button>
);

/* Who the two pickers can offer. Scoped by company like every other screen,
   then by the dot — which is what the dot is for on their screen as well. */
/** What this screen can honestly put in a file: who is in scope, and the one
    pay figure the site holds for them. Named for what it is rather than for
    what their button says, and the CTC column carries the caveat in its own
    heading — a spreadsheet outlives the screen that made it. */
function salCsv(s, pool) {
	const cols = ["Employee code", "Name", "Company", "Department", "Designation", "Status",
		"CTC (yearly, undated)"];
	download(
		"salary-master-" + todayIso() + ".csv",
		toCsv(cols, pool.map((e) => [
			e.employee_number || e.name,
			e.employee_name || "",
			e.company || "",
			tidyDept(e.department),
			e.designation || "",
			e.status || "",
			e.ctc || "",
		])),
	);
}

function salPool(s) {
	const rows = scoped(s);
	return s.sal.status ? rows.filter((e) => e.status === s.sal.status) : rows;
}

/** Their empty state carries a washed-out drawing of a page. Kept, because the
    blankness is the message and a bare line of text on its own reads as a page
    that failed to load rather than a page with nothing to show. */
const NothingArt = () => (
	<svg className="art stroke-ink-3" viewBox="0 0 160 104" width="152" height="99" fill="none"
		strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
		aria-hidden="true">
		<path d="M54 22h32l22 22v52H54z" />
		<path d="M86 22v22h22" />
		<path d="M64 58h34M64 70h34M64 82h20" />
		<path d="M34 16v8M30 20h8M128 30v7M124.5 33.5h7M26 66v7M22.5 69.5h7M134 74v7M130.5 77.5h7" />
		<circle cx="44" cy="46" r="1.5" />
		<circle cx="120" cy="16" r="1.5" />
		<circle cx="142" cy="52" r="1.5" />
		<circle cx="20" cy="42" r="1.5" />
		<circle cx="118" cy="92" r="1.5" />
	</svg>
);

export default function SalaryMaster() {
	const s = useApp();
	const pool = salPool(s);
	const emp = s.sal.emp ? s.byName[s.sal.emp] : null;
	const q = (s.sal.q || "").trim().toLowerCase();
	const withCtc = s.employees.filter((e) => e.ctc);

	const matches = q
		? pool
			.filter((e) => [e.employee_number, e.employee_name, e.designation]
				.some((v) => (v || "").toLowerCase().includes(q)))
			.slice(0, 8)
		: [];

	return (
		<>
			<div className="legend">
				<b className="font-display">Salary Master</b>
				<span className="cov none">Not built</span>
				<span>
					Their screen is drawn; the payroll behind it has not been started, and this page will not
					imply otherwise. <b>The only pay figure it can show is the one undated CTC on the person.</b>
				</span>
			</div>

			<div className="fhscreen">
				<div className="fhtitle row">
					Salary Master
					<span className="ics">
						{/* Locking a master against edits is a permission, not a switch — on
						    the site it is one row in the Role Permissions Manager, and that is
						    where this goes. Nothing here writes at all: salary is the one
						    table where even a read-only window is a leak, which is why no
						    payroll doctype is on the proxy's allowlist. See app/serve.js. */}
						<TitleIcon path="M7 11V7a5 5 0 0 1 10 0M5 11h14v10H5z" label="Lock"
							href={s.site && s.site + "/app/permission-manager"}
							title="Locks the master against edits. On the site that is a permission rather than a switch — this opens the Role Permissions Manager, where write is taken off a role. Nothing here writes at all." />
						{/* The wizard is on the site and it previews before it writes,
						    which is the only reason this one is offered at all: the
						    structure it loads into does not exist yet, and a half-loaded
						    payroll pays somebody the wrong amount. Over there that shows up
						    as a refused row rather than as a payslip. */}
						<Desk href={s.site && deskImport(s.site)} label="Import"
							title="Loads salary from a spreadsheet. Opens ERPNext's Data Import on the site — nothing is written until the preview there is accepted, and the structure this would load into does not exist yet.">
							<svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" fill="none"
								strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
								<path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
							</svg>
						</Desk>
						{/* It exports what this screen actually holds, which is not their
						    salary master — it is the people and the one undated CTC figure on
						    each of them. The header row says as much, so a file that leaves
						    this page cannot be mistaken for a salary register. E1 is the
						    export that would fill the rest. */}
						<TitleIcon path="M14 4h5v16h-5M10 8l4 4-4 4M3 12h11" label="Export"
							onClick={pool.length ? () => salCsv(s, pool) : undefined}
							title={pool.length
								? `Export these ${fmt(pool.length)} people and their CTC as CSV. Not a salary register — CTC is one undated number, and it is the only pay figure this site holds.`
								: "Nobody is in scope to export."} />
					</span>
				</div>

				<div className="embar salbar">
					<SalDot s={s} />

					<span className="find rev">
						<input type="search" placeholder="Search Employee" aria-label="Search employee"
							value={s.sal.q || ""} onChange={(e) => patch("sal", { q: e.target.value })} />
						<svg className="stroke-ink-3" viewBox="0 0 24 24" width="15" height="15" fill="none"
							strokeWidth="1.8" strokeLinecap="round">
							<circle cx="11" cy="11" r="7" />
							<path d="M20 20l-3.6-3.6" />
						</svg>
					</span>

					{/* A revision is a dated change to what somebody is paid, and of
					    every write this dashboard does not make it is the one it should
					    be least able to make. It opens on the site, where the approval
					    and the audit trail on it are. */}
					<Desk className="embtn ic" label="Add salary revision"
						href={s.site && deskNew(s.site, "Salary Structure Assignment")}
						title="A revision is a dated change to what somebody is paid. Opens a new Salary Structure Assignment on the ERPNext site — nothing here writes salary, and no payroll doctype is even on this proxy's allowlist.">
						+
					</Desk>
					<Desk className="embtn ic" label="Revision list"
						href={s.site && deskUrl(s.site, "Salary Structure Assignment")}
						title="Their second view of this screen, which has never been screenshotted open — so this opens ours: every dated salary assignment on the site. Expect it to be empty until payroll is started.">
						<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none"
							strokeWidth="1.7" strokeLinecap="round">
							<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
						</svg>
					</Desk>

					<button className="embtn list" aria-pressed={s.sal.list}
						title="Pick from everybody rather than by typing — their second way into the same choice"
						onClick={() => patch("sal", { list: !s.sal.list, q: "" })}>
						List of Employees
					</button>
				</div>

				{/* The picker their search box opens under itself. Ours says how many
				    people it searched, because the dot can empty it and a search that
				    finds nobody should say which filter did that. */}
				{!emp && q ? (
					<div className="regfind">
						{matches.length ? (
							matches.map((e) => <PickRow key={e.name} e={e} />)
						) : (
							<span className="none">
								Nobody matches, out of {fmt(pool.length)} searched
								{s.sal.status ? ` · status ${s.sal.status}` : ""}
							</span>
						)}
					</div>
				) : null}

				{!emp && s.sal.list ? (
					<div className="regfind sallist">
						{pool.length ? (
							pool.slice(0, 300).map((e) => <PickRow key={e.name} e={e} />)
						) : (
							<span className="none">Nobody is loaded under this filter.</span>
						)}
					</div>
				) : null}

				{!emp ? (
					/* Their words, their grammar. It is the screen. */
					<div className="regnone">
						<b>No Employee Selected</b>
						<span>Please select employee for show salary revisions</span>
						<NothingArt />
					</div>
				) : (
					<>
						<div className="regwho">
							<i className={"sdot " + (emp.status === "Active" ? "on" : "off")} />
							<b>{emp.employee_name}</b>
							<span className="mono">{emp.employee_number || "—"}</span>
							<span className="muted">{tidyDept(emp.department)} · {emp.company}</span>
							<span className="n">{emp.ctc ? `CTC ₹${fmt(emp.ctc)}` : "no CTC on the record"}</span>
							<button className="embtn" onClick={() => patch("sal", { emp: "", q: "" })}>Clear</button>
						</div>

						{/* Not an empty table under their headings. A revision is a dated
						    change to a Salary Structure Assignment and this side holds none
						    for anybody, so the count is zero for every person who can be
						    picked — and saying that once is honest, where a header row over
						    nothing implies rows that could arrive. */}
						<Empty title={`No salary revisions for ${emp.employee_name}`}>
							{emp.ctc ? (
								<>
									The record carries <code>ctc</code> ₹{fmt(emp.ctc)} and nothing else about pay. That
									is one undated number — <b>what somebody costs, not how they are paid, and not when
									it last changed</b>. A revision needs a Salary Structure Assignment, and none exist.
								</>
							) : (
								<>
									The record carries no <code>ctc</code> and no structure. {fmt(withCtc.length)} of{" "}
									{fmt(s.employees.length)} people loaded hold even that one number.
								</>
							)}
						</Empty>
					</>
				)}
			</div>

			<div className="mt-4">
			</div>
		</>
	);
}
