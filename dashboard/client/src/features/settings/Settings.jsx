
import { useState } from "react";
import { useApp } from "@/store";
import { Cols, Panel } from "@/components/ui";
import { applyTheme, storedTheme, THEMES } from "@/lib/theme";

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
			<span className="col-[1/-1] text-fine text-ink-3">{note}</span>
		</div>
	);
}


/** The palette picker.

    Its own `useState` rather than a key in the store, and that is the whole
    point of where the theme lives: this is a per-browser preference, not part
    of what the app is showing, and a re-render caused by a filter must not be
    able to repaint the interface. The state here only exists so the ticked row
    follows the click — the attribute on `<html>` is what actually paints, and
    `applyTheme` is what writes it.

    Every swatch is drawn from the palette it selects, so the row is a preview
    rather than a label: three of the tokens that differ most between them —
    the chrome, the brand, and the surface a panel sits on. */
function ThemePicker() {
	const [on, setOn] = useState(storedTheme);
	return (
		<div className="rows">
			{THEMES.map((t) => (
				<button
					key={t.id}
					type="button"
					className={"themerow" + (on === t.id ? " on" : "")}
					aria-pressed={on === t.id}
					onClick={() => setOn(applyTheme(t.id))}
				>
					<span className="themeswatch" data-theme={t.id} aria-hidden="true">
						<i className="c" /><i className="b" /><i className="p" />
					</span>
					<span className="themename">
						{t.name}
						{on === t.id ? <span className="cov live">on</span> : null}
					</span>
					<span className="col-[1/-1] text-fine text-ink-3">{t.note}</span>
				</button>
			))}
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

			<Panel title="Appearance" cov="live" ico="🎨">
				<ThemePicker />
			</Panel>

		</Cols>
	);
}
