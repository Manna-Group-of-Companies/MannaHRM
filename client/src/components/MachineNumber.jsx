import { useEffect, useState } from "react";

import { listAll } from "@/api/client";
import { heldOnMachines, heldOnSite, nextFreeNumber, numberProblem } from "@/lib/freenumber";

/* The Machine Code check, under that box on Create Employee.

   It exists because the number is the only link between a finger and a person,
   and the three ways of getting it wrong all look fine on this screen: a number
   another record holds, a number the gate has already given to somebody the
   site has never heard of, and a number nobody can check because the machines'
   user lists are not on the site yet.

   The roster is what the bridge writes on every pass. Read here rather than
   through the store because this is the only screen that needs it and it is one
   small request. */
export default function MachineNumber({ value, employees, onPick }) {
	const [rows, setRows] = useState(null);
	const [read, setRead] = useState(false);

	useEffect(() => {
		void (async () => {
			try {
				setRows(await listAll("Attendance Device User", ["device_user_id", "name_on_device", "device_id", "on_device"], [["on_device", "=", 1]]));
			} catch {
				/* No doctype, or no permission. Left null, which is "cannot tell"
				   and never "free" — see lib/freenumber.js. */
				setRows(null);
			} finally {
				setRead(true);
			}
		})();
	}, []);

	if (!read) return null;

	const site = heldOnSite(employees);
	const machines = rows ? heldOnMachines(rows) : null;
	const problem = numberProblem(value, { site, machines });
	const free = nextFreeNumber({ site, machines });

	return (
		<div className="machinenum" data-kind={problem ? problem.kind : value ? "ok" : "empty"}>
			{problem ? <p><b>Machine Code:</b> {problem.text}</p> : null}
			{!problem && value ? (
				<p><b>Machine Code {value}</b> is held by nobody, here or on {machines.size} user(s) read off the machines.</p>
			) : null}
			{!value ? (
				<p>
					The Machine Code is the number the machine knows this person by — the Enroll No in eSSL, or
					the User ID the gate showed when the finger was added. Without it every punch they make is
					refused.
				</p>
			) : null}
			{free ? (
				<button type="button" className="btn ghost" onClick={() => onPick(free)}>
					Use {free} — free on both lists
				</button>
			) : (
				<p className="muted">
					No number can be suggested until the machines&rsquo; user lists reach this site. Take it from
					eSSL, or from the machine: Menu → User Mgt.
				</p>
			)}
		</div>
	);
}
