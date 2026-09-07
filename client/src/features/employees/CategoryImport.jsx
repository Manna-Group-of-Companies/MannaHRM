import { useState } from "react";

import { Modal, Scroll } from "@/components/ui";
import { SheetDrop, useSheet } from "@/features/onboard/sheet";
import { apiCreate } from "@/api/client";
import { deskImport } from "@/lib/desk";
import { load } from "@/api/load";
import { useApp } from "@/store";
import { CAT_MAKE, catMasters, planImport, writeCatTemplate } from "@/lib/catsheet";
import { SITE_CATEGORY_TYPES } from "@/data/masters";

/* ---------------------------------------------------------------------------
   **Data import from file**, off the ↑ on Employees → Categories.

   That item was a link to ERPNext's Data Import for as long as this screen has
   existed, and the reason was a good one: a bulk write belongs where the
   validation is. It still does, and the link is still on the footer of this
   dialog — for a large load, for anything that has to *update* rather than add,
   and for the doctypes this refuses to write.

   What this adds is the part the link could not: the file is read here, and
   what every row would do is on screen **before** anything is sent. Row by row,
   against what the site already holds. That is the difference between an import
   somebody can check and one they find out about afterwards.

   Three rules, and each is somewhere else so it can be argued about without a
   browser:

     what a row would do      lib/catsheet.js — pure, and the tests are on it
     what may be written      CAT_MAKE, same file: Department and Designation
     what may not             CAT_NO_MAKE, same file, with the reason on it

   The write itself is `apiCreate`, as the signed-in person, under their own
   roles. A user who may not add a Department is refused by the site rather than
   by anything here — which is the right way round (CLAUDE.md §1).
   --------------------------------------------------------------------------- */

const Ic = ({ d }) => (
	<svg viewBox="0 0 24 24">
		<path d={d} />
	</svg>
);

const DOWN = "M12 3v11M8 10l4 4 4-4M4 19h16";

/** How many rows of the file are drawn. The counts above the table are over all
    of them; this is a preview, and a four-hundred-row table inside a dialog is
    a scrollbar nobody reaches the end of. */
const SHOWN = 12;

const PILL = {
	make: "on",
	have: "off",
	skip: "off",
	bad: "off",
};

const SAYS = {
	make: "will be created",
	have: "already there",
	skip: "skipped",
	bad: "cannot be read",
};

/** The file this dialog writes, and the one it reads back.

    Both directions of the same shape on purpose: the fastest way to add three
    designations is to download this, type three lines at the bottom of it, and
    drop it back on the area above. Every row that came down carries its ID and
    reads as *already there*, so only the new lines do anything.

    The same writer the two headers use — see `writeCatTemplate`. */

