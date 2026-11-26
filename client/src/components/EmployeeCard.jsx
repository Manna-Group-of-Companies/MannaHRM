import Avatar from "@/components/Avatar";
import { EICON } from "@/data/employees";
import { tidyDept } from "@/lib/format";
import { isOn, needsDetails } from "@/lib/scope";

/* Employee Master, in the shape Factor HR draws it (screenshot 28 Aug 2026):
   a card per person over a toolbar, with the list view kept behind a toggle. */

/* `alt` is for a field where empty means something rather than nothing: it is
   drawn dimmed, like a blank, but says what the blank *is*. Only the device id
   uses it so far — see below. */
function Eline({ k, text, alt, title }) {
	return (
		<div className={"eline" + (text ? "" : " off")} title={title}>
			<svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
				<path d={EICON[k]} />
			</svg>
			<span>{text || alt || "-"}</span>
		</div>
	);
}

/** `boss` is this person's Reporting Manager, as the directory already loaded
    holds them — passed in, so the card stays a plain component that needs no
    store (the Manager tick itself is `custom_is_manager`, asked for 9 November
    2026). */
export default function EmployeeCard({ e, onOpen, boss = null }) {
	const isManager = Number(e.custom_is_manager) === 1;
	const name = (e.salutation ? e.salutation + " " : "") + (e.employee_name || "—");
	/* Somebody who is not Active — deactivated, suspended, left — is a name
	   and a status and nothing else (3 October 2026). The details come back
	   with the status. */
	const on = isOn(e);
	return (
		<article
			className={"ecard" + (on ? "" : " ecard-off") + (on && isManager ? " ecard-mgr" : "")}
			tabIndex={0}
			title="Open this record"
			onClick={onOpen}
			/* A card is a div, so it has to be given the keyboard behaviour a
			   link would have had for free. */
			onKeyDown={(ev) => {
				if (ev.key === "Enter" || ev.key === " ") {
					ev.preventDefault();
					onOpen();
				}
			}}
		>
			<Avatar className="ava" name={e.employee_name} image={on ? e.image : ""} />
			<div>
				<div className="ename">
					<span>{name}</span>
					<span className="go">→</span>
				</div>
				<div className="estat">
					<i className={"sdot " + (on ? "on" : "off")} />
					{e.status || "—"}
					{on && isManager && (
							<span className="emgr" title="Tagged as a Manager: offered as Reporting Manager to new people in the same company.">
								★ Manager
							</span>
						)}
						{/* Made by the bridge from a fingerprint punch, and not yet
					    completed by HR — see lib/scope.js needsDetails. */}
					{on && needsDetails(e) && (
						<span className="eneeds" title="Created automatically from a fingerprint punch. Gender and date of birth are placeholders.">
							Needs details
						</span>
					)}
				</div>
				{on ? <Details e={e} boss={boss} /> : <div className="eoff">Details are hidden while this person is not active.</div>}
			</div>
		</article>
	);
}

function Details({ e, boss }) {
	return (
		<>
			<Eline k="code" text={e.employee_number} />
			<Eline k="role" text={e.designation} />
			<Eline k="dept" text={e.department ? tidyDept(e.department) : ""} />
				{/* Who they report to. Blank is a real answer here (nobody is set),
				    so it reads as a dash rather than being left out. */}
				<Eline k="mgr" text={boss ? `Reports to ${boss.employee_name || boss.name}` : ""}
					title={boss ? `Reporting Manager: ${boss.employee_name || boss.name}` : "No Reporting Manager is set for this person."} />
			{/* Location is blank for everybody in Factor HR too — it is not a
			    gap in the migration, it is a field nobody there has ever filled. */}
			<Eline k="where" text={e.branch} />
			{/* The machine code, which the list view has always shown and the card
			    did not. Blank is not a missing value here: somebody with no
			    enrolment punches from the phone, and that is worth reading off the
			    card rather than opening the record to find out. */}
			<Eline k="dev" text={e.attendance_device_id} alt="phone"
				title={e.attendance_device_id
					? `Attendance Device ID (Biometric/RF tag ID): ${e.attendance_device_id}`
					: "No Attendance Device ID — this person punches from the phone, and the geofence judges it."} />
		</>
	);
}
