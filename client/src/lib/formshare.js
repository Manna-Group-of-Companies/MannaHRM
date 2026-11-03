/* ---------------------------------------------------------------------------
   Share form — the new-employee Google Form, sent on WhatsApp to somebody new
   on a machine, with their machine number and name already in it (HR, 2
   November 2026).

   The link is Google's own pre-filled link, made once with the answers
   NUMBER and NAME: each `entry.…=NUMBER` / `entry.…=NAME` is swapped for the
   person's own. Nothing about the form's questions is known here, so a form
   rebuilt with new questions needs only a new pre-filled link.
   --------------------------------------------------------------------------- */

export const NUMBER = "NUMBER";
export const NAME = "NAME";

/** Whether a link can be used: a Google Form with NUMBER somewhere in it. */
export function isFormLink(link) {
	return /^https:\/\/docs\.google\.com\/forms\//.test(String(link || "").trim())
		&& String(link).includes("=" + NUMBER);
}

/** The person's own link: NUMBER and NAME swapped for theirs. */
export function formLinkFor(link, { pin, name }) {
	const [base, query = ""] = String(link || "").trim().split("?");
	if (!query) return base;
	const params = query.split("&").map((p) => {
		const [k, v] = p.split("=");
		if (v === NUMBER) return `${k}=${encodeURIComponent(String(pin || ""))}`;
		if (v === NAME) return `${k}=${encodeURIComponent(String(name || ""))}`;
		return p;
	});
	return `${base}?${params.join("&")}`;
}

/** WhatsApp with the message ready and the contact left to choose. */
export function whatsappLink(text) {
	return "https://wa.me/?text=" + encodeURIComponent(text);
}

/** What is sent: who it is for, and the link — never last. WhatsApp joins a
    second share onto the end of the first in the same box, and a link that
    ends the text took the next "Hello" into its name ("Manoj%20ramHello",
    2 November 2026). A line after it keeps the link whole. */
export function shareText({ pin, name, company }, link) {
	return [
		`Hello${name ? " " + name : ""},`,
		`Please fill in your details for ${company || "Manna"} (machine no. ${pin}):`,
		link,
		"",
		"Thank you — Manna HR",
		"",
	].join("\n");
}
