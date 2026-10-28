import { useEffect, useState } from "react";
import { useApp } from "@/store";
import { MODULES } from "@/routes/registry";
import { SECTIONS, canHide, hiddenByDefault, hiddenUnder } from "@/data/sections";
import { PAGE_ADMINS, SALARY_VIEW_ONLY, pageAllowed } from "@/data/menus";
import { NO_FIELD, savePageRules } from "@/api/pagerules";
import { Empty, Scroll } from "@/components/ui";
import FieldAccess from "@/features/settings/FieldAccess";

/* Settings → Security: which modules and pages the four company logins are
   shown (data/menus.js SALARY_VIEW_ONLY), set by the one login allowed to
   (PAGE_ADMINS). Every other login keeps this build's defaults.

   **A menu, not a permission, and the page says so.** A hidden page is off the
   rail and the strip and its address lands elsewhere; the doctype behind it is
   exactly as readable as it was, because that is the login's roles on the
   site. Somebody hiding Salary Register to keep salaries private would be
   wrong, and should be told before they rely on it. */

const keyOf = (section, subtab) => (subtab === undefined ? section : section + "/" + subtab);

/** One Visible / Hidden switch, or why there is none. */
function Switch({ label, hidden, locked, onPick }) {
	if (locked) return <span className="text-fine text-ink-3">{locked}</span>;
	return (
		<div className="segs" role="group" aria-label={label}>
			<button type="button" className="embtn" aria-pressed={!hidden} onClick={() => onPick("show")}>
				Visible
			</button>
			<button type="button" className="embtn" aria-pressed={hidden} onClick={() => onPick("hide")}>
				Hidden
			</button>
		</div>
	);
}

/** Marks a row that differs from what this build ships with. */
const Changed = ({ on }) => (on ? <> <span className="tag warn">changed</span></> : null);

/* The page is two editors on the one Single: which pages are shown, and which
   Employee fields a login may write. One at a time, because each has its own
   Save and a long table, and two Saves on one screen is a Save pressed for the
   wrong half. */
export default function Security() {
	const s = useApp();
	const [part, setPart] = useState("pages");

	if (!pageAllowed("settings", "security", s.user)) {
		return (
			<Empty title="Only the page administrator can change this">
				Which pages are shown, and which Employee fields can be changed, is set by {PAGE_ADMINS.join(", ")}.
			</Empty>
		);
	}
	return (
		<>
			<div className="segs mb-[.7rem]" role="group" aria-label="What to set">
				<button type="button" className="embtn" aria-pressed={part === "pages"} onClick={() => setPart("pages")}>
					Pages
				</button>
				<button type="button" className="embtn" aria-pressed={part === "fields"} onClick={() => setPart("fields")}>
					Employee fields
				</button>
			</div>
			{part === "pages" ? <Pages /> : <FieldAccess />}
		</>
	);
}

function Pages() {
	const s = useApp();
	const [draft, setDraft] = useState(s.pageRules);
	const [save, setSave] = useState({ busy: false, msg: "", err: "" });

	/* The rules arrive after the page may already be open; a draft nobody has
	   touched follows them, one somebody has been editing is left alone. */
	const dirty = JSON.stringify(draft) !== JSON.stringify(s.pageRules);
	const [touched, setTouched] = useState(false);
	useEffect(() => { if (!touched) setDraft(s.pageRules); }, [s.pageRules, touched]);

	/* Only a difference from the code's default is kept, so a page the code
	   hides later is still hidden on a site that never touched it. */
	function pick(section, subtab, value) {
		const k = keyOf(section, subtab);
		const next = { ...draft };
		if ((value === "hide") === hiddenByDefault(section, subtab)) delete next[k];
		else next[k] = value;
		setTouched(true);
		setDraft(next);
		setSave({ busy: false, msg: "", err: "" });
	}

	async function onSave() {
		setSave({ busy: true, msg: "", err: "" });
		const r = await savePageRules(draft);
		setTouched(false);
		setSave(r.ok
			? { busy: false, msg: "Saved. The company logins are shown these pages from their next page load.", err: "" }
			: { busy: false, msg: "", err: r.error });
	}

	const state = s.pageRulesState;
	const canSave = state === "ok" && dirty && !save.busy;
	const hiddenCount = SECTIONS.reduce((n, m) => n + (hiddenUnder(draft, m.key) ? 1 : 0)
		+ (MODULES[m.key]?.tabs || []).filter((t) => hiddenUnder(draft, m.key, t[0])).length, 0);

	return (
		<>
			<div className="legend">
				<b className="font-display">Page visibility</b>
				<span>{hiddenCount} hidden · applies to {SALARY_VIEW_ONLY.join(", ")}</span>
				<span className="right">
					<button type="button" className="embtn" disabled={!dirty || save.busy}
						onClick={() => { setTouched(false); setDraft(s.pageRules); }}>
						Undo changes
					</button>{" "}
					<button type="button" className="embtn" disabled={!Object.keys(draft).length || save.busy}
						title="Every page back to what this build ships with. Nothing is saved until Save."
						onClick={() => { setTouched(true); setDraft({}); }}>
						Back to defaults
					</button>{" "}
					<button type="button" className="embtn pri" disabled={!canSave} onClick={() => void onSave()}>
						{save.busy ? "Saving…" : "Save"}
					</button>
				</span>
			</div>

			{state === "loading" ? <div className="onbmsg">Reading Manna HR Settings…</div> : null}
			{state === "nofield" ? <div className="onbmsg">{NO_FIELD}</div> : null}
			{state === "unread" ? (
				<div className="onbmsg">
					Manna HR Settings could not be read with this login, so this shows the defaults
					and cannot save. The login needs HR Manager on the site.
				</div>
			) : null}
			{save.msg ? <div className="onbmsg">{save.msg}</div> : null}
			{save.err ? <div className="onbmsg">Not saved: {save.err}</div> : null}

			<Scroll>
				<table>
					<thead>
						<tr>
							<th>Module / page</th>
							<th>Shown</th>
						</tr>
					</thead>
					<tbody>
						{SECTIONS.map((m) => {
							const offModule = hiddenUnder(draft, m.key);
							return [
								<tr key={m.key}>
									<td><b>{m.label}</b><Changed on={keyOf(m.key) in draft} /></td>
									<td>
										<Switch label={m.label} hidden={offModule} locked={!canHide(m.key) && "Always shown"}
											onPick={(v) => pick(m.key, undefined, v)} />
									</td>
								</tr>,
								...(MODULES[m.key]?.tabs || []).map(([sub, label]) => (
									<tr key={keyOf(m.key, sub)} className={offModule ? "muted" : undefined}>
										<td style={{ paddingLeft: "1.5rem" }}>{label}<Changed on={keyOf(m.key, sub) in draft} /></td>
										<td>
											<Switch label={`${m.label} → ${label}`} hidden={hiddenUnder(draft, m.key, sub)}
												locked={!canHide(m.key, sub) && (sub === "overview" ? "Shown with the module" : "Always shown")}
												onPick={(v) => pick(m.key, sub, v)} />
										</td>
									</tr>
								)),
							];
						})}
					</tbody>
				</table>
			</Scroll>
		</>
	);
}
