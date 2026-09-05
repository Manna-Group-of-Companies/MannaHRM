/**
 * A link to a page on this site.
 *
 * A real `<a href>`, so everything a person expects of a link works: the status
 * bar shows where it goes, middle-click and Ctrl-click open a tab, right-click
 * offers Copy link address, and a screen reader announces it as a link rather
 * than as a button that does something unsaid.
 *
 * A plain left click is intercepted and handled in the page — no reload, no
 * flash, no second read of the employee list. Everything else is left to the
 * browser, which is why the modifier tests below are not optional: swallowing a
 * Ctrl-click would take away the one thing the anchor was for.
 */

import { navigate, pathFor } from "@/routes/router";
import { OVERVIEW } from "@/routes/paths";

export default function Link({ section, subtab = OVERVIEW, children, ...rest }) {
	const href = pathFor(section, subtab);
	const onClick = (e) => {
		// Anything but an unmodified left click is the browser's to handle:
		// Ctrl/Cmd for a new tab, Shift for a window, middle-click for a tab.
		if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
			return;
		}
		e.preventDefault();
		navigate(section, subtab);
	};
	return <a href={href} onClick={onClick} {...rest}>{children}</a>;
}
