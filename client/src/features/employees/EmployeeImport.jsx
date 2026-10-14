import { useState } from "react";

import { useApp } from "@/store";
import { go } from "@/routes/router";
import { load } from "@/api/load";
import { applyImport, downloadSheet, loadFullEmployees, readSheet, verifySaved } from "@/api/employeeimport";
import { openEmployee } from "@/features/employees/openEmployee";
import { tally } from "@/lib/employeeimport";
import { lockedFields } from "@/lib/fieldaccess";
import { scoped } from "@/lib/scope";
import { Note, Panel, Scroll, Tile, Tiles } from "@/components/ui";

/* EMPLOYEES → IMPORT FROM EXCEL. Ours, 5 October 2026 — reached from Add New
   Employee's ▾ → File Import, like Create Employee is from the button itself.

   New people and corrections to people on file, from one sheet whose columns
   are Create Employee's own fields. Matched on Emp Code: a code on file is
   updated with what differs, a new code is created. Nothing is written until
   Apply, and a blank cell never clears anything. See lib/employeeimport.js. */

const STATUS = {
	new: ["New person", ""],
	update: ["Will update", ""],
	same: ["No change", "muted"],
	problem: ["Not imported", "warn"],
	done: ["Saved", ""],
};

/** What the site holds for a saved row, read back after Apply. */
function OnSite({ v }) {
	if (!v) return null;
	if (v.way === "missing") return <small className="block warn">Not found on the site by this Emp Code — check in Frappe.</small>;
	if (v.way === "differs") {
		return (
			<small className="block warn">
				Saved as {v.employee}, but the site holds: {v.differs.map((d) => `${d.label} "${d.got}" (sheet: "${d.sent}")`).join("; ")}.
			</small>
		);
	}
	return (
		<small className="block way up">
			✓ {v.way === "added" ? "Added" : "Updated"} on the site —{" "}
			<button type="button" className="lnk" onClick={() => openEmployee(v.employee)}>{v.employee}</button>
		</small>
	);
}

