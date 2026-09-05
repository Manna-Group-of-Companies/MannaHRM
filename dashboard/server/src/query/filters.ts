import type { FilterQuery, Model } from "mongoose";
import { ApiError } from "../http/ApiError.js";
import { schemaPaths } from "./fields.js";

/* ---------------------------------------------------------------------------
   `filters=[["status","=","Open"]]` — the query language the client already
   speaks, translated into Mongo.

   Two forms are accepted because Frappe accepts two and the client uses both
   shapes of the first:

     [["status", "=", "Open"], ["time", ">=", "2026-09-03 00:00:00"]]
     {"status": "Open"}

   A four-element row is allowed as well — `["Employee", "status", "=", "Open"]`
   — because Frappe writes them that way when a filter names its own doctype.
   The doctype is checked and then dropped: a filter naming a *different*
   doctype is a join, and this API does not do joins.

   **An unknown field is a refusal, not a no-op.** Mongo would happily match
   nothing, or — with a filter silently dropped — match everybody, and on a
   leave queue "everybody" reads as a hundred and sixty people all waiting for a
   decision. Same 417 the field list uses, for the same reason.
   --------------------------------------------------------------------------- */

type Triple = [string, string, unknown];

/** The operators, as Frappe spells them, mapped onto Mongo's.

    `like` is Frappe's SQL `LIKE`: `%` is any run of characters. Translated to a
    case-insensitive regex with everything else escaped, so a search box holding
    `a.b` looks for those three characters rather than for any character
    between an a and a b. */
const OPERATORS = new Set([
	"=", "==", "!=", "<", "<=", ">", ">=",
	"like", "not like", "in", "not in", "between", "is",
]);

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function likeToRegex(pattern: string): RegExp {
	/* `%` first, so the wildcard survives the escape pass that follows it. */
	const body = pattern.split("%").map(escapeRegex).join(".*");
	return new RegExp(`^${body}$`, "i");
}

function asArray(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	/* Frappe also takes a comma-separated string for `in`. Accepted here so a
	   hand-written URL behaves, but the client always sends an array. */
	if (typeof value === "string") return value.split(",").map((s) => s.trim());
	return [value];
}

function clauseFor(field: string, rawOp: string, value: unknown): Record<string, unknown> {
	const op = rawOp.trim().toLowerCase();

	switch (op) {
		case "=":
		case "==":
			return { [field]: value };
		case "!=":
			return { [field]: { $ne: value } };
		case "<":
			return { [field]: { $lt: value } };
		case "<=":
			return { [field]: { $lte: value } };
		case ">":
			return { [field]: { $gt: value } };
		case ">=":
			return { [field]: { $gte: value } };
		case "in":
			return { [field]: { $in: asArray(value) } };
		case "not in":
			return { [field]: { $nin: asArray(value) } };
		case "like":
			return { [field]: likeToRegex(String(value)) };
		case "not like":
			return { [field]: { $not: likeToRegex(String(value)) } };
		case "between": {
			const [lo, hi] = asArray(value);
			return { [field]: { $gte: lo, $lte: hi } };
		}
		case "is":
			/* Frappe's `["field", "is", "set"]`. "Not set" has to cover three
			   things — absent, null, and the empty string — because all three are
			   ways this data says "nobody filled this in", and a report that counts
			   only one of them under-reports the gap it exists to find. */
			return String(value).toLowerCase() === "set"
				? { [field]: { $nin: [null, ""] } }
				: { [field]: { $in: [null, ""] } };
		default:
			throw ApiError.invalid(
				"BadOperator",
				`"${rawOp}" is not an operator this API understands. `
				+ `It takes ${[...OPERATORS].join(", ")}.`,
			);
	}
}

