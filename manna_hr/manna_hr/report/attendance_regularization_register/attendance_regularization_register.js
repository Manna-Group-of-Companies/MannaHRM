/* The register's filter bar.

   `only_open` is on by default and the status picker is empty, which is the
   pair worth explaining: the report opens on what is still waiting, because
   that is what somebody has come to it for — but picking a status clears the
   tick's effect in the Python rather than fighting it, so "show me last
   month's rejections" is one click and not two. */

frappe.query_reports["Attendance Regularization Register"] = {
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			/* Not defaulted to the session's company. An HR Manager reads this
			   across the group, and a default that silently hides three of the
			   four companies is how a queue goes unanswered. Per-company
			   narrowing is a User Permission, not a filter — CLAUDE.md §5. */
		},
		{
			fieldname: "employee",
			label: __("Employee"),
			fieldtype: "Link",
			options: "Employee",
		},
		{
			fieldname: "from_date",
			label: __("From"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
		},
		{
			fieldname: "to_date",
			label: __("To"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
		},
		{
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			/* The leading blank is the "any" option and has to be there — a
			   Select with no empty value cannot be cleared once it is set. */
			options: ["", "Draft", "Pending Approval", "Approved", "Rejected", "Completed"].join("\n"),
		},
		{
			fieldname: "only_open",
			label: __("Only undecided"),
			fieldtype: "Check",
			default: 1,
		},
	],

	formatter(value, row, column, data, def_formatter) {
		const out = def_formatter(value, row, column, data);
		/* One piece of colour, and only on the column it is about. A request
		   that has been waiting a week is the thing this report exists to
		   surface; everything else here is a fact somebody reads rather than a
		   judgement the report makes. */
		if (column.fieldname === "age_days" && data && data.age_days >= 7
			&& ["Draft", "Pending Approval"].includes(data.status)) {
			return `<span style="color: var(--text-danger)">${out}</span>`;
		}
		return out;
	},
};
