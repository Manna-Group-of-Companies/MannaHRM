/** The module rail — Factor HR's own left-hand nav, in its order. */

import { SECTIONS } from "@/data/sections";
import { useStore } from "@/store";
import Link from "@/routes/Link";

export default function Sidebar() {
	const section = useStore((s) => s.section);
	return (
		<aside className="side">
			<div className="brand">
				<span className="mark">
					<span className="o">MA</span>
					<span className="c">NN</span>
					<span className="o">A</span>
				</span>
				<small>HR</small>
			</div>
			<nav aria-label="Modules">
				{SECTIONS.map((s) => (
					<Link
						key={s.key}
						section={s.key}
						className="nav"
						aria-current={section === s.key ? "page" : undefined}
					>
						<svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
							<path d={s.icon} />
						</svg>
						<span>{s.label}</span>
					</Link>
				))}
			</nav>
		</aside>
	);
}
