import { useEffect, useState } from "react";

import { useApp } from "@/store";
import { applyIncrements, downloadTemplate, loadAssignments, readSheet } from "@/api/increments";
import { changesOn, defaultEffective, tally, verifyLine } from "@/lib/increments";
import { todayIso } from "@/lib/format";
import { deskUrl } from "@/lib/desk";
import { payRows } from "@/features/payroll/shared";
import { Desk, Note, Panel, Scroll, Tile, Tiles } from "@/components/ui";

/* PAYROLL → INCREMENTS. Ours, 5 October 2026 — January's salary increments.

   Each January HR raises salaries from a spreadsheet. Download the sheet
   (everybody with a salary, their current base filled in), fill in each
   person's New Base, Increment Amount or Increment %, upload it, read what
   each row will do, and apply. Each increment is a new Salary Structure
   Assignment from the effective date — hrms's own way of changing a base pay —
   so the payroll run for January pays the new base and December's still pays
   the old. See lib/increments.js.

   **Up or down is said on every row**, before and after (asked for the same
   day): the preview marks each change, a decrease is applied only when HR
   ticks for it, every applied row is read back from the site, and panel 3
   lists every salary change on the effective date as the site holds it — the
   check that still works tomorrow, after the page has been closed.

   **Nothing is written until Apply is pressed**, and nothing in the sheet is
   changed: a row that cannot be read is said, with its row number, and left. */

const rs = (v) => "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const STATUS = {
	ready: ["Will apply", ""],
	decrease: ["Decrease", ""],
	done: ["Already done", "muted"],
	skip: ["Nothing to do", "muted"],
	problem: ["Not applied", "warn"],
};

/** "↑ ₹4,000 (+10%)" / "↓ ₹2,000 (−5%)", in words as well as an arrow. */
function Change({ by, pct }) {
	if (by == null) return null;
	if (by === 0) return <span>No change</span>;
	const up = by > 0;
	return (
		<span className={"way " + (up ? "up" : "down")}>
			{up ? "↑ Increase " : "↓ Decrease "}{rs(Math.abs(by))}{pct != null ? ` (${up ? "+" : "−"}${Math.abs(pct)}%)` : ""}
		</span>
	);
}

/** What the site holds for an applied row, read back after Apply. */
function OnSite({ v }) {
	if (!v) return null;
	if (v.way === "missing") return <small className="block warn">Not found on the site — refresh, or check in Frappe.</small>;
	if (v.way === "differs") return <small className="block warn">The site holds {rs(v.base)} ({v.made}), not what the sheet said.</small>;
	const word = v.way === "up" ? "Increased" : v.way === "down" ? "Decreased" : "Unchanged";
	return <small className={"block way " + v.way}>✓ On the site: {word} to {rs(v.base)} ({v.made})</small>;
}