/** Normalise one row of the array form into `[field, op, value]`. */
function toTriple(row: unknown, label: string): Triple {
	if (!Array.isArray(row)) {
		throw ApiError.invalid("BadFilter", "Each filter must be an array like [field, op, value].");
	}

	if (row.length === 4) {
		const [onDoctype, field, op, value] = row as [unknown, unknown, unknown, unknown];
		if (String(onDoctype) !== label) {
			throw ApiError.invalid(
				"CrossDoctypeFilter",
				`This filter is on "${String(onDoctype)}" but the read is on "${label}". `
				+ "This API does not join across doctypes — read the other one and match on the client, "
				+ "which is what the dashboard already does with byName.",
			);
		}
		return [String(field), String(op), value];
	}

	if (row.length === 3) {
		const [field, op, value] = row as [unknown, unknown, unknown];
		return [String(field), String(op), value];
	}

	if (row.length === 2) {
		/* `["status", "Open"]` — Frappe's shorthand for equality. */
		const [field, value] = row as [unknown, unknown];
		return [String(field), "=", value];
	}

	throw ApiError.invalid(
		"BadFilter",
		`A filter takes two to four elements, not ${row.length}.`,
	);
}

function parse(raw: unknown): unknown {
	if (raw === undefined || raw === null || raw === "") return null;
	if (typeof raw !== "string") return raw;
	try {
		return JSON.parse(raw);
	} catch {
		throw ApiError.invalid("BadFilters", `filters is not valid JSON: ${raw.slice(0, 120)}`);
	}
}

/** Whatever arrived in `?filters=`, as a Mongo query. */
export function filtersFor(
	label: string,
	model: Model<any>,
	raw: unknown,
): FilterQuery<any> {
	const parsed = parse(raw);
	if (parsed === null) return {};

	const triples: Triple[] = Array.isArray(parsed)
		? parsed.map((row) => toTriple(row, label))
		: Object.entries(parsed as Record<string, unknown>).map(([field, value]) =>
			/* `{"status": ["!=", "Open"]}` is Frappe's object form with an operator;
			   `{"status": "Open"}` is the same thing meaning equality. */
			(Array.isArray(value) && value.length === 2
				? [field, String(value[0]), value[1]]
				: [field, "=", value]) as Triple);

	const known = schemaPaths(model);
	const unknown = triples.map(([f]) => f).filter((f) => !known.has(f));
	if (unknown.length) {
		throw ApiError.unknownField(
			"UnknownField",
			`${label} has no field ${unknown.map((f) => `"${f}"`).join(", ")} to filter on. `
			+ "Refused rather than ignored: a dropped filter does not return an error, it returns everybody.",
		);
	}

	const clauses = triples.map(([field, op, value]) => clauseFor(field, op, value));
	if (clauses.length === 0) return {};
	if (clauses.length === 1) return clauses[0] as FilterQuery<any>;

	/* `$and` rather than merging the objects. Two filters on one field — a date
	   range, which is the commonest case here — would otherwise have the second
	   silently overwrite the first, and a report asked for one month would come
	   back holding everything since the beginning. */
	return { $and: clauses } as FilterQuery<any>;
}

/** `?order_by=modified desc`, as Mongo wants it. Falls back to the doctype's
    own default, which is the sort the screens were built expecting. */
export function sortFor(
	label: string,
	model: Model<any>,
	raw: unknown,
	fallback: Record<string, 1 | -1>,
): Record<string, 1 | -1> {
	if (typeof raw !== "string" || raw.trim() === "") return fallback;

	const out: Record<string, 1 | -1> = {};
	for (const part of raw.split(",")) {
		const [field, direction] = part.trim().split(/\s+/);
		if (!field) continue;
		if (!schemaPaths(model).has(field)) {
			throw ApiError.unknownField(
				"UnknownField",
				`${label} has no field "${field}" to sort on.`,
			);
		}
		out[field] = String(direction ?? "asc").toLowerCase() === "desc" ? -1 : 1;
	}
	return Object.keys(out).length ? out : fallback;
}
