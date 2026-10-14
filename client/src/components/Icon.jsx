/** One stroked icon set for the chrome and the dashboard.
 *
 *  Inline paths rather than an icon font or a package, for the reason the
 *  header's own glyphs give: a font is a request that has to land before the
 *  page stops looking broken, and twenty paths is twenty strings.
 *
 *  **Why not emoji, which the dashboard used until 6 October 2026.** An emoji
 *  is drawn by the operating system's colour font, so the same card is a
 *  cartoon on Windows, a different cartoon on Android and a grey box on the
 *  machines where the glyph is missing. A stroked path takes `currentColor`,
 *  sits on the brand's own tint, and looks the same on every screen HR uses.
 */

const PATHS = {
	users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
	userPlus: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M19 8v6M22 11h-6",
	userMinus: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M22 11h-6",
	inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11",
	clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 6v6l4 2",
	check: "M20 6 9 17l-5-5",
	checkCircle: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
	circle: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
	alarm: "M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16M12 9v4l2 2M5 3 2 6M22 6l-3-3",
	palm: "M12 22V11M12 11C9 6 4 6 2 8M12 11c3-5 8-5 10-3M12 11c-1-4-4-7-8-7M12 11c1-4 4-7 8-7",
	calendar: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
	link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
	file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
	wallet: "M20 12V8H6a2 2 0 0 1 0-4h12v4M4 6v12a2 2 0 0 0 2 2h14v-4M18 12a2 2 0 0 0 0 4h4v-4z",
	gift: "M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7",
	megaphone: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
	message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
	building: "M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01",
	layers: "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
	trend: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
	magnet: "M6 15A6 6 0 0 0 18 15V4h-4v11a2 2 0 0 1-4 0V4H6zM6 8h4M14 8h4",
	activity: "M22 12h-4l-3 9L9 3l-3 9H2",
	search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
	arrowRight: "M5 12h14M12 5l7 7-7 7",
	chevron: "M9 18l6-6-6-6",
	expand: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
	collapse: "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7",
	sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
	command: "M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 0 0 0-6",
	corner: "M9 10l-5 5 5 5M20 4v7a4 4 0 0 1-4 4H4",
};

/** `name` picks the glyph; anything else (`className`, `title`) goes to the
    `<svg>`. Decorative by default — every place this is used has its words
    beside it, and a screen reader reading "image" before each one is noise. */
export default function Icon({ name, className, ...rest }) {
	const d = PATHS[name];
	if (!d) return null;
	return (
		<svg
			viewBox="0 0 24 24"
			className={"icon" + (className ? " " + className : "")}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			{...rest}
		>
			<path d={d} />
		</svg>
	);
}

export const ICON_NAMES = Object.keys(PATHS);
