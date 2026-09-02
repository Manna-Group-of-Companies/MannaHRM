import { openEmployee } from "@/features/employees/EmployeeMaster";
import { dmy, fmt, tidyDept } from "@/lib/format";
import { Empty, Scroll } from "@/components/ui";

/* ---------------------------------------------------------------------------
   Who a screen is about, listed from what the dashboard already holds.

   Factor HR's report screens list nothing until Generate is pressed, and that
   is copied here, because it is right for the *report*: a report that runs on
   open is a report nobody chose the filters for. It was wrong for the *screen*.
   A page showing one sentence and no rows cannot be told from a page that
   failed to read, and every one of these screens is about the same people the
   dashboard read at load — so it can say who, at the scope and criteria set on
   the form, before anybody presses anything.

   Nothing here calls the site. If a listing costs a request it does not belong
   in this component; that is the line between what a screen can show for free
   and what Generate is for.

   A row goes to that person's profile, the same as a row on Employee Master —
   so Employee Profile's own "nobody picked" state uses this too, and there the
   click is simply how somebody is picked.
   --------------------------------------------------------------------------- */

/** @param {{people: any[], note?: any, extra?: [string, (e: any) => any], cap?: number}} props */
export default function People({ people, note, extra, cap = 200 }) {
	if (!people.length) {
		return (
			<Empty title="Nobody in scope">
				No employee is left after the criteria on this form. The company selector in the top bar
				narrows every page, so check that first.
			</Empty>
		);
	}

	const shown = people.slice(0, cap);

	return (
		<>
			<div className="legend">
				<b className="font-display">{fmt(people.length)} people</b>
				<span className="cov live">Already read</span>
				<span>
					{note}
					{people.length > cap
						? ` The first ${fmt(cap)} are on screen.`
						: ""}
				</span>
			</div>

			<Scroll>
				<table>
					<thead>
						<tr>
							<th>Emp code</th>
							<th>Name</th>
							<th>Company</th>
							<th>Department</th>
							<th>Designation</th>
							<th>Status</th>
							<th>Joined</th>
							{extra ? <th>{extra[0]}</th> : null}
						</tr>
					</thead>
					<tbody>
						{shown.map((e) => (
							<tr key={e.name} data-emp={e.name} title="Open this person's profile"
								onClick={() => openEmployee(e.name)}>
								<td className="mono">{e.employee_number || "—"}</td>
								<td>{e.employee_name || e.name}</td>
								<td className="muted">{e.company || "—"}</td>
								<td className="muted">{tidyDept(e.department) || "—"}</td>
								<td>{e.designation || "—"}</td>
								<td>
									<i className={"sdot " + (e.status === "Active" ? "on" : "off")} /> {e.status || "—"}
								</td>
								<td className="mono muted">
									{e.date_of_joining ? dmy(e.date_of_joining) : "—"}
								</td>
								{extra ? <td>{extra[1](e)}</td> : null}
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>
		</>
	);
}
