import { useCallback, useEffect, useRef, useState } from "react";

import { ask, machines, waitFor } from "@/api/machinecmd";
import { readRoster } from "@/api/onmachine";
import { ADD, CHECK, commandState } from "@/lib/machinecmd";
import { machineVerdict } from "@/lib/onmachine";

/* "Is this person on the machine?", and "put them on it" — from a page that
   cannot reach a machine.

   Two different routes, and the box uses both:

   - **The roster.** The bridge writes every machine's user list to the site on
     each pass, so the answer is usually already here. Free, and up to five
     minutes old.
   - **A command.** Leaves a `Machine Command` for the bridge, which goes to the
     machine and answers in about twenty seconds. That is the one to use while
     somebody is standing at the gate, and the only one that can *add* a user.

   The usual order is: create the record here, add them to the machine from
   here, then somebody at the gate puts the finger on. Only the finger cannot be
   done from a web page — the template is made by the sensor and exists nowhere
   else (docs/NEW_EMPLOYEE.md). */
export default function OnMachine({ number, employee, employeeName }) {
	const [read, setRead] = useState(null);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const [devices, setDevices] = useState([]);
	const [device, setDevice] = useState("");
	const [job, setJob] = useState(null);
	const gone = useRef(false);

	useEffect(() => () => { gone.current = true; }, []);

	const check = useCallback(async () => {
		setBusy(true);
		setErr("");
		try {
			setRead(await readRoster(number));
		} catch (e) {
			setErr(e?.message || String(e));
		} finally {
			setBusy(false);
		}
	}, [number]);

	useEffect(() => { void check(); }, [check]);

	useEffect(() => {
		void (async () => {
			try {
				const found = await machines();
				setDevices(found);
				/* Chosen for them when there is only one, which is every plant
				   with one gate — a select with one option is a question nobody
				   should have to answer. */
				if (found.length === 1) setDevice(found[0].device_id || found[0].name);
			} catch { /* the picker simply does not appear */ }
		})();
	}, []);

	/** Leave a command for the bridge and follow it until it answers. */
	const send = useCallback(async (action) => {
		setJob({ action, row: null, waited: 0 });
		try {
			const made = await ask({
				device_id: device,
				action,
				device_user_id: number,
				name_on_device: employeeName,
				employee,
			});
			const row = await waitFor(made.name, {
				stop: () => gone.current,
				onTick: (r, waited) => { if (!gone.current) setJob({ action, row: r, waited }); },
			});
			if (!gone.current) {
				setJob({ action, row, waited: 0 });
				/* The roster is what the rest of the app reads, so refresh it —
				   it will catch up on the bridge's next pass either way. */
				void check();
			}
		} catch (e) {
			if (!gone.current) setJob({ action, error: e?.message || String(e) });
		}
	}, [check, device, employee, employeeName, number]);

	const running = Boolean(job) && !job.error && !(job.row && commandState(job.row).done);

	const picker = devices.length > 1 ? (
		<select value={device} onChange={(e) => setDevice(e.target.value)} aria-label="Machine">
			<option value="">Which machine?</option>
			{devices.map((d) => (
				<option key={d.name} value={d.device_id || d.name}>{d.device_name || d.device_id || d.name}</option>
			))}
		</select>
	) : null;

	const actions = (state) => (
		<span className="wizacts">
			{picker}
			{state !== "yes" && (
				<button className="btn tpl" disabled={!device || running} onClick={() => void send(ADD)}
					title={device ? "Leave a request for the gate PC to put this number on the machine."
						: "Pick the machine first."}>
					Add to the machine
				</button>
			)}
			<button className="btn ghost" disabled={!device || running} onClick={() => void send(CHECK)}
				title={device ? "Ask the machine now, through the gate PC. About twenty seconds."
					: "Pick the machine first."}>
				Ask the machine now
			</button>
			<button className="btn ghost" onClick={() => void check()} disabled={busy}>
				{busy ? "Checking…" : "Check again"}
			</button>
		</span>
	);

	const answer = job && (
		job.error
			? <p><b>The site refused the request.</b> {job.error}</p>
			: <p><b>{job.action}:</b> {commandState(job.row, { waitedSeconds: job.waited }).text}</p>
	);

	if (err) {
		return <div className="gap onmachine" data-state="error"><b>Could not check the machines.</b> {err} {actions("error")}</div>;
	}
	if (!read) return <div className="note onmachine" data-state="checking">Checking the machines for {number}…</div>;

	const v = machineVerdict(number, read, employee);
	const where = (rows) => rows.map((r) => (
		<li key={r.name}>
			<b>{r.device_id}</b>{r.name_on_device ? <> as &ldquo;{r.name_on_device}&rdquo;</> : null}
			{r.removed_at ? <> · removed {r.removed_at}</> : null}
		</li>
	));

	if (v.state === "yes") {
		return (
			<div className="note onmachine" data-state="yes">
				<b>On the machine: Yes.</b> Number <b>{number}</b> is enrolled on
				<ul className="wizlist">{where(v.on)}</ul>
				{v.others.length > 0 && (
					<p>That machine row is still linked to <b>{v.others.join(", ")}</b>. The bridge relinks it on its next pass.</p>
				)}
				{answer}
				{actions("yes")}
			</div>
		);
	}
	if (v.state === "removed") {
		return (
			<div className="gap onmachine" data-state="removed">
				<b>On the machine: No.</b> Number <b>{number}</b> was on a machine and has been removed:
				<ul className="wizlist">{where(v.gone)}</ul>
				{answer}
				{actions("removed")}
			</div>
		);
	}
	if (v.state === "no") {
		return (
			<div className="gap onmachine" data-state="no">
				<b>On the machine: No.</b> No machine has number <b>{number}</b> yet. Add them from here, then
				somebody at the gate puts the finger on it — the fingerprint is made by the sensor and cannot
				be sent from a web page.
				{answer}
				{actions("no")}
			</div>
		);
	}
	if (v.state === "denied") {
		return (
			<div className="note onmachine" data-state="denied">
				<b>On the machine: cannot check.</b> Your roles cannot read Machine Users. On the bridge PC,
				Manna Machine Tools → Users on the machine shows it.
			</div>
		);
	}
	return (
		<div className="note onmachine" data-state="unknown">
			<b>On the machine: cannot tell from here yet.</b> The machines&rsquo; user lists are not on the site —
			they arrive with the manna_hr app install, and the bridge fills them on every pass. Asking the
			machine directly needs the same install. Until then, on the bridge PC: Manna Machine Tools →
			Employees on this machine.
			{answer}
			{devices.length > 0 ? actions("unknown") : null}
		</div>
	);
}
