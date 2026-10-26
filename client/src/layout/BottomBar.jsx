/** The phone's bottom bar, as the HRDashboard reference draws it: four
 *  destinations and Menu, shown at 880px and under (index.css). Which four is
 *  `barFor` in data/nav.js; Menu opens the side menu as a drawer.
 *
 *  A destination is lit for any page of its module, the way the reference
 *  lights People for the directory and the org chart as well as the list.
 *  Menu is lit when the page open is one the bar does not hold — otherwise a
 *  phone on Payroll shows a bar with nothing lit. */

import { useApp, set } from "@/store";
import Link from "@/routes/Link";
import { barFor } from "@/data/nav";
import KitIcon from "@/components/kit/KitIcon";

export default function BottomBar() {
	const { section, drawer, user, admin } = useApp();
	const bar = barFor(user, admin);
	const elsewhere = !bar.some((b) => b.section === section);

	return (
		<nav className="bnav" aria-label="Quick navigation">
			{bar.map((b) => {
				const on = b.section === section;
				return (
					<Link
						key={b.section}
						section={b.section}
						className={on ? "on" : undefined}
						aria-current={on ? "page" : undefined}
						onClick={() => set({ drawer: false })}
					>
						<KitIcon name={b.icon} size={22} stroke={1.8} />
						{b.label}
					</Link>
				);
			})}
			<button
				type="button"
				className={"bmenu" + (elsewhere ? " on" : "")}
				aria-expanded={drawer}
				aria-label={drawer ? "Close the menu" : "Menu"}
				onClick={() => set({ drawer: !drawer })}
			>
				<KitIcon name="list" size={22} stroke={1.8} />
				Menu
			</button>
		</nav>
	);
}
