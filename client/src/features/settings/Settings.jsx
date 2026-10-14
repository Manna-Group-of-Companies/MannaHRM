
import { useApp } from "@/store";
import { Cols, Panel } from "@/components/ui";

/** One readiness line: the thing, how many there are, and what its absence
    would cost. `ok` is a count being non-zero and nothing cleverer — the
    question this page answers is whether the attendance engine can run at all. */
function Line({ l, n, ok }) {
	return (
		<div className="row">
			<span>
				{l} <span className={"cov " + (ok ? "live" : "none")}>{ok ? "ready" : "missing"}</span>
			</span>
			<span className="val">{n}</span>
		</div>
	);
}


export default function Settings() {
	const c = useApp().counts;
	return (
		<Cols>
			<Panel title="Setup readiness" cov="part" ico="⚙">
				<div className="rows">
					<Line l="Companies" n={c.companies || 0} ok={(c.companies || 0) > 0} />
					<Line l="Holiday List" n={c.holiday || 0} ok={(c.holiday || 0) > 0} />
					<Line l="Departments" n={c.departments || 0} ok={(c.departments || 0) > 0} />
					<Line l="Designations" n={c.designations || 0} ok={(c.designations || 0) > 0} />
					<Line l="Leave Types" n={c.leavetype || 0} ok={(c.leavetype || 0) > 0} />
					<Line l="Shift Types" n={c.shift || 0} ok={(c.shift || 0) > 0} />
					<Line l="Attendance rows" n={c.attendance || 0} ok={(c.attendance || 0) > 0} />
				</div>
			</Panel>

			{/* **There is no Appearance panel any more.** The app is one palette,
			    dark, with no attribute to write and nothing to pick between — see
			    the note at the top of styles/themes.css, which says what was here
			    and how to bring a choice back. A panel offering one option is a
			    control that does nothing, and this page is about what the *site*
			    is set up for. */}

		</Cols>
	);
}
