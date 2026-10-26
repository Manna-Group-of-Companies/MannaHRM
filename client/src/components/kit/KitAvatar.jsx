/** A person's initials on a pastel disc, as the HRDashboard reference draws
 *  everybody it has no photograph of.
 *
 *  The colour is picked by hashing the name the way the reference's `av()`
 *  does, so one person is the same colour on every screen and from one visit
 *  to the next — the colour is how a list of faces is scanned. The seven
 *  pairs are roles (`--av1` … `--av7` in themes.css) rather than the
 *  reference's literals, so `npm run contrast` checks each pairing. */

import { useState } from "react";

/** Which of the seven, 1-based. Exported for the test that pins it to the
    reference's hash. */
export function avatarTone(name) {
	let h = 0;
	for (const c of String(name || "?")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return (h % 7) + 1;
}

/** Up to two initials: the first letter of each of the first two words. */
export const initialsOf = (name) =>
	String(name || "?").trim().split(/\s+/).map((p) => p[0] || "").slice(0, 2).join("").toUpperCase() || "?";

/** `src`, when the site holds a photograph, is drawn instead of the initials —
    and the initials come back if it will not load, rather than a broken image. */
export default function KitAvatar({ name, size, src = "", className = "", ...rest }) {
	const [broken, setBroken] = useState("");
	const style = size ? { width: size, height: size, fontSize: Math.round(size * 0.36) } : undefined;
	const photo = src && broken !== src;
	return (
		<span className={`av ${className}`.trim()} data-tone={avatarTone(name)} style={style} aria-hidden="true" {...rest}>
			{photo ? (
				<img src={src} alt="" onError={() => setBroken(src)}
					style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
			) : initialsOf(name)}
		</span>
	);
}
