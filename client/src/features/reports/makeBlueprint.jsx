import Blueprint from "@/features/reports/Blueprint";
import { blueprintsFor } from "@/data/blueprints";

/* The 106 addresses, as page components, generated from their menu rather than
   listed by hand.

   A hand-written entry per item would be 106 lines that have to be kept level
   with 106 rows in `data/factohr.js`, and the drift would show up as a link
   that 404s on a page whose whole job is to prove nothing was left out.

   `displayName` carries the item's real title, so a stack trace from inside one
   of these says which of their screens it was. */
export function blueprintPages(section) {
	const pages = {};
	for (const { slug, title } of blueprintsFor(section)) {
		function BlueprintPage() {
			return <Blueprint section={section} title={title} />;
		}
		BlueprintPage.displayName = `Blueprint(${section}/${title})`;
		pages[slug] = BlueprintPage;
	}
	return pages;
}
