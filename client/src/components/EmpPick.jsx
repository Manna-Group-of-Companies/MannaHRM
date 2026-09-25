import { useMemo, useRef, useState } from "react";

/* ---------------------------------------------------------------------------
   One employee, picked by typing rather than by scrolling.

   The report forms drew a plain `<select>` of everybody in scope, which is
   fine for forty people and useless for a factory: the only way to find
   somebody was to scroll a list of hundreds, alphabetical by a first name the
   reader may not know. This matches on name, employee number and machine code,
   because the gate knows people by the number on the machine and HR by the
   one on the payslip.

   It is still a closed choice. Typing narrows the list and only a click or
   Enter picks, so a half-typed name is never sent as a value; leaving the box
   without picking puts back whoever was picked before.

   Its own state rather than the store's: what is half-typed belongs to this
   box and nothing else, and `value` / `onChange` are the same contract the
   `<select>` it replaces had.
   --------------------------------------------------------------------------- */

const label = (p) => `${p.employee_name || p.name}${p.employee_number ? ` (${p.employee_number})` : ""}`;

const hay = (p) => [p.employee_name, p.employee_number, p.attendance_device_id, p.name]
	.filter(Boolean).join(" ").toLowerCase();

/** Past this many matches the list stops drawing and says to type more —
    a menu of two thousand buttons is slow to open and no easier to read. */
const CAP = 100;

/** @param {{people: any[], value: string, onChange: (v: string) => void, all: string, ariaLabel?: string}} props */
export default function EmpPick({ people, value, onChange, all, ariaLabel = "Employee" }) {
	const [q, setQ] = useState("");
	const [open, setOpen] = useState(false);
	const [hi, setHi] = useState(0);
	const box = useRef(null);

	const index = useMemo(() => people.map((p) => [p, hay(p)]), [people]);
	const picked = people.find((p) => p.name === value);

	const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
	const matches = words.length
		? index.filter(([, h]) => words.every((w) => h.includes(w))).map(([p]) => p)
		: people;
	/* "Everybody" is the first choice while nothing is typed, so clearing a
	   pick is one click — the same place it was on the `<select>`. */
	const items = (words.length ? [] : [{ name: "", all: true }]).concat(matches.slice(0, CAP));

	const pick = (v) => {
		onChange(v);
		setQ("");
		setOpen(false);
		box.current?.blur();
	};

	const key = (e) => {
		if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, items.length - 1)); }
		else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
		else if (e.key === "Enter") { if (open && items[hi]) { e.preventDefault(); pick(items[hi].name); } }
		else if (e.key === "Escape") { setQ(""); setOpen(false); }
	};

	return (
		<span className="emppick grow">
			<input ref={box} type="search" role="combobox" aria-label={ariaLabel}
				aria-expanded={open} aria-autocomplete="list"
				placeholder={picked ? label(picked) : all}
				value={open ? q : (picked ? label(picked) : "")}
				onFocus={() => { setOpen(true); setHi(0); }}
				onBlur={() => { setOpen(false); setQ(""); }}
				onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
				onKeyDown={key} />
			{open ? (
				<span className="emmenu" role="listbox">
					{items.map((p, i) => (
						<button key={p.name || "*"} type="button" role="option"
							aria-selected={p.name === value}
							className={i === hi ? "hi" : undefined}
							/* mousedown, not click: a click lands after the box's blur
							   has already closed the list it was aimed at. */
							onMouseDown={(e) => { e.preventDefault(); pick(p.name); }}>
							{p.all ? all : (
								<>
									<span>{p.employee_name || p.name}</span>
									<span className="k">
										{[p.employee_number, p.attendance_device_id && `M ${p.attendance_device_id}`]
											.filter(Boolean).join(" · ")}
									</span>
								</>
							)}
						</button>
					))}
					{!matches.length ? <span className="none">Nobody matches “{q.trim()}”.</span> : null}
					{matches.length > CAP ? (
						<span className="none">{matches.length - CAP} more — keep typing to narrow it.</span>
					) : null}
				</span>
			) : null}
		</span>
	);
}
