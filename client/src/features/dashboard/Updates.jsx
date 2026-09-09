import { Note, Panel } from "@/components/ui";
import { dmy } from "@/lib/format";
import { UPDATES } from "@/data/updates";

/* ---------------------------------------------------------------------------
   Factor HR's third tab. Theirs carries factoHR's release notes; this one
   carries this system's, which is the only version of that tab that means
   anything here.

   Newest first, and each entry says who has to do something — see
   `data/updates.js` for why they are written by hand.
   --------------------------------------------------------------------------- */

export default function Updates() {
	return (
		<>
			<Panel title="Product Updates" cov="live" ico="🆕">
				<ul className="wishlist">
					{UPDATES.map((u) => (
						<li key={u.on + u.title} className="upd">
							<span className="who">
								<b>{u.title}</b>
								<em>{dmy(u.on)} · {u.who}</em>
								<span className="text-read text-ink-2">{u.what}</span>
							</span>
						</li>
					))}
				</ul>
			</Panel>
			<Note>
				Factor HR's own Product Updates tab is factoHR writing to Manna about a
				product Manna buys. This one is about the system Manna is building, so
				it is written here — and written for whoever has to change what they do,
				not for whoever reads the diff.
			</Note>
		</>
	);
}
