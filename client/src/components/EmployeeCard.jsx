import { EICON } from "@/data/employees";
import { initials, tidyDept } from "@/lib/format";
import { isOn } from "@/lib/scope";

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

export default function EmployeeCard({ e, onOpen }) {
	const name = (e.salutation ? e.salutation + " " : "") + (e.employee_name || "—");
	return (
		<article
			className="ecard"
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
			<div className="ava">{initials(e.employee_name)}</div>
			<div>
				<div className="ename">
					<span>{name}</span>
					<span className="go">→</span>
				</div>
				<div className="estat">
					<i className={"sdot " + (isOn(e) ? "on" : "off")} />
					{e.status || "—"}
				</div>
				<Eline k="code" text={e.employee_number} />
				<Eline k="role" text={e.designation} />
				<Eline k="dept" text={e.department ? tidyDept(e.department) : ""} />
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
			</div>
		</article>
	);
}
