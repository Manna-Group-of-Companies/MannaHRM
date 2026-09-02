
import { useApp } from "@/store";
import { Cols, Panel } from "@/components/ui";

/** One readiness line: the thing, how many there are, and what its absence
    would cost. `ok` is a count being non-zero and nothing cleverer — the
    question this page answers is whether the attendance engine can run at all. */
function Line({ l, n, ok, note }) {
	return (
		<div className="row">
			<span>
				{l} <span className={"cov " + (ok ? "live" : "none")}>{ok ? "ready" : "missing"}</span>
			</span>
			<span className="val">{n}</span>
			<span className="col-[1/-1] text-[.8rem] text-ink-3">{note}</span>
		</div>
	);
}

export default function Settings() {
	const c = useApp().counts;
	return (
		<Cols>
			<Panel title="Setup readiness" cov="part" ico="⚙">
				<div className="rows">
					<Line l="Companies" n={c.companies || 0} ok={(c.companies || 0) > 0}
						note="six, including the two created for HR" />
					<Line l="Holiday List" n={c.holiday || 0} ok={(c.holiday || 0) > 0}
						note="61 entries, default on all five Indian companies" />
					<Line l="Departments" n={c.departments || 0} ok={(c.departments || 0) > 0} note="" />
					<Line l="Designations" n={c.designations || 0} ok={(c.designations || 0) > 0} note="" />
					<Line l="Leave Types" n={c.leavetype || 0} ok={(c.leavetype || 0) > 0}
						note="two of six actually used" />
					<Line l="Shift Types" n={c.shift || 0} ok={(c.shift || 0) > 0}
						note="blocks all attendance until defined" />
					<Line l="Attendance rows" n={c.attendance || 0} ok={(c.attendance || 0) > 0}
						note="generated from punches through a shift" />
				</div>
			</Panel>

		</Cols>
	);
}
