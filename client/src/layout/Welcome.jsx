import { useState } from "react";
import { useApp } from "@/store";
import { markWelcomed, welcomed } from "@/lib/welcome";
import { firstName } from "@/layout/TopBar";
import KitIcon from "@/components/kit/KitIcon";

/** The first-visit welcome (lib/welcome.js): who it is for, and the three
    ways round the app that are not on the screen. Every key it names is one
    layout/GoTo.jsx and layout/Shortcuts.jsx really bind. */
const TIPS = [
	["search", "Find anything with /", "Press / or Ctrl+K to go to any person or page."],
	["kbd", "Jump with shortcuts", "Press g then a letter — g e for Employees, g p for Payroll. Press ? to see them all."],
	["building", "Your company first", "Pick a company in the top bar and every page shows only its people."],
];

export default function Welcome() {
	const s = useApp();
	const [open, setOpen] = useState(() => Boolean(s.user) && !welcomed(s.user));
	if (!open || !s.user) return null;
	const close = () => { markWelcomed(s.user); setOpen(false); };
	const name = firstName(s.user, s.me);
	return (
		<div className="k-ov k-show" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
			<div className="k-modal k-welcome" role="dialog" aria-modal="true" aria-label="Welcome">
				<div className="k-welcome-band" aria-hidden="true"><span>M</span></div>
				<h2>Welcome to Manna HR{name ? `, ${name}` : ""}</h2>
				<p className="k-sub-t">Here&rsquo;s how to get around quickly.</p>
				<ul className="k-welcome-tips">
					{TIPS.map(([icon, head, text]) => (
						<li key={head}>
							<span className="k-welcome-ico"><KitIcon name={icon} size={18} stroke={2} /></span>
							<div><b>{head}</b><small>{text}</small></div>
						</li>
					))}
				</ul>
				<div className="k-modal-f">
					<button type="button" className="k-btn k-btn-green" onClick={close} autoFocus>Get started</button>
				</div>
			</div>
		</div>
	);
}
