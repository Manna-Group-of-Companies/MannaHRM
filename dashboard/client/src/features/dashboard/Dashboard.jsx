

import { useApp } from "@/store";
import { active, scoped } from "@/lib/scope";
import { fmt, isoAgo, tally, tidyDept } from "@/lib/format";
import { Bars, Cols, Empty, Legend, Panel, Tile, Tiles } from "@/components/ui";

export default function Dashboard() {
	const s = useApp();
	const a = active(s);
	const ci = s.checkins;
	const inb = new Set(ci.filter((c) => c.log_type === "IN").map((c) => c.employee));
	const outb = new Set(ci.filter((c) => c.log_type === "OUT").map((c) => c.employee));
	const done = [...inb].filter((e) => outb.has(e)).length;

	return (
		<>
			<Legend
				title="Coverage against Factor HR"
				states={[
					["live", "built and running on real data"],
					["part", "built, waiting on data or shifts"],
					["none", "exists in Factor HR, not here"],
					["skip", "dropped from this release by decision"],
				]}
			/>

			<Cols>
				<Panel title="Employees Summary" cov="live" ico="👥">
					<Tiles>
						<Tile k="Active Employees" n={fmt(a.length)} />
						<Tile
							k="New Employees"
							n={fmt(a.filter((e) => e.date_of_joining && e.date_of_joining >= isoAgo(90)).length)}
							s="joined in 90 days"
						/>
						<Tile k="Left Employees" n={fmt(s.counts.left || 0)} s="not imported by default" />
						<Tile k="Licensed" n="—" s="ERPNext does not charge per head" />
					</Tiles>
				</Panel>

				<Panel title="Employee Attendance Summary" cov={ci.length ? "live" : "part"} ico="🕒">
					<Tiles>
						<Tile k="Total In" n={fmt(inb.size)} cls="good" />
						<Tile k="Not Yet In" n={fmt(Math.max(0, a.length - inb.size))} cls="warn" />
						<Tile k="Late-In" n="—" s="needs shifts" />
						<Tile k="On Leave" n={fmt(s.approvals.leave.length)} />
						<Tile k="Completed" n={fmt(done)} s="both punches" />
					</Tiles>
				</Panel>

				<Panel title="Headcount by company" cov="live" ico="🏭">
					<Bars pairs={tally(a, "company")} />
				</Panel>

				<Panel title="Headcount by department" cov="live" ico="🗂">
					<Bars pairs={tally(a.map((e) => ({ d: tidyDept(e.department) })), "d").slice(0, 10)} />
				</Panel>

				<Panel title="Quick Reports" cov="part" ico="📄">
					<div className="links">
						<span>Daily Detail Attendance</span>
						<span className="off">ECR File</span>
						<span>Employee Detail</span>
						<span className="off">Employee Earnings</span>
						<span>In / Out Activity</span>
						<span className="off">IncomeTax Register</span>
						<span>Leave Balance</span>
						<span className="off">Salary Pay-slip</span>
						<span className="off">Salary Register</span>
						<span />
					</div>
				</Panel>

			</Cols>

			{/* Kept out of the grid: it is a footnote on the whole page rather than
			    another panel to compare against Factor HR. */}
		</>
	);
}
