/* ---------------------------------------------------------------------------
   News: the HRDashboard reference's News page on `Manna Announcement`
   (21 October 2026 — docs/kit-pages.md). The doctype the front page's
   Announcements and CEO Speak panels already read, so a post written here is
   the one those panels show.

   The reference's categories are the doctype's `kind`. Its "Pin to the top",
   cover colour and "Notify everyone" have no field behind them (D4: no new
   fields yet), so the page leaves them off rather than keeping them in this
   browser; Published and the from/to window are real and take their place.

   Who sees a company's post is the server's rule (manna_hr/permissions.py),
   not this file's.
   --------------------------------------------------------------------------- */

import { apiCreate, apiDelete, apiWrite, listAll } from "@/api/client";

export const DOCTYPE = "Manna Announcement";
export const KINDS = ["Announcement", "CEO Speak"];
const FIELDS = ["name", "kind", "title", "company", "published", "from_date", "to_date", "body", "posted_by", "posted_on", "owner", "creation"];

/** Every post this login may read, newest first. */
export async function readNews() {
	const rows = await listAll(DOCTYPE, FIELDS, null, 500);
	return rows.sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || String(b.creation).localeCompare(String(a.creation)));
}

/** The day a post counts from: when it was posted, else when it was made. */
export const dateOf = (n) => String(n.posted_on || n.from_date || n.creation || "").slice(0, 10);

/** The Text Editor's HTML as plain paragraphs, and back. The body is shown as
    text and never as HTML: a post is read by everybody who signs in, and
    rendering what somebody typed would let one post run in all their pages. */
export function bodyText(html) {
	if (!html) return "";
	const doc = new DOMParser().parseFromString(String(html).replace(/<\/(p|div|h\d|li)>|<br\s*\/?>/gi, "\n"), "text/html");
	return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const bodyHtml = (text) =>
	String(text).split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");

export async function saveNews(name, doc) {
	if (name) {
		const r = await apiWrite(DOCTYPE, name, doc);
		if (!r.ok) throw new Error(r.error || "The site would not save it.");
		return name;
	}
	const made = await apiCreate(DOCTYPE, doc);
	return made.name;
}

export const deleteNews = (name) => apiDelete(DOCTYPE, name);