export default function Increments() {
	const s = useApp();
	const { company, site } = s;
	const [assignments, setAssignments] = useState(undefined);
	const [effective, setEffective] = useState(defaultEffective(todayIso()));
	const [sheet, setSheet] = useState(null);
	const [msg, setMsg] = useState(null);
	const [busy, setBusy] = useState("");
	const [confirm, setConfirm] = useState(false);
	const [cuts, setCuts] = useState(false);

	const read = async () => {
		const a = await loadAssignments(company).catch(() => null);
		setAssignments(a);
		return a;
	};
	useEffect(() => {
		setAssignments(undefined);
		setSheet(null);
		void read();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [company]);

	const people = payRows(s);
	const say = (kind, text) => setMsg({ kind, text });
	const t = sheet ? tally(sheet.lines) : null;
	const todo = t ? t.ready + (cuts ? t.decrease : 0) : 0;
	const onSite = changesOn(assignments || [], effective, s.employees);
	const ups = onSite.filter((c) => c.way === "up").length;
	const downs = onSite.filter((c) => c.way === "down").length;

	async function onTemplate() {
		setBusy("template");
		try {
			await downloadTemplate(people, assignments || [], effective, company);
		} catch (e) {
			say("warn", `The sheet could not be made: ${e.message || e}`);
		}
		setBusy("");
	}

	async function onFile(e) {
		const file = e.target.files && e.target.files[0];
		e.target.value = "";
		if (!file) return;
		setBusy("read"); setMsg(null); setConfirm(false); setCuts(false);
		try {
			const got = await readSheet(file, { employees: s.employees, assignments: assignments || [], effective });
			setSheet({ ...got, file: file.name });
		} catch (err) {
			setSheet(null);
			say("warn", err.message || String(err));
		}
		setBusy("");
	}

	async function onApply() {
		setBusy("apply"); setConfirm(false);
		const r = await applyIncrements(sheet.lines, (n) => setBusy(`apply:${n}`), { decreases: cuts });
		/* Read back what the site now holds, and say on each applied row whether
		   it went up or down there — not what was sent, what was stored. */
		const fresh = (await read()) || [];
		const refused = new Map(r.failed.map((f) => [f.row, f.error]));
		const sent = new Set(r.made.map((m) => m.row));
		setSheet({
			...sheet,
			lines: sheet.lines.map((l) => (refused.has(l.row) ? { ...l, status: "problem", why: refused.get(l.row) }
				: sent.has(l.row) ? { ...l, status: "applied", verified: verifyLine(l, fresh) } : l)),
		});
		setBusy("");
		const up = r.made.filter((m) => m.increase > 0).length;
		const down = r.made.length - up;
		say(r.failed.length ? "warn" : "ok",
			`${r.made.length} applied — ${up} increased${down ? `, ${down} decreased` : ""}.`
			+ (r.failed.length ? ` ${r.failed.length} refused by the site — the reason is on each row.` : " Each is checked against the site on its row, and listed in 3 below."));
	}

	const working = busy.startsWith("apply");

	return (
		<div className="paypage susetup">
			<div className="emhead">
				<h2>Increments</h2>
				<span className="n">{company || "all companies"}</span>
				<span className="right">
					<button type="button" className="embtn" onClick={() => void read()}>Refresh</button>
				</span>
			</div>

			{msg && <Note className={msg.kind === "warn" ? "warn" : undefined}>{msg.text}</Note>}
			{assignments === null && <Note className="warn">This login may not read salary structures on the site — it needs HR Manager.</Note>}

			<Panel title="1. The increment sheet" ico="▦">
				<div className="flds">
					<div className="fld">
						<label className="lab" htmlFor="inc-from">Effective from</label>
						<input id="inc-from" type="date" value={effective}
							onChange={(e) => { setEffective(e.target.value); setSheet(null); }} />
					</div>
				</div>
				<div className="ctl prrow paygo">
					<button type="button" className="embtn" disabled={busy === "template" || !assignments} onClick={() => void onTemplate()}>
						{busy === "template" ? "Making…" : "Download the sheet"}
					</button>
					<label className="embtn pri" aria-disabled={!assignments || Boolean(busy)}>
						{busy === "read" ? "Reading…" : "Upload the filled sheet"}
						<input type="file" accept=".xlsx,.csv" hidden disabled={!assignments || Boolean(busy)}
							aria-label="Upload the increment sheet" onChange={(e) => void onFile(e)} />
					</label>
				</div>
			</Panel>

			{sheet && (
				<Panel title={`2. Check and apply — ${sheet.file}`} ico="✔">
					<Tiles>
						<Tile k="Increase" n={t.ready} s={t.ready ? `+${rs(t.increase)} a month` : ""} />
						<Tile k="Decrease" n={t.decrease} s={t.decrease ? `−${rs(Math.abs(t.cut))} a month` : ""} />
						<Tile k="Already done / nothing to do" n={t.done + t.skip} />
						<Tile k="Not applied" n={t.problem} s={t.problem ? "see the reason on each row" : ""} />
					</Tiles>
					<Scroll>
						<table className="fptable" aria-label="What each row of the sheet will do">
							<thead>
								<tr>
									<th>Row</th><th>Person</th><th>From</th><th>Current base</th><th>New base</th><th>Up or down</th><th>What happens</th>
								</tr>
							</thead>
							<tbody>
								{sheet.lines.map((l) => {
									const [label, cls] = l.status === "applied" ? ["Applied", ""] : STATUS[l.status];
									return (
										<tr key={l.row} className={cls || undefined}>
											<td className="num">{l.row}</td>
											<td>{l.name || ""}<small className="block muted">{l.code}</small></td>
											<td>{l.from || ""}</td>
											<td className="num">{l.current ? rs(l.base) : ""}</td>
											<td className="num">{l.newBase != null ? rs(l.newBase) : ""}</td>
											<td><Change by={l.increase} pct={l.pct} /></td>
											<td>
												<b>{l.status === "decrease" && cuts ? "Decrease — will apply" : label}</b>
												{l.why && l.status !== "applied" ? <small className="block">{l.why}</small> : null}
												<OnSite v={l.verified} />
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</Scroll>
					{t.decrease > 0 && (
						<label className="ctl prrow">
							<input type="checkbox" checked={cuts} onChange={(e) => { setCuts(e.target.checked); setConfirm(false); }} />
							<span>
								Also apply the <b>{t.decrease} decrease{t.decrease === 1 ? "" : "s"}</b> — these lower somebody's salary.
								Leave unticked unless the sheet means it.
							</span>
						</label>
					)}
					<div className="ctl prrow paygo">
						{confirm ? (
							<>
								<button type="button" className="embtn pri" disabled={working} onClick={() => void onApply()}>
									{working ? `Applying… ${busy.split(":")[1] || 0} of ${todo}`
										: `Yes, apply ${t.ready} increase${t.ready === 1 ? "" : "s"}${cuts && t.decrease ? ` and ${t.decrease} decrease${t.decrease === 1 ? "" : "s"}` : ""}`}
								</button>
								<button type="button" className="embtn" onClick={() => setConfirm(false)}>Cancel</button>
							</>
						) : (
							<button type="button" className="embtn pri" disabled={!todo || Boolean(busy)} onClick={() => setConfirm(true)}>
								Apply {todo || ""}
							</button>
						)}
						<Desk href={site && deskUrl(site, "Salary Structure Assignment")} label="Salary Structure Assignments in Frappe">Open in Frappe</Desk>
					</div>
				</Panel>
			)}

			<Panel title={`3. Salary changes from ${effective} on the site — ${onSite.length ? `${ups} up, ${downs} down` : "none yet"}`} ico="⇅">
				{onSite.length === 0 ? <p className="muted">No salary starts on {effective} yet.</p> : (
					<Scroll>
						<table className="fptable" aria-label="Salary changes on the site">
							<thead><tr><th>Person</th><th>Before</th><th>After</th><th>Up or down</th><th>Record</th></tr></thead>
							<tbody>
								{onSite.map((c) => (
									<tr key={c.made}>
										<td>{c.name}<small className="block muted">{c.code}</small></td>
										<td className="num">{c.before == null ? "—" : rs(c.before)}</td>
										<td className="num">{rs(c.after)}</td>
										<td>{c.way === "first" ? <span className="muted">First salary</span> : <Change by={c.change} pct={c.pct} />}</td>
										<td><small>{c.made}</small></td>
									</tr>
								))}
							</tbody>
						</table>
					</Scroll>
				)}
			</Panel>
		</div>
	);
}
