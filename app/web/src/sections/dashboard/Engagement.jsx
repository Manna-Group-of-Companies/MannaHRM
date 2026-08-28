import { ENGAGEMENT } from "@/data/onboard";
import { Cols, Note, NoteBelow, Panel } from "@/components/ui";

export default function Engagement() {
	return (
		<Cols>
			<Panel title="Engagement panels" cov="skip" ico="💬">
				<div className="rows">
					{ENGAGEMENT.map((r) => (
						<div className="row" key={r[0]}>
							<span>{r[0]}</span>
							<span className="val muted">{r[1]}</span>
						</div>
					))}
				</div>
				<NoteBelow>
					<b>All present, none used.</b> Read 23 Aug 2026. Nothing here needs rebuilding unless
					Manna says otherwise.
				</NoteBelow>
			</Panel>

			<Panel title="Help Desk" cov="skip" ico="🎫">
				<Note>
					<b>Tried and abandoned</b> — three tickets raised, none resolved, none re-opened. Decision
					taken 23 Aug: not wanted. Frappe Helpdesk stays uninstalled.
				</Note>
			</Panel>

			<Panel title="Almost nobody uses the web" cov="live" ico="📉">
				<Note>
					Factor HR’s own Login Summary for August 2026 shows <b>0 to 4 web logins a day</b>, all
					month, across the whole company. The web UI is an admin tool for a handful of people; the
					workforce reaches the system through fingerprint machines and phones, or not at all. This
					dashboard is built for HR and plant managers on purpose.
				</Note>
			</Panel>
		</Cols>
	);
}
