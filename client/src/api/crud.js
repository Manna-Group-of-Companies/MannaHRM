import { apiCreate, apiDelete, apiWrite, getDoc, http } from "@/api/client";

/* ---------------------------------------------------------------------------
   Create, change, remove — and Frappe's other two, submit and cancel.

   The one file in this app that writes an arbitrary record. `lib/write.js` says
   what may be written and `features/records/` is how it is asked; this is the
   network, and nothing else here knows a URL.

   **Every function returns `{ok, error}` rather than throwing.** A write that
   fails is not exceptional — a Link that names nothing, a permission the reader
   has not got, a duplicate id — and each of those is a sentence somebody needs
   to read next to the box they typed in. An exception loses the sentence and
   shows a blank screen instead.

   **The site's own words, always.** `frappeError` digs the message out of
   Frappe's several shapes rather than replacing it with a friendlier one:
   "Could not find Department: Nowhere - MR" and "not permitted" are different
   things to do next, and a screen that says "Save failed" has thrown away the
   only part that mattered.
   --------------------------------------------------------------------------- */

/** Frappe's message, out of whichever shape this one came back in.

    A refusal arrives as `_server_messages` (a JSON array of JSON strings), as
    `exception`, as `message`, or as an HTML `<pre>` in `_error_message` —
    depending on which layer refused. All four are tried, in the order that puts
    the most specific first. */
export function frappeError(e) {
	const d = e?.response?.data || {};
	try {
		const msgs = JSON.parse(d._server_messages || "[]").map((m) => {
			try { return JSON.parse(m).message; } catch { return m; }
		});
		if (msgs.length) return strip(msgs.join(" · "));
	} catch { /* not the server-messages shape; fall through */ }
	if (d.exception) return strip(String(d.exception).split("\n").pop());
	if (d.message && typeof d.message === "string") return strip(d.message);
	if (d._error_message) return strip(d._error_message);
	return e?.message || "The site refused the write and said nothing about why.";
}

/** Frappe puts markup in its messages. The text is what somebody reads. */
const strip = (s) => String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** One new record. Returns the id the site named it. */
export async function create(doctype, doc) {
	try {
		const made = await apiCreate(doctype, doc);
		return { ok: true, name: made?.name || "", doc: made };
	} catch (e) {
		return { ok: false, error: frappeError(e), status: e?.status };
	}
}

/** Change one record — only the fields in `patch`.

    Never the whole document: a whole-document write re-sends columns this
    reader may not write, so an edit to a phone number is refused over a salary
    field nobody touched, and it re-sends values that were current when the page
    loaded, so the second of two people saving quietly undoes the first. */
export async function update(doctype, name, patch) {
	if (!patch || Object.keys(patch).length === 0) return { ok: true, name, empty: true };
	return apiWrite(doctype, name, patch);
}

/** Remove one record.

    The commonest refusal here is Frappe's link check — another record names
    this one — and its message carries the count and the doctype, which is
    exactly what somebody needs to go and look. It is passed through whole. */
export async function remove(doctype, name) {
	try {
		await apiDelete(doctype, name);
		return { ok: true };
	} catch (e) {
		return { ok: false, error: frappeError(e), status: e?.status };
	}
}

/**
 * Submit a draft.
 *
 * **Submitting is not saving.** It freezes the document: no field on it can be
 * changed again, and the only way back is cancel-and-amend, which leaves the
 * original visible. Anything that offers this has to say so before the click —
 * see `features/records/RecordForm.jsx`.
 */
export async function submit(doctype, name) {
	return step(doctype, name, 1, "submit");
}

/**
 * Cancel a submitted document.
 *
 * It stays, marked cancelled, and everything derived from it is unwound by the
 * site. **This is the right answer to "that was wrong", and deletion is not**:
 * a cancelled document is a record that somebody made a mistake, and a deleted
 * one is a hole where the evidence was.
 */
export async function cancel(doctype, name) {
	return step(doctype, name, 2, "cancel");
}

/** Set `docstatus` and save. Frappe has `/api/method` endpoints for these too,
    but they take the whole document; this sends one field, which is the same
    argument as `update` above. */
async function step(doctype, name, docstatus, what) {
	try {
		await http.put(
			`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
			{ docstatus },
			{ headers: { "Content-Type": "application/json" } },
		);
		return { ok: true };
	} catch (e) {
		return { ok: false, error: frappeError(e), status: e?.status, what };
	}
}

/**
 * A corrected copy of a cancelled document.
 *
 * Frappe's own answer to a mistake on a submitted record: the cancelled one
 * stays where it is and a new draft is made carrying `amended_from`, so the
 * history reads as "this was wrong, and this replaced it" rather than as one
 * document that quietly changed its mind.
 */
export async function amend(doctype, name) {
	const doc = await getDoc(doctype, name);
	if (!doc) return { ok: false, error: "The site would not return the document to amend." };
	const next = { ...doc, amended_from: name, docstatus: 0 };
	/* The id has to go: the site names the amendment itself, and a POST carrying
	   the cancelled document's id is a duplicate-name refusal. */
	delete next.name;
	delete next.creation;
	delete next.modified;
	delete next.modified_by;
	delete next.owner;
	return create(doctype, next);
}

/** One record, or null. A thin pass-through so `features/records/` imports one
    module rather than two, and so a later change of endpoint is one edit. */
export async function read(doctype, name) {
	try {
		return { ok: true, doc: await getDoc(doctype, name) };
	} catch (e) {
		return { ok: false, error: frappeError(e), status: e?.status };
	}
}
