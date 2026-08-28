import { EICON } from "@/data/employees";
import { initials, tidyDept } from "@/lib/format";
import { isOn } from "@/lib/scope";

/* Employee Master, in the shape Factor HR draws it (screenshot 28 Aug 2026):
   a card per person over a toolbar, with the list view kept behind a toggle. */

function Eline({ k, text }) {
	return (
		<div className={"eline" + (text ? "" : " off")}>
			<svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
				<path d={EICON[k]} />
			</svg>
			<span>{text || "-"}</span>
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
			</div>
		</article>
	);
}
