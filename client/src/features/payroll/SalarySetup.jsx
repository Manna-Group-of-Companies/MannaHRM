import { useEffect, useMemo, useState } from "react";

import { useApp } from "@/store";
import { loadSetup } from "@/api/salarysetup";
import { periodOf } from "@/lib/payroll";
import { needsStructure } from "@/lib/salarysetup";
import { lastMonth } from "@/lib/payrollrun";
import { payRows } from "@/features/payroll/shared";
import SalaryUpload from "@/features/payroll/SalaryUpload";
import { Note, Panel, Scroll, Tile, Tiles } from "@/components/ui";

/* PAYROLL → SALARY SETUP. Ours, 2 October 2026 — where payroll starts.

   hrms leaves anybody without a Salary Structure Assignment off the salary run
   without a word, so the first job on a new site is to give each person a
   structure and a base pay. One sheet does it for everybody — salary, bank and
   cash, PF and ESI (features/payroll/SalaryUpload.jsx, 9 October 2026); both
   documents are hrms's own, made and submitted, and hrms checks them on the
   site.

   **Nothing here picks a rate or works out a wage.** Whatever is uploaded is
   what is stored.

   The two hand-entry steps under the sheet — make a structure, then give it to
   ticked people — were removed on 22 October 2026, asked for by HR; the sheet
   does both. lib/salarysetup.js and api/salarysetup.js still hold their rules. */

const rs = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function SalarySetup() {
	const s = useApp();
	const { company } = s;

	const [data, setData] = useState({ components: undefined, structures: undefined, assignments: undefined });
	const [folded, setFolded] = useState({});

	const end = periodOf(lastMonth()).iso[1];
	const read = async () => {
		const d = await loadSetup(company);
		setData(d);
		return d;
	};
	useEffect(() => {
		let live = true;
		setData({ components: undefined, structures: undefined, assignments: undefined });
		loadSetup(company).then((d) => { if (live) setData(d); });
		return () => { live = false; };
	}, [company]);

	const structures = data.structures || [];
	const people = payRows(s);
	const waiting = useMemo(
		() => needsStructure(people, data.assignments || [], end, company),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[data.assignments, s.employees, company, end],
	);
	const assigned = (data.assignments || []).slice().sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
	const reading = data.structures === undefined;

	const open = (id, dflt) => (folded[id] === undefined ? dflt : !folded[id]);
	const toggle = (id, dflt) => () => setFolded({ ...folded, [id]: open(id, dflt) });

	return (
		<div className="paypage susetup">
			<div className="emhead">
				<h2>Salary Setup</h2>
				<span className="n">{company || "pick a company"}</span>
				<span className="right">
					<button type="button" className="embtn" onClick={() => void read()}>Refresh</button>
				</span>
			</div>

			<Tiles>
				<Tile k="People" n={people.length} s={company || "all companies"} />
				<Tile k="Have a structure" n={reading ? "…" : people.length - waiting.length} />
				<Tile k="Still to set up" n={reading ? "…" : waiting.length} s={waiting.length ? "not on the salary run" : ""} />
				<Tile k="Structures" n={reading ? "…" : structures.length} />
			</Tiles>

			{!company && <Note className="warn">Pick a company in the top bar. A salary structure belongs to one company, and so does everybody you give it to.</Note>}
			{data.structures === null && <Note className="warn">This login may not read salary structures on the site — it needs HR Manager.</Note>}

			<SalaryUpload company={company} data={data} open={open("upload", true)} onToggle={toggle("upload", true)} onSaved={read} />

			<Panel title={`Already set up — ${assigned.length}`} ico="✔" shut={!open("done", false)} onToggle={toggle("done", false)}>
				{assigned.length === 0 ? <p className="muted">Nobody yet.</p> : (
					<Scroll>
						<table className="fptable" aria-label="People with a salary structure">
							<thead><tr><th>Person</th><th>Structure</th><th>From</th><th>Base pay</th></tr></thead>
							<tbody>
								{assigned.map((a) => (
									<tr key={a.name}>
										<td>{a.employee_name || a.employee}</td><td>{a.salary_structure}</td><td>{a.from_date}</td><td className="num">{rs(a.base)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</Scroll>
				)}
			</Panel>
		</div>
	);
}
