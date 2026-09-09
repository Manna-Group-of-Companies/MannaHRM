import RecordList from "@/features/records/RecordList";
import { MANAGED } from "@/data/manage";

/* One page per record doctype, generated from `data/manage.js`.

   Fifteen hand-written wrappers would be fifteen chances for a page's title to
   drift from the doctype behind it — and the whole point of this path is that
   the screen and the table cannot disagree. */
export function managedPages(section) {
	const pages = {};
	for (const [sec, slug, title, doctype, note] of MANAGED) {
		if (sec !== section) continue;
		function Managed() {
			return <RecordList doctype={doctype} title={title} note={note} />;
		}
		Managed.displayName = `Manage(${doctype})`;
		pages[slug] = Managed;
	}
	return pages;
}

/** The tabs those pages add to a module's strip, in `data/manage.js` order. */
export const managedTabs = (section) =>
	MANAGED.filter((m) => m[0] === section).map((m) => [m[1], m[2]]);
