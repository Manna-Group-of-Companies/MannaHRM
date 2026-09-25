/**
 * The photo the phone app took at a punch, and the one viewer that opens it.
 *
 * The app sends it on `Employee Checkin.custom_photo` (see
 * `app/lib/services/photo.dart`). It is a **private** file, so the `<img>`
 * rides on the reader's own Frappe session through the same `/private` route
 * the Worker and Vite already forward — a reader who may not see the punch
 * gets a broken image, which is drawn as "no photo" rather than as a glyph.
 *
 * It describes; it never judges. Whether the face is the right one is a
 * person's call, and a punch with no photo is shown as having none — the flag
 * a human reads, never a refusal (CLAUDE.md §4).
 */

import { useState } from "react";

import { set, useApp } from "@/store";
import { clock, dmy } from "@/lib/format";
import { Modal } from "@/components/ui";

/** The field the app writes — `kPhotoField` in `app/lib/core/constants.dart`. */
export const PHOTO_FIELD = "custom_photo";

/** The photo's address on a punch, or "" when it has none. Only a site path is
    drawn: an absolute URL in this field was not put there by the app. */
export function photoOf(r) {
	const u = String(r?.[PHOTO_FIELD] || "").trim();
	return u.startsWith("/files/") || u.startsWith("/private/files/") ? u : "";
}

export function openPhoto(r, e = {}) {
	const src = photoOf(r);
	if (!src) return;
	set({
		punchPhoto: {
			src,
			who: `${e.employee_name || r.employee_name || r.employee || ""} (${e.employee_number || r.employee || ""})`,
			when: `${dmy(String(r.time || "").slice(0, 10))} ${clock(r.time)} · ${r.log_type || "punch"}`,
		},
	});
}

/** A thumbnail that opens the viewer; a dash when the punch has no photo, or
    when the one it names will not load. */
export function PhotoCell({ r, e }) {
	const src = photoOf(r);
	const [broken, setBroken] = useState("");
	if (!src || broken === src) return <span className="text-ink-3">—</span>;
	return (
		<button type="button" className="photobtn" title="Show the photo taken at this punch"
			onClick={(ev) => { ev.stopPropagation(); openPhoto(r, e); }}>
			<img src={src} alt="Punch photo" loading="lazy" onError={() => setBroken(src)} />
		</button>
	);
}

export function PhotoDialog() {
	const p = useApp().punchPhoto;
	if (!p) return null;
	return (
		<Modal
			title="Photo taken at this punch"
			onClose={() => set({ punchPhoto: null })}
			actions={
				<a className="btn tpl" href={p.src} target="_blank" rel="noopener noreferrer">
					<i className="fico" aria-hidden="true">↗</i> Open full size
				</a>
			}
			why={<><b>{p.who}</b> · {p.when}</>}
			extra={<img className="photobig" src={p.src} alt={`Photo taken at the punch by ${p.who}`} />}
		/>
	);
}
