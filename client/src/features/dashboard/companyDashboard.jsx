import { useApp } from "@/store";
import { Empty } from "@/components/ui";
import Dashboard from "@/features/dashboard/Dashboard";

/* One dashboard per company, from one entry in `data/companies.js`.
 *
 * There is no second dashboard here and there should not be. The page is the
 * same Start Up every other reader sees; the only difference is that its
 * company is pinned rather than taken from the top-bar picker, so every panel
 * on it counts one company and the heading says which. Building a separate
 * screen would mean two sets of panels drifting apart, and the one that drifted
 * would be the one nobody opened — which is the one that then gets quoted.
 *
 * Named `companyDashboard` with a `displayName` on what it returns, for the
 * reason `makeReport` gives: the registry wants a component per address, and a
 * stack trace out of one of these should say which company it was drawing.
 *
 * ## Why the page checks the site rather than trusting the table
 *
 * `COMPANY_PAGES` is a static table (it has to be — see the file), so a page
 * exists for a company whether or not the site has one. Two quite different
 * things make it absent, and the panel says both because from here they are
 * indistinguishable and the reader can tell them apart instantly:
 *
 *   - **It was never created.** `Hi-Tech Rubber Industries` is the live case —
 *     `docs/COMPANIES.md` still lists it as one of two to create.
 *   - **This reader may not see it.** An `HR User` scoped by a User Permission
 *     on `Company` gets exactly their own company back from the site, so the
 *     other three pages read as absent for them, correctly.
 *
 * The alternative is drawing the panels against no rows, which is a page of
 * confident zeroes — a headcount of 0 and an attendance summary of 0 present.
 * That is the one thing this dashboard is not allowed to do: every number on it
 * is one the site answered, and "the site does not have this company" is an
 * answer, where "0 employees" is a fabrication.
 */
export default function companyDashboard({ slug, company, label }) {
	function CompanyDashboard() {
		const s = useApp();
		/* The site's own list, not the table's. This is the question "does the
		   reader in front of me have this company", and only the site can answer
		   it — see above. */
		const onSite = (s.companies || []).some((c) => c.name === company);

		return (
			<>
				<div className="legend">
					<b className="font-display">{company}</b>
					<span>{onSite ? "Every panel below counts this company only" : "Not on this site"}</span>
				</div>

				{onSite ? (
					<Dashboard company={company} />
				) : (
					<Empty title={`${company} is not on this site`}>
						Either the Company has not been created yet — <b>{label}</b> is one of the
						two <code>docs/COMPANIES.md</code> still asks for — or your login is scoped
						to a different company by a User Permission on <code>Company</code>, which
						is how per-company access is granted here.
						<br />
						<br />
						This page deliberately draws nothing rather than a headcount of zero. A
						company the site cannot answer for and a company with nobody in it are not
						the same finding, and only one of them is a bug.
					</Empty>
				)}
			</>
		);
	}
	CompanyDashboard.displayName = `CompanyDashboard(${slug})`;
	return CompanyDashboard;
}
