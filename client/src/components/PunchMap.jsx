/**
 * A phone punch's location, anywhere a punch is drawn — and the one map that
 * opens from all of them.
 *
 * The In / Out report, the Present report, Daily Detail, the profile and the
 * dashboard feed each show a punch-in. They share this rather than each growing
 * their own map, so "where was this punch" looks and behaves the same on every
 * screen. The dialog is drawn once, by the shell, off `punchMap`.
 */

import { getState, set, useApp } from "@/store";
import { clock, dmy } from "@/lib/format";
import { coordOf, coordText, mapEmbed, mapLink, placeText } from "@/lib/punchplace";
import { Modal } from "@/components/ui";

/** Opens the map for one punch. `e` is the Employee, for the heading. */
export function openMap(r, e = {}) {
	const c = coordOf(r);
	if (!c) return;
	set({
		punchMap: {
			...c,
			who: `${e.employee_name || r.employee_name || r.employee || ""} (${e.employee_number || r.employee || ""})`,
			when: `${dmy(String(r.time || "").slice(0, 10))} ${clock(r.time)} · ${r.log_type || "punch"}`,
			where: placeText(r, getState().workLocs),
		},
	});
}

/**
 * The coordinate on a punch, as the button that opens its map; a dash when it
 * has none.
 *
 * `compact` is the pin alone, for places with no room for two numbers — a chip
 * on the profile, a line in the feed. The coordinate is still on it, as the
 * title, so nothing is hidden that the wide form shows.
 */
export function LocCell({ r, e, compact }) {
	const t = coordText(r);
	if (!t) return compact ? null : <span className="text-ink-3">—</span>;
	const where = placeText(r, getState().workLocs);
	return (
		<button type="button" className="locbtn" title={`Show on a map — ${t}${where ? ` · ${where}` : ""}`}
			onClick={(ev) => { ev.stopPropagation(); openMap(r, e); }}>
			<span aria-hidden="true">📍</span>{compact ? (where ? ` ${where}` : " map") : ` ${t}`}
		</button>
	);
}

/** The map. The embed is OpenStreetMap's and the link out is Google's — see
    `mapEmbed` and `mapLink` for why each. */
export function MapDialog() {
	const m = useApp().punchMap;
	if (!m) return null;
	return (
		<Modal
			title="Where this punch was made"
			wide
			onClose={() => set({ punchMap: null })}
			actions={
				<a className="btn tpl" href={mapLink(m.lat, m.lng)} target="_blank" rel="noopener noreferrer">
					<i className="fico" aria-hidden="true">🗺</i> Open in Google Maps
				</a>
			}
			why={
				<>
					<b>{m.who}</b> · {m.when}
					<br />
					<span className="font-mono">{m.lat.toFixed(6)}, {m.lng.toFixed(6)}</span>
					{m.where ? ` · ${m.where}` : ""}
					<br />
					This is what the phone reported, and a phone indoors can be off by tens of metres. Whether the
					punch was inside the fence is the server's call, and it is only shown here when the site made one.
				</>
			}
			extra={<iframe className="iomap" title="Map of the punch" src={mapEmbed(m.lat, m.lng)} loading="lazy" />}
		/>
	);
}
