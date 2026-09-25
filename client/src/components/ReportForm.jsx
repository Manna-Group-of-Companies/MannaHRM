import { fmt } from "@/lib/format";
import { Html, Note } from "@/components/ui";
import EmpPick from "@/components/EmpPick";

/* The attendance reports' one form: company, status, employee, dates, and a
   file. In / Out, Daily Detail and Monthly Basic all draw this, so the three
   ask the same questions in the same place and a fix to one is a fix to all.
   It holds no state of its own — each page keeps its answers in its own slice
   and says what a change means. */

export const STATUSES = [["Active", "Active"], ["Inactive", "Inactive"], ["Left", "Left"], ["", "All"]];

/** Who the Employee picker offers: the company and status chosen, by name. */
export const pickable = (employees, co, status) =>
	employees
		.filter((e) => (!co || e.company === co) && (!status || (e.status || "") === status))
		.slice()
		.sort((x, y) => String(x.employee_name || x.name).localeCompare(String(y.employee_name || y.name)));

export default function ReportForm({
	title, state, live, companies, co, onCo, status, onStatus, people, who, onWho,
	from, till, onDates, format, onFormat, onDownload, busy, msg,
}) {
	return (
		<section className="fhcat">
			<header>
				<h3>{title}</h3>
				<span className="right">
					<span className={"cov " + (live ? "live" : "part")}>{state}</span>
				</span>
			</header>

			<div className="iotop">
				<div className="iof">
					<span className="lab">Company</span>
					<span className="ctl">
						<select className="grow" aria-label="Company" value={co} onChange={(e) => onCo(e.target.value)}>
							<option value="">All companies</option>
							{companies.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
						</select>
					</span>
				</div>

				<div className="iof">
					<span className="lab">Employee Status</span>
					<span className="ctl">
						<select aria-label="Employee status" value={status} onChange={(e) => onStatus(e.target.value)}>
							{STATUSES.map((o) => <option key={o[1]} value={o[0]}>{o[1]}</option>)}
						</select>
					</span>
				</div>

				<div className="iof">
					<span className="lab">Employee</span>
					<span className="ctl">
						<EmpPick people={people} value={who} onChange={onWho}
							all={`All employees (${fmt(people.length)})`} />
					</span>
				</div>

				<div className="iof">
					<span className="lab">Date</span>
					<span className="ctl">
						<input type="date" aria-label="From date" value={from}
							onChange={(e) => onDates({ from: e.target.value })} />
						<span className="text-ink-3">–</span>
						<input type="date" aria-label="To date" value={till}
							onChange={(e) => onDates({ till: e.target.value })} />
					</span>
				</div>

				<div className="iof">
					<span className="lab">Format</span>
					<span className="ctl">
						<select aria-label="Format" value={format === "PDF" ? "PDF" : "Excel"}
							onChange={(e) => onFormat(e.target.value)}>
							<option>Excel</option>
							<option>PDF</option>
						</select>
						<button type="button" className="embtn pri" disabled={busy} onClick={onDownload}>
							Download
						</button>
					</span>
				</div>
			</div>

			{msg && (
				<div className="px-[.9rem] pb-[.9rem]">
					<Note><Html html={msg} /></Note>
				</div>
			)}
		</section>
	);
}

/** The figures over a report, as tiles. `[label, number, tone?, why?]`. */
export function Tiles({ items }) {
	return (
		<div className="tiles mt-[.9rem]">
			{items.map(([k, v, tone, why]) => (
				<div key={k} className="tile" title={why}>
					<span className="k">{k}</span>
					<span className={"n " + (tone || "")}>{fmt(v)}</span>
				</div>
			))}
		</div>
	);
}
