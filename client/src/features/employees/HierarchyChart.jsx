import { useApp } from "@/store";
import { go } from "@/routes/router";
import { fmt } from "@/lib/format";
import { peopleOf, branchesOf, headOfficeOf } from "@/lib/hierarchy";
import { Empty } from "@/components/ui";

/* Employees → Hierarchy Chart (10 October 2026): the group.

   The head office on top, an arrow down to every other company, each box
   carrying its headcount. Clicking a box opens that company's flow chart on
   its own page (`/employees/chart`, CompanyChart.jsx): the head office with
   everybody on the seven-level ladder, any other company with its office
   staff only. Nothing is drawn under the boxes here — the third ask of the
   day moved the chart off this page so the group reads as a chart and not as
   a header over one.

   Not scoped by the company picker: the chart *is* the company picker here,
   and a page that hid every box but the one in the top bar would be a chart
   of one box. */

const open = (name) => go({ hcCompany: name, section: "employees", subtab: "chart" });

const Node = ({ name, n, head }) => (
	<button type="button" className={"hcnode" + (head ? " hchead" : "")} onClick={() => open(name)}
		title={head ? "Open the head office's chart" : "Open this company's office staff"}>
		<b>{name}</b>
		<span className="hcmeta">{head ? "Head office · " : ""}{fmt(n)} {n === 1 ? "person" : "people"}</span>
	</button>
);

export default function HierarchyChart() {
	const s = useApp();
	const head = headOfficeOf(s.companies);
	const branches = branchesOf(s.companies);

	if (!s.employees.length) return <Empty title="No employees have been read." />;
	if (!head) return <Empty title="No companies have been read." />;

	return (
		<div className="hcgroup">
			<Node name={head} n={peopleOf(s.employees, head, head).length} head />
			{branches.length ? <div className="hctrunk" /> : null}
			<ul className="hcbranches" aria-label="Companies under the head office">
				{branches.map((c) => (
					<li key={c} className="hcbranch">
						<span className="hcarrow" aria-hidden="true" />
						<Node name={c} n={peopleOf(s.employees, c, head).length} />
					</li>
				))}
			</ul>
		</div>
	);
}