export default function EmployeeImport() {
	const s = useApp();
	const [sheet, setSheet] = useState(null);
	const [msg, setMsg] = useState(null);
	const [busy, setBusy] = useState("");
	const [confirm, setConfirm] = useState(false);
	const say = (kind, text) => setMsg({ kind, text });
	const t = sheet ? tally(sheet.lines) : null;
	const access = { locked: lockedFields(s.fieldAccess, s.user, "edit"), lockedNew: lockedFields(s.fieldAccess, s.user, "new") };

	async function onDownload(everybody) {
		setBusy(everybody ? "all" : "blank");
		try {
			if (!everybody) await downloadSheet([], [], s.company);
			else {
				const full = await loadFullEmployees();
				const shown = new Set(scoped(s).map((e) => e.name));
				await downloadSheet(full.filter((e) => shown.has(e.name)), full, s.company);
			}
		} catch (e) {
			say("warn", `The sheet could not be made: ${e.message || e}`);
		}
		setBusy("");
	}

	async function onFile(e) {
		const file = e.target.files && e.target.files[0];
		e.target.value = "";
		if (!file) return;
		setBusy("read"); setMsg(null); setConfirm(false);
		try {
			setSheet({ ...(await readSheet(file, s, access)), file: file.name });
		} catch (err) {
			setSheet(null);
			say("warn", err.message || String(err));
		}
		setBusy("");
	}

	async function onApply() {
		setBusy("apply"); setConfirm(false);
		const r = await applyImport(sheet.lines, (n) => setBusy(`apply:${n}`));
		/* Read every saved person back from the site and compare it with the
		   sheet, so "done" means "the site holds it", not "nothing complained". */
		setBusy("verify");
		const checked = await verifySaved(r.done).catch(() => new Map());
		const refused = new Map(r.failed.map((f) => [f.row, f.error]));
		setSheet({
			...sheet,
			lines: sheet.lines.map((l) => (l.status !== "new" && l.status !== "update" ? l
				: refused.has(l.row) ? { ...l, status: "problem", why: refused.get(l.row) }
					: { ...l, status: "done", verified: checked.get(l.row) })),
		});
		await load();
		setBusy("");
		const v = [...checked.values()];
		const ok = v.filter((x) => x.way === "added" || x.way === "updated").length;
		const added = v.filter((x) => x.way === "added").length;
		const off = v.length - ok;
		say(r.failed.length || off ? "warn" : "ok",
			`Checked on the site: ${added} added, ${ok - added} updated.`
			+ (off ? ` ${off} saved but not as the sheet said — see the rows.` : "")
			+ (r.failed.length ? ` ${r.failed.length} refused by the site — the reason is on each row.` : "")
			+ (added ? " New people still need leave (Apply Leave → Give monthly leave) and a salary (Payroll → Salary Setup)." : ""));
	}

	const working = busy.startsWith("apply") || busy === "verify";
	const todo = t ? t.new + t.update : 0;

	return (
		<div className="paypage susetup">
			<div className="emhead">
				<h2>Import Employees from Excel</h2>
				<span className="n">{s.company || "all companies"}</span>
				<span className="right">
					<button type="button" className="embtn" onClick={() => go({ section: "employees", subtab: "overview" })}>Back to Employee Master</button>
				</span>
			</div>

			{msg && <Note className={msg.kind === "warn" ? "warn" : undefined}>{msg.text}</Note>}

			<Panel title="1. The employee sheet" ico="▦">
				<div className="ctl prrow paygo">
					<button type="button" className="embtn" disabled={Boolean(busy)} onClick={() => void onDownload(false)}>
						{busy === "blank" ? "Making…" : "Download a blank sheet"}
					</button>
					<button type="button" className="embtn" disabled={Boolean(busy)} onClick={() => void onDownload(true)}>
						{busy === "all" ? "Making…" : "Download everybody, to correct"}
					</button>
					<label className="embtn pri" aria-disabled={Boolean(busy)}>
						{busy === "read" ? "Reading…" : "Upload the filled sheet"}
						<input type="file" accept=".xlsx,.csv" hidden disabled={Boolean(busy)}
							aria-label="Upload the employee sheet" onChange={(e) => void onFile(e)} />
					</label>
				</div>
			</Panel>

			{sheet && (
				<Panel title={`2. Check and apply — ${sheet.file}`} ico="✔">
					<Tiles>
						<Tile k="New people" n={t.new} />
						<Tile k="Will update" n={t.update} />
						<Tile k="No change" n={t.same} />
						<Tile k="Not imported" n={t.problem} s={t.problem ? "see the reason on each row" : ""} />
					</Tiles>
					{sheet.unknown.length > 0 && (
						<Note>These columns are not employee fields and were left out: {sheet.unknown.join(", ")}.</Note>
					)}
					<Scroll>
						<table className="fptable" aria-label="What each row of the sheet will do">
							<thead><tr><th>Row</th><th>Emp Code</th><th>Person</th><th>What happens</th></tr></thead>
							<tbody>
								{sheet.lines.map((l) => {
									const [label, cls] = STATUS[l.status];
									return (
										<tr key={l.row} className={cls || undefined}>
											<td className="num">{l.row}</td>
											<td>{l.code}</td>
											<td>{l.name}</td>
											<td>
												<b>{label}</b>
												{l.why ? <small className="block">{l.status === "update" ? `Changes: ${l.why}` : l.why}</small> : null}
												{l.notes.map((n) => <small key={n} className="block muted">{n}</small>)}
												<OnSite v={l.verified} />
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</Scroll>
					<div className="ctl prrow paygo">
						{confirm ? (
							<>
								<button type="button" className="embtn pri" disabled={working} onClick={() => void onApply()}>
									{busy === "verify" ? "Checking on the site…"
										: working ? `Saving… ${busy.split(":")[1] || 0} of ${todo}` : `Yes, add ${t.new} and update ${t.update}`}
								</button>
								<button type="button" className="embtn" onClick={() => setConfirm(false)}>Cancel</button>
							</>
						) : (
							<button type="button" className="embtn pri" disabled={!todo || Boolean(busy)} onClick={() => setConfirm(true)}>
								Apply {todo || ""}
							</button>
						)}
					</div>
				</Panel>
			)}
		</div>
	);
}
