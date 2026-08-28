import { useState } from "react";
import { api } from "@/api/client";
import { Cols, Empty, Note, NoteBelow, Panel, SpecTable } from "@/components/ui";
import { mergeLetter } from "@/lib/letter";
import { scoped } from "@/lib/scope";
import { set, useApp } from "@/state/store";

/* Factor HR's On Board menu, item for item, as its flyout reads on 28 Aug 2026:

       Candidate Master · Create Letter / Form · Document Entry ·
       Assets Details · Assets Assignment · All

   Only the letter screen has ever been opened in a screenshot. What Document
   Entry and the two Assets pages hold over there is therefore unknown, and
   every panel says which side of that line it is on. */

const ISSUE_STEPS = [
	["Merge against the record", "Letter Type template + Employee", "live",
		"118 distinct tokens across the set, matched case-insensitively"],
	["Show unresolved fields", "computed at render", "live",
		"Printed as <code>[[FatherName]]</code>. A letter with a visible gap is obviously unfinished; one with a blank space looks finished and is not"],
	["Freeze the rendered text", "Employee Letter", "live",
		"Rendered once and stored. Re-rendering later against changed employee data would quietly rewrite a document somebody has already been handed"],
	["Approve before issue", "Letter Assignment queue", "build",
		"Factor HR has the queue and it reads 0 &mdash; see Dashboard &rarr; Approvals"],
	["Number the letter", "series on Employee Letter", "build",
		"The one letter ever issued carries no reference number"],
	["Keep the signed copy back", "Attach on Employee Letter", "build", ""],
];

export default function LetterForm() {
	const s = useApp();
	const types = s.letterTypes;
	const issued = s.letters;

	const [out, setOut] = useState(null);
	const [state, setState] = useState("");
	const [err, setErr] = useState("");

	const people = scoped(s)
		.filter((x) => x.status === "Active")
		.sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));

	const byCat = {};
	types.forEach((t) => {
		(byCat[t.category || "Uncategorised"] ||= []).push(t);
	});

	async function preview() {
		const type = types.find((x) => x.name === s.letterType) || types[0];
		const who = s.letterEmp || people[0]?.name;
		if (!who || !type) return;
		setState("busy");
		try {
			/* The list load carries ten fields per employee; a letter wants thirty
			   of them. Read the record whole here, or every token but the name
			   renders as a gap and the page blames the data for what it never
			   asked for. */
			const [full, emp] = await Promise.all([
				api("/api/resource/Letter Type/" + encodeURIComponent(type.name))
					.then((r) => r.data),
				api("/api/resource/Employee/" + encodeURIComponent(who))
					.then((r) => r.data)
					.catch(() => s.byName[who]),
			]);
			setOut(mergeLetter(full?.template || "", emp || {}, {
				letterdate: new Date().toISOString().slice(0, 10),
				letternumber: "(on issue)",
			}));
			setState("");
		} catch (e) {
			setErr(String(e.message || e));
			setState("err");
		}
	}

	return (
		<>
			<div className="legend">
				<b className="font-display">Create Letter / Form</b>
				<span>
					Factor HR’s letter screen: pick a person, pick a format, merge, print. One letter has been
					issued through it in three years, against 17 maintained formats.
				</span>
			</div>

			<Cols>
				<Panel title="Letter Types" cov="live" ico="📄">
					{Object.keys(byCat).sort().map((cat) => (
						<div className="mb-[.6rem]" key={cat}>
							<div className="font-mono text-[.66rem] tracking-[.09em] uppercase text-ink-3 mb-1">
								{cat} · {byCat[cat].length}
							</div>
							{byCat[cat].map((t) => (
								<div className="row" key={t.name}>
									<span>{t.name}</span>
									<span className="val">
										{(t.fields_used || "").split(",").filter(Boolean).length} fields
									</span>
								</div>
							))}
						</div>
					))}
					<Note>
						<b>15 of your 17 formats loaded.</b> Form 2 Revised and Form 3A hold their content in
						form controls rather than text, so they were flagged rather than imported blank. Nine of
						the rest are statutory PF forms with legally fixed layouts — a different job from the
						six real letters.
					</Note>
				</Panel>

				<Panel title="Issue a letter" cov="live" ico="✉">
					<div className="flex flex-wrap gap-2 mb-[.7rem]">
						<select
							className="min-w-[230px] embtn"
							value={s.letterEmp || people[0]?.name || ""}
							onChange={(e) => set({ letterEmp: e.target.value })}
						>
							{people.map((p) => (
								<option key={p.name} value={p.name}>
									{p.employee_name} ({p.employee_number || "-"})
								</option>
							))}
						</select>
						<select
							className="min-w-[230px] embtn"
							value={s.letterType || types[0]?.name || ""}
							onChange={(e) => set({ letterType: e.target.value })}
						>
							{types.map((x) => (
								<option key={x.name}>{x.name}</option>
							))}
						</select>
						<button className="embtn pri" onClick={() => void preview()}>Preview</button>
					</div>

					{state === "busy" ? (
						<Empty title="rendering…" />
					) : state === "err" ? (
						<div className="gap">{err}</div>
					) : out ? (
						<>
							{out.missing.length ? (
								<div className="gap">
									<b>{out.missing.length} field(s) ERPNext cannot fill:</b>{" "}
									{out.missing.join(", ")}
								</div>
							) : (
								<Note>
									<b>Every field resolved.</b>
								</Note>
							)}
							{/* The template is the site's own stored HTML and every merged
							    value inside it was escaped by mergeLetter. */}
							<div className="letter" dangerouslySetInnerHTML={{ __html: out.html }} />
						</>
					) : (
						<Empty title="Pick a person and a letter">
							The template merges against their real record. Anything ERPNext cannot fill is shown
							in the text rather than left blank.
						</Empty>
					)}
				</Panel>
			</Cols>

			<Cols>
				<Panel title="Letters issued" cov="live" ico="📬">
					{issued.length ? (
						<div className="rows">
							{issued.map((l) => (
								<div className="row" key={l.name}>
									<span>
										{l.employee_name || l.employee} · {l.letter_type || ""}
									</span>
									<span className="val">{l.letter_date || ""}</span>
								</div>
							))}
						</div>
					) : (
						<Empty title="None yet">
							Factor HR has issued exactly one letter in three years — an Experience Certificate for
							MT-003, dated 4 August 2023.
						</Empty>
					)}
				</Panel>

				<Panel title="What issuing a letter should still do" cov="part" ico="🧾">
					<SpecTable
						cols={["Step", "Where it would live", "State", "Note"]}
						list={ISSUE_STEPS}
					/>
				</Panel>
			</Cols>

			<NoteBelow>
				Nothing on this page writes. Issuing for real is a document on the site — this is the merge,
				which is the part worth checking before anybody agrees to the format.
			</NoteBelow>
		</>
	);
}
