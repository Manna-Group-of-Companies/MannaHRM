/** One value, as a person reads it. A blank is a dash on screen — the CSV
    exports elsewhere in this app write "" for the same value, because a dash is
    a thing a reader needs and a thing a data file must not have. */
export function cell(v, f) {
	if (f.kind === "check") return Number(v) ? "Yes" : "No";
	if (v == null || v === "") return <span className="text-ink-3">—</span>;
	return String(v);
}