export default function CategoryImport({ only, onClose }) {
	const s = useApp();
	const up = useSheet();

	/* Which master the rows are for, when the file does not say. Empty means
	   "read it off each row", which is what the whole-screen template fills in.
	   Fixed and not offered at all when the dialog was opened from a drill: that
	   screen is one master already. */
	const [pick, setPick] = useState("");
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(0);
	const [err, setErr] = useState("");
	const [said, setSaid] = useState("");

	const chosen = only || SITE_CATEGORY_TYPES.find((t) => t.name === pick) || null;
	const plan = planImport(s, up.sheet?.rows || [], chosen);
	const ready = !busy && plan.make.length > 0;

	async function run() {
		setBusy(true);
		setErr("");
		setSaid("");
		setDone(0);
		let made = 0;
		try {
			for (const r of plan.make) {
				await apiCreate(r.dt, CAT_MAKE[r.dt](r, s));
				made += 1;
				setDone(made);
			}
			/* The lists on this screen are counted off the same read the whole
			   dashboard uses, so nothing new shows up until that read is taken
			   again. */
			await load();
			setSaid(`Created ${made} of ${plan.make.length}. The list behind View Category has them now.`);
			up.clear();
		} catch (e) {
			/* The count is the important half of a bulk failure: what was created
			   before it is real and is on the site. Nothing is rolled back, because
			   a half-written batch that quietly disappeared would be worse than one
			   somebody can see and finish by hand. */
			setErr(`${String(e.message || e).slice(0, 240)} — ${made} of ${plan.make.length} `
				+ "were created before this and they are on the site. Nothing was undone.");
		}
		setBusy(false);
	}

	const shown = plan.rows.slice(0, SHOWN);

	return (
		<Modal
			title={only ? `Data import — ${only.name}` : "Data import from file"}
			wide
			extra={
				<div className="bulk">
					<div className="bulkcard">
						{only ? (
							<span className="bulkhint">
								Every row in the file is read as a <b>{only.name}</b> — this screen is that one
								master, so a Category Type column in the file is ignored rather than obeyed.
							</span>
						) : (
							<>
								<label className="bulklab" htmlFor="ci-type">Category Type</label>
								<select id="ci-type" className="dectl" value={pick} disabled={busy}
									title="Which master the rows are for. Leave it on the first option and each row says for itself, in the Category Type column the template writes."
									onChange={(e) => setPick(e.target.value)}>
									<option value="">read it off each row</option>
									{catMasters().map((t) => (
										<option key={t.name} value={t.name}>{t.name}</option>
									))}
								</select>
							</>
						)}

						<button className="bulklink" type="button" disabled={busy}
							title="What the site already holds, in the columns this dialog reads. Add a value as a row at the bottom with ID left blank, and drop the file back here."
							onClick={() => setSaid(`Template downloaded — ${writeCatTemplate(s, only)} row(s) `
								+ "the site already holds. Add a row with ID left blank for each new value.")}>
							<Ic d={DOWN} /> Download template
						</button>

						<span className="bulklab">Upload File</span>
						<SheetDrop file={up.file} sheet={up.sheet} busy={busy} onTake={up.take}
							hint={<>Drag &amp; Drop a file into this area or click on &ldquo;Browse Files&rdquo; to attach.</>} />
					</div>

					{plan.needType ? (
						<div className="deerr">
							<b>No row in that file names a category type.</b> Either pick one above, so every
							row is read as that master, or add a{" "}
							<span className="mono">Category Type</span> column — Download template writes one.
						</div>
					) : null}

					{up.sheet && !plan.needType ? (
						<>
							<div className="rows bulkrows">
								<div className="row">
									<span>
										To create{" "}
										<span className="muted">
											Values in the file that this site does not hold yet. These are the only
											rows anything is sent for.
										</span>
									</span>
									<span className="val">
										<span className={"cov " + (plan.counts.make ? "live" : "none")}>
											{plan.counts.make} of {plan.rows.length}
										</span>
									</span>
								</div>
								<div className="row">
									<span>
										Already there{" "}
										<span className="muted">
											Matched on the ID or on the name. Skipped rather than updated —
											renaming a master renames it for everybody carrying it.
										</span>
									</span>
									<span className="val">{plan.counts.have}</span>
								</div>
								{plan.counts.skip ? (
									<div className="row">
										<span>
											Not written from here{" "}
											<span className="muted">
												A master this dialog will not create, or a category type that is a pay
												rule with nothing to load into. The reason is on the row.
											</span>
										</span>
										<span className="val">{plan.counts.skip}</span>
									</div>
								) : null}
								{plan.counts.bad ? (
									<div className="row">
										<span>
											Cannot be read{" "}
											<span className="muted">
												No value on the row, or a category type this screen does not know.
												Skipped; the rest of the file still imports.
											</span>
										</span>
										<span className="val">{plan.counts.bad}</span>
									</div>
								) : null}
							</div>

							<Scroll>
								<table>
									<thead>
										<tr>
											<th>Category Type</th><th>Description</th><th>Company</th>
											<th>What happens</th>
										</tr>
									</thead>
									<tbody>
										{shown.map((r) => (
											<tr key={r.n}>
												<td>{r.type || <span className="muted">—</span>}</td>
												{/* Plain, where the list behind View Category draws a `.fhname`:
												    there the value opens something and here it is a line off a
												    file that has not been written yet. An underline that opens
												    nothing is a control that has stopped working. */}
												<td>{r.desc || <span className="muted">(blank)</span>}</td>
												<td className="mono">{r.company || ""}</td>
												<td>
													{/* The reason is on every row rather than only on the refused
													    ones: "already there" and "cannot be read" both look like
													    nothing happening, and they are different facts. */}
													<span className={"pill " + PILL[r.verdict]} title={r.why}>
														{SAYS[r.verdict]}
													</span>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</Scroll>
							{plan.rows.length > SHOWN ? (
								<div className="cnt">
									Showing the first {SHOWN} of {plan.rows.length} rows. The counts above are over
									all of them.
								</div>
							) : null}
						</>
					) : null}

					{up.err ? <div className="deerr">{up.err}</div> : null}
					{err ? <div className="deerr"><b>Nothing further was created.</b> {err}</div> : null}
					{said ? <div className="afsaid">{said}</div> : null}

					<div className="defoot">
						<button className="btn tpl" disabled={!ready}
							title={!up.sheet
								? "Attach a CSV first — Download template above writes one in the right shape."
								: plan.make.length
									? `Create ${plan.make.length} record(s) on the site, one at a time, as you.`
									: "Nothing in that file is new to this site, so there is nothing to create."}
							onClick={() => void run()}>
							{busy ? `Creating ${done} of ${plan.make.length}…` : `Import${plan.make.length ? ` ${plan.make.length}` : ""}`}
						</button>
						<button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
						{/* The wizard this item used to be, kept rather than replaced. It is
						    the only way to update an existing master, the only way to load a
						    doctype this dialog refuses, and it has an error report of its
						    own — so it is the right answer often enough to stay one click
						    away. */}
						{s.site ? (
							<a className="bulkwhy" href={deskImport(s.site)} target="_blank" rel="noreferrer"
								title="ERPNext's own Data Import — a preview, an error report, and Update Existing Records, which this dialog deliberately does not do.">
								Or open ERPNext&rsquo;s Data Import ↗
							</a>
						) : (
							<span className="bulkwhy">
								Writes one record per new row, as you, under your own roles. It runs in this tab,
								so leaving the page stops it part-way — what was created stays.
							</span>
						)}
					</div>
				</div>
			}
			onClose={busy ? () => {} : onClose}
		/>
	);
}
