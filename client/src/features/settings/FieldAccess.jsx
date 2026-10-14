import { useEffect, useState } from "react";
import { useApp } from "@/store";
import { ACCESS_FIELDS, FORMS, LEVELS, canLock, parseFieldAccess } from "@/lib/fieldaccess";
import { PAGE_ADMINS } from "@/data/menus";
import { NO_ACCESS_FIELD, saveFieldAccess } from "@/api/pagerules";
import { Scroll } from "@/components/ui";

/* Settings → Security → Employee fields: Write, Read or Hidden for each field,
   on Create Employee and on Employee Profile, for every login but the page
   admin. See lib/fieldaccess.js for what each of the three does and does not
   stop. */

const WORD = { write: "Write", read: "Read", hidden: "Hidden" };
const FORM_LABEL = { new: "New employee", edit: "Editing" };

/** The level a row is at under `rules` — its alternatives' tightest. */
function levelOf(rules, form, fields) {
	let most = 0;
	for (const f of fields) most = Math.max(most, LEVELS.indexOf(rules?.[form]?.[f] || "write"));
	return LEVELS[most];
}

function Switch({ label, level, onPick }) {
	return (
		<div className="segs" role="group" aria-label={label}>
			{LEVELS.map((l) => (
				<button key={l} type="button" className="embtn" aria-pressed={level === l} onClick={() => onPick(l)}>
					{WORD[l]}
				</button>
			))}
		</div>
	);
}

export default function FieldAccess() {
	const s = useApp();
	const [draft, setDraft] = useState(s.fieldAccess);
	const [touched, setTouched] = useState(false);
	const [q, setQ] = useState("");
	const [save, setSave] = useState({ busy: false, msg: "", err: "" });
	useEffect(() => { if (!touched) setDraft(s.fieldAccess); }, [s.fieldAccess, touched]);

	const dirty = JSON.stringify(parseFieldAccess(draft)) !== JSON.stringify(parseFieldAccess(s.fieldAccess));

	/* Every spelling of the row at once, so a rule cannot be dodged by the
	   profile's other fieldname for the same thing. */
	function pick(row, form, level) {
		const rows = { ...(draft[form] || {}) };
		for (const f of row.fields) {
			if (level === "write") delete rows[f];
			else rows[f] = level;
		}
		setTouched(true);
		setDraft({ ...draft, [form]: rows });
		setSave({ busy: false, msg: "", err: "" });
	}

	async function onSave() {
		setSave({ busy: true, msg: "", err: "" });
		const r = await saveFieldAccess(draft);
		setTouched(false);
		setSave(r.ok
			? { busy: false, msg: "Saved. Every login but the page admin is held to these from their next page load.", err: "" }
			: { busy: false, msg: "", err: r.error });
	}

	const state = s.fieldAccessState;
	const needle = q.trim().toLowerCase();
	const rows = ACCESS_FIELDS.filter((r) => !needle
		|| r.label.toLowerCase().includes(needle)
		|| r.fields.some((f) => f.includes(needle))
		|| r.group.toLowerCase().includes(needle));
	const lockedCount = ACCESS_FIELDS.filter((r) => FORMS.some((f) => levelOf(draft, f, r.fields) !== "write")).length;

	return (
		<>
			<div className="legend">
				<b className="font-display">Employee fields</b>
				<span>{lockedCount} of {ACCESS_FIELDS.length} limited · every login but {PAGE_ADMINS.join(", ")}</span>
				<label className="find">
					<input type="search" value={q} onChange={(e) => setQ(e.target.value)}
						placeholder="Find a field" aria-label="Find a field" />
				</label>
				<span className="right">
					<button type="button" className="embtn" disabled={!dirty || save.busy}
						onClick={() => { setTouched(false); setDraft(s.fieldAccess); }}>
						Undo changes
					</button>{" "}
					<button type="button" className="embtn pri" disabled={state !== "ok" || !dirty || save.busy}
						onClick={() => void onSave()}>
						{save.busy ? "Saving…" : "Save"}
					</button>
				</span>
			</div>

			{state === "loading" ? <div className="onbmsg">Reading Manna HR Settings…</div> : null}
			{state === "nofield" ? <div className="onbmsg">{NO_ACCESS_FIELD}</div> : null}
			{state === "unread" ? (
				<div className="onbmsg">
					Manna HR Settings could not be read with this login, so this shows every field as Write and
					cannot save. The login needs HR Manager on the site.
				</div>
			) : null}
			{save.msg ? <div className="onbmsg">{save.msg}</div> : null}
			{save.err ? <div className="onbmsg">Not saved: {save.err}</div> : null}

			<Scroll>
				<table>
					<thead>
						<tr>
							<th>Field</th>
							<th>{FORM_LABEL.new}</th>
							<th>{FORM_LABEL.edit}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.fields[0]}>
								<td>
									{r.label}
									<div className="text-fine text-ink-3">{r.group}</div>
								</td>
								{FORMS.map((form) => {
									const on = form === "new" ? r.onNew : r.onEdit;
									return (
										<td key={form}>
											{!on ? <span className="text-fine text-ink-3">Not on this form</span>
												: !canLock(form, r.fields[0]) ? (
													<span className="text-fine text-ink-3"
														title="Create Employee cannot do without it, so everybody may type it.">
														Always write
													</span>
												) : (
													<Switch label={`${r.label} — ${FORM_LABEL[form]}`}
														level={levelOf(draft, form, r.fields)}
														onPick={(l) => pick(r, form, l)} />
												)}
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</Scroll>
		</>
	);
}
