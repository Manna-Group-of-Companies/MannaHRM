import type { Model } from "mongoose";
import { ApiError } from "../http/ApiError.js";

/* ---------------------------------------------------------------------------
   `fields=["name","employee_name"]` — which columns come back, and what
   happens when one of them does not exist.

   **Asking for a field this schema does not have fails the whole read, with
   417.** That is the single most important behaviour in this file and it is
   not a convenience: the client probes what a site carries by asking for the
   long field list and falling back to the short one when the read is refused.
   See `load()` in client/src/api/load.js, which does it three times over.

   A server that quietly returned the columns it recognised and dropped the
   rest would turn every one of those probes into a false positive. The
   dashboard would take the long branch, get a column of blanks, and draw a
   Salary Master where every pay figure is empty — indistinguishable, on the
   screen, from a site where nobody has been paid yet. A refusal is legible; a
   blank column is not.
   --------------------------------------------------------------------------- */

/** Mongo's own bookkeeping, which is nobody else's business. `name` is the id
    on this API, so `_id` leaving the building would give every document two. */
const INTERNAL = new Set(["_id", "__v"]);

const pathCache = new WeakMap<Model<any>, Set<string>>();

/** Every field name a caller may legitimately ask for, child tables included.

    Top-level only, deliberately. `holidays` is askable and `holidays.date` is
    not, which is exactly the reach a Frappe list read has — and the reason the
    client fetches holiday lists one document at a time rather than pulling the
    dates out of a list call. */
export function schemaPaths(model: Model<any>): Set<string> {
	const cached = pathCache.get(model);
	if (cached) return cached;

	const paths = new Set<string>();
	for (const key of Object.keys(model.schema.paths)) {
		if (INTERNAL.has(key)) continue;
		/* `employee_education.0.school_univ` and friends collapse to the array
		   they live on. A caller asks for the table, not for a row of it. */
		paths.add(key.split(".")[0] as string);
	}
	pathCache.set(model, paths);
	return paths;
}

/** Parse whatever arrived in `?fields=`. Frappe takes it as a JSON array and so
    does this; a bare string is accepted as one field because it costs a line
    and saves an argument with anybody hand-rolling a URL. */
export function parseFields(raw: unknown): string[] | null {
	if (raw === undefined || raw === null || raw === "") return null;
	if (Array.isArray(raw)) return raw.map(String);
	if (typeof raw !== "string") return null;

	const text = raw.trim();
	if (!text.startsWith("[")) return [text];

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw ApiError.invalid(
			"BadFields",
			`fields is not valid JSON: ${text.slice(0, 120)}`,
		);
	}
	if (!Array.isArray(parsed)) {
		throw ApiError.invalid("BadFields", "fields must be a JSON array of field names.");
	}
	return parsed.map(String);
}

/** The Mongo projection for a field list, or `null` for "the whole document".

    `name` is added whether or not it was asked for. It is the document id, the
    client keys `byName` on it, and a row that came back without one cannot be
    linked to, selected, or told apart from the row beside it. */
export function projectionFor(
	label: string,
	model: Model<any>,
	fields: string[] | null,
): Record<string, 1> | null {
	if (!fields || fields.length === 0) return null;
	if (fields.includes("*")) return null;

	const known = schemaPaths(model);
	const unknown = fields.filter((f) => !known.has(f));
	if (unknown.length) {
		throw ApiError.unknownField(
			"UnknownField",
			`${label} has no field ${unknown.map((f) => `"${f}"`).join(", ")}. `
			+ "The whole read is refused rather than returning a blank column, because "
			+ "a column that is quietly empty cannot be told apart from a field nobody has filled in.",
		);
	}

	const projection: Record<string, 1> = { name: 1 };
	for (const f of fields) projection[f] = 1;
	return projection;
}

/** One document, as it leaves. Mongo's `_id` never goes out — `name` is the id
    here, and a second one would be a second way to address the same record. */
export function stripInternal<T extends Record<string, unknown>>(doc: T): Omit<T, "_id" | "__v"> {
	const out = { ...doc };
	for (const key of INTERNAL) delete out[key];
	return out;
}
