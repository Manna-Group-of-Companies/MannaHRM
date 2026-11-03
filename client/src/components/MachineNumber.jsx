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
/** A name, compared as a machine stores it: case and spacing ignored. */
const sameName = (a, b) => {
	const k = (v) => String(v || "").toLowerCase().replace(/[^a-z]/g, "");
	return Boolean(k(a)) && k(a) === k(b);
};

export default function MachineNumber({ value, employees, onPick, name }) {
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
	const found = numberProblem(value, { site, machines });
	/* The machine already calling this number by the name being created is
	   the person themselves — New on the machine's Create Employee, every time
	   — and their punches belong here. Somebody else's name on it is still the
	   warning (2 November 2026). */
	const held = found?.kind === "machine" ? machines.get(String(value).trim()) : null;
	const own = held && sameName(held.name_on_device, name) ? held : null;
	const problem = own ? null : found;
	const free = nextFreeNumber({ site, machines });

	return (
		<div className="machinenum" data-kind={problem ? problem.kind : value ? "ok" : "empty"}>
			{own ? (
				<p><b>Machine Code {value}</b> is {own.name_on_device} on {own.device_id}. Their punches come to this record.</p>
			) : null}
			{problem ? <p><b>Machine Code:</b> {problem.text}</p> : null}
			{!problem && !own && value ? (
				<p><b>Machine Code {value}</b> is held by nobody, here or on {machines.size} user(s) read off the machines.</p>
			) : null}
			{/* A suggestion only while the number is missing or wrong: offered
			    beside a number that is this person's own, it reads as "change
			    it", and taking it would strand their punches on the old one. */}
			{own || (value && !problem) ? null : free ? (
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
