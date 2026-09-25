import { useState } from "react";

import { sheetsPdf, sheetsXlsx } from "@/lib/export";
import { todayIso } from "@/lib/format";

/** Excel and PDF, side by side, for whatever `sheets()` returns.

    `sheets` is a function rather than a value so a page builds the file's rows
    only when somebody asks for one — the Reports page's "all" is every report
    at once, and building that on every render to throw it away is waste.

    The buttons say what they are doing while the library loads: the first
    click fetches ExcelJS or jsPDF, and a button that does nothing visible for a
    second gets clicked again. */
export default function ExportButtons({ sheets, name, disabled, label = "" }) {
	const [busy, setBusy] = useState("");
	const [err, setErr] = useState("");

	const run = (kind) => async () => {
		setBusy(kind);
		setErr("");
		try {
			const file = `${name}-${todayIso()}.${kind === "pdf" ? "pdf" : "xlsx"}`;
			await (kind === "pdf" ? sheetsPdf : sheetsXlsx)(sheets(), file);
		} catch (e) {
			setErr(e && e.message ? e.message : String(e));
		} finally {
			setBusy("");
		}
	};

	return (
		<>
			<button type="button" className="embtn" onClick={run("xlsx")} disabled={disabled || Boolean(busy)}>
				{busy === "xlsx" ? "Building…" : `${label}Excel`}
			</button>
			<button type="button" className="embtn" onClick={run("pdf")} disabled={disabled || Boolean(busy)}>
				{busy === "pdf" ? "Building…" : `${label}PDF`}
			</button>
			{err ? <span className="text-fine text-bad" role="alert">{err}</span> : null}
		</>
	);
}
