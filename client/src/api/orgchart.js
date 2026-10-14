import { api, apiCall, apiWrite, getDoc, whoami } from "@/api/client";
import { blankChart, chartNote, cleanChart, hasChart, parseChartNote } from "@/lib/orgchart";

/* ---------------------------------------------------------------------------
   Where a company's drawn chart is kept (14 October 2026).

   Its own field, `Company.custom_org_chart`, once
   `tools/create_custom_fields.py Company --apply` has put it on the site.
   Until then — and wherever this login may read a Company but not change it,
   which is most of HR — it is a comment on the Company, the latest one
   winning, written as the signed-in person. Both are stock Frappe; nothing
   here is a store of ours.
   --------------------------------------------------------------------------- */

export const CHART_FIELD = "custom_org_chart";

async function latestNote(company) {
	const r = await api("/api/method/frappe.desk.form.load.getdoc", { doctype: "Company", name: company });
	const notes = (r?.docinfo?.comments || [])
		.map((c) => ({ at: String(c.creation || ""), chart: parseChartNote(c.content) }))
		.filter((c) => c.chart)
		.sort((a, b) => b.at.localeCompare(a.at));
	return notes[0]?.chart || null;
}

/** The company's chart, or an empty one; `field` says whether the site has
    the field, which decides where a save goes. */
export async function readChart(company) {
	const doc = await getDoc("Company", company);
	const field = Boolean(doc && CHART_FIELD in doc);
	if (field && doc[CHART_FIELD]) return { chart: cleanChart(doc[CHART_FIELD]), field };
	const noted = await latestNote(company).catch(() => null);
	return { chart: noted || blankChart(), field };
}

/** Save the chart. The field first where the site has it; a refusal there
    (no write on Company) falls back to the comment, so a save is never lost
    to a permission the chart does not need.
    @returns {Promise<{ok: boolean, error?: string}>} */
export async function saveChart(company, chart, field) {
	const clean = cleanChart(chart);
	if (field) {
		const r = await apiWrite("Company", company, { [CHART_FIELD]: hasChart(clean) ? JSON.stringify(clean) : "" });
		/* A cleared chart is also said as a comment: an empty field reads the
		   comments, and an older chart there must not come back. */
		if (r.ok && hasChart(clean)) return { ok: true };
	}
	try {
		const user = await whoami();
		await apiCall("frappe.desk.form.utils.add_comment", {
			reference_doctype: "Company", reference_name: company,
			content: chartNote(clean).split("\n").join("<br>"), comment_email: user, comment_by: user,
		});
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e.message || String(e) };
	}
}
