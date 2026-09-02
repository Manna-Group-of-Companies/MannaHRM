/** The bar over every page: which company, the search, and whether the proxy
 *  can reach the site. */

import { useApp, set } from "@/store";


export default function TopBar() {
	const { companies, company, q, conn, connState } = useApp();
	return (
		<div className="topbar">
			<span className="co">{(company || "MANNA GROUP").toUpperCase()}</span>
			<select
				aria-label="Company"
				value={company}
				onChange={(e) => set({ company: e.target.value })}
			>
				<option value="">All companies</option>
				{companies.map((c) => (
					<option key={c.name}>{c.name}</option>
				))}
			</select>
			<input
				type="search"
				placeholder="Search name, code, designation…"
				aria-label="Search"
				value={q}
				onChange={(e) => set({ q: e.target.value })}
			/>
			<span className="me">
				Hi admin &nbsp;·&nbsp;
				<span className="status">
					<span className={"dot " + connState} />
					<span>{conn}</span>
				</span>
			</span>
		</div>
	);
}
