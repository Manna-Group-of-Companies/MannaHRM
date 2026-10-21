/** One of the HRDashboard reference's icons, drawn as its `ic()` draws them:
 *  a 24-unit box, stroked in the current colour, round caps and joins.
 *
 *  `size` and `stroke` are the reference's own two arguments; most of its
 *  calls are 20 at 1.8, which is the default here too. An unknown name draws
 *  the info glyph rather than nothing, as the reference does — a hole where an
 *  icon belongs reads as a page that failed to load. */

import { KIT_ICONS } from "@/components/kit/icons";

export default function KitIcon({ name, size = 20, stroke = 1.8, className, ...rest }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={stroke}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className={className}
			/* The reference's own markup, from a file in this repo: see icons.js. */
			dangerouslySetInnerHTML={{ __html: KIT_ICONS[name] || KIT_ICONS.info }}
			{...rest}
		/>
	);
}
