import { Router } from "express";
import { env } from "../env.js";
import { ApiError } from "../http/ApiError.js";
import { asyncRoute } from "../http/asyncRoute.js";
import { doctypeFor, type Doctype } from "../doctypes/registry.js";
import { nextName } from "../doctypes/base.js";
import { parseFields, projectionFor, schemaPaths, stripInternal } from "../query/fields.js";
import { filtersFor, sortFor } from "../query/filters.js";

/* ---------------------------------------------------------------------------
   /api/resource — the four calls the dashboard makes, and nothing else.

     GET    /api/resource/:doctype           a page of a list
     GET    /api/resource/:doctype/:name     one whole document
     POST   /api/resource/:doctype           one draft
     PUT    /api/resource/:doctype/:name     one allowlisted field change
     DELETE /api/resource/:doctype/:name     one master nothing points at

   The shape of the answers is the client's, not this server's preference. It
   reads `{data: [...]}` off a list and `{data: {...}}` off a document — see
   `api`, `listAll` and `getDoc` in client/src/api/client.js — and it reads a
   refusal as `{error, hint}`. Changing any of that is changing ninety screens.
   --------------------------------------------------------------------------- */

export const resourceRouter = Router();

/** Frappe pages at 100 whatever you ask for, and the client's `listAll` loops
    on exactly that number: it stops when a page comes back short. A cap lower
    than 100 here would make every list read loop forever on a full page that
    is never full; a cap much higher would let one URL pull the whole
    collection into memory. */
const MAX_PAGE = 500;
const DEFAULT_PAGE = 100;

function requireDoctype(label: string): Doctype {
	const doctype = doctypeFor(label);
	if (!doctype) {
		throw ApiError.unknownField(
			"UnknownDoctype",
			`This site does not carry a doctype called "${label}". `
			+ "417 rather than 404 on purpose: a caller probing what is here reads "
			+ "an absent doctype and an absent field the same way.",
		);
	}
	return doctype;
}

function pageSize(raw: unknown): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE;
	return Math.min(Math.floor(n), MAX_PAGE);
}

function pageStart(raw: unknown): number {
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Nothing is written unless the process was started for it. The default run is
    read-only, so a dashboard opened to look at something cannot change it. */
function requireWriteEnabled(): void {
	if (env.write) return;
	throw ApiError.forbidden(
		"ReadOnly",
		"This server was started read-only. Set ERP_WRITE=1 in the environment and restart "
		+ "it to allow the allowlisted writes. Nothing was changed.",
	);
}

/* ------------------------------------------------------------------ GET list */

resourceRouter.get(
	"/:doctype",
	asyncRoute(async (req, res) => {
		const doctype = requireDoctype(String(req.params.doctype));
		const { model, label } = doctype;

		const fields = parseFields(req.query.fields);
		const projection = projectionFor(label, model, fields);
		const filter = filtersFor(label, model, req.query.filters);
		const sort = sortFor(label, model, req.query.order_by, doctype.defaultSort);

		/* `name` as a tiebreaker, always. The client reads a list by paging — skip
		   100, skip 200 — and a skip against a sort with ties is not stable: two
		   people with the same name can land on both pages or on neither, which
		   shows up as a headcount that is quietly one out rather than as an error. */
		const rows = await model
			.find(filter, projection ?? undefined)
			.sort({ ...sort, name: 1 })
			.skip(pageStart(req.query.limit_start))
			.limit(pageSize(req.query.limit_page_length))
			.lean()
			.exec();

		res.json({ data: rows.map((r) => stripInternal(r as Record<string, unknown>)) });
	}),
);

/* -------------------------------------------------------------- GET document */

resourceRouter.get(
	"/:doctype/:name",
	asyncRoute(async (req, res) => {
		const doctype = requireDoctype(String(req.params.doctype));

		/* Whole document, no projection. This is the read Employee Detail and the
		   holiday lists make, and the whole point of it is the child tables and the
		   fields the list read leaves out — a blank here means blank on the record
		   rather than merely unfetched, which is what makes the screen worth
		   having. */
		const doc = await doctype.model.findOne({ name: String(req.params.name) }).lean().exec();

		if (!doc) {
			throw ApiError.notFound(
				"NotFound",
				`${doctype.label} "${String(req.params.name)}" is not on this site.`,
			);
		}

		res.json({ data: stripInternal(doc as Record<string, unknown>) });
	}),
);

/* ------------------------------------------------------------------- POST it */

resourceRouter.post(
	"/:doctype",
	asyncRoute(async (req, res) => {
		const doctype = requireDoctype(String(req.params.doctype));
		requireWriteEnabled();

		if (!doctype.creatable) {
			throw ApiError.forbidden(
				"NotCreatable",
				`${doctype.label} cannot be created through this API. `
				+ "The creatable list is in server/src/doctypes/registry.ts and it is short on purpose.",
			);
		}

		const body = (req.body ?? {}) as Record<string, unknown>;

		/* Draft only, and refused rather than corrected. Quietly rewriting a
		   submitted document to a draft would let a caller believe it had
		   submitted one. */
		const docstatus = body.docstatus;
		if (docstatus !== undefined && Number(docstatus) !== 0) {
			throw ApiError.forbidden(
				"DraftOnly",
				`This API only ever creates drafts, and this ${doctype.label} asked for `
				+ `docstatus ${String(docstatus)}. Submitting is the act that decides what somebody `
				+ "is paid; it belongs where the approval and the audit trail on it live. Nothing was written.",
			);
		}

		/* An unknown field is a refusal here too, and for a reason the list read's
		   version does not have: Mongoose would drop it silently under a strict
		   schema, and a wizard that reports "saved" over a field that went nowhere
		   is worse than one that reports a refusal. */
		const known = schemaPaths(doctype.model);
		const strays = Object.keys(body).filter((k) => k !== "doctype" && !known.has(k));
		if (strays.length) {
			throw ApiError.unknownField(
				"UnknownField",
				`${doctype.label} has no field ${strays.map((f) => `"${f}"`).join(", ")}. `
				+ "Nothing was written — a field that saves as nothing is worse than a refusal.",
			);
		}

		const name = await nameFor(doctype, body);
		const created = await doctype.model.create({ ...body, name, docstatus: 0 });

		/* `{data: doc}`, because `apiCreate` reads `r.data?.data ?? r.data` and the
		   first arm is the one that carries the name the caller now needs. */
		res.status(201).json({ data: stripInternal(created.toObject() as Record<string, unknown>) });
	}),
);

/** The document's id. Prompt-named doctypes bring their own; series-named ones
    get the next number, which is handed out atomically — see `nextName`. */
async function nameFor(doctype: Doctype, body: Record<string, unknown>): Promise<string> {
	if (doctype.naming.kind === "series") {
		return nextName(doctype.naming.prefix, doctype.naming.width);
	}

	const supplied = body.name ?? (doctype.naming.from ? body[doctype.naming.from] : undefined);
	const name = String(supplied ?? "").trim();
	if (!name) {
		throw ApiError.invalid(
			"NoName",
			`${doctype.label} is named by whoever creates it, and this request supplied no `
			+ (doctype.naming.from ? `"${doctype.naming.from}".` : '"name".'),
		);
	}

	/* A document name goes into a URL. A slash in it breaks the link to the very
	   document somebody is being sent to read — which is why the client strips
	   them before asking; this is the half of that rule that is enforceable. */
	if (/[/\\?#]/.test(name)) {
		throw ApiError.invalid(
			"BadName",
			`"${name}" cannot be a document name: a name goes into a URL, and / \\ ? or # in one `
			+ "breaks the link to the document it addresses.",
		);
	}
	return name;
}

/* -------------------------------------------------------------------- PUT it */

resourceRouter.put(
	"/:doctype/:name",
	asyncRoute(async (req, res) => {
		const doctype = requireDoctype(String(req.params.doctype));
		requireWriteEnabled();

		const allowed = doctype.writable;
		if (!allowed) {
			throw ApiError.forbidden(
				"ReadOnlyDoctype",
				`${doctype.label} cannot be changed through this API. `
				+ "Records are corrected on the system of record, where the validation and the "
				+ "audit trail are.",
			);
		}

		const patch = (req.body ?? {}) as Record<string, unknown>;
		const keys = Object.keys(patch);
		if (keys.length === 0) {
			throw ApiError.invalid("EmptyPatch", "Nothing to change: the request body was empty.");
		}

		/* An allowlist, not a denylist. A field added to the schema tomorrow is
		   unwritable until somebody names it in registry.ts, which is the way round
		   that fails safe. */
		const refused = keys.filter((k) => !allowed.includes(k));
		if (refused.length) {
			throw ApiError.forbidden(
				"FieldNotWritable",
				`On ${doctype.label} this API may only set ${allowed.join(", ")}. `
				+ `It was asked to set ${refused.join(", ")}. Nothing was changed.`,
			);
		}

		const doc = await doctype.model.findOne({ name: String(req.params.name) }).exec();
		if (!doc) {
			throw ApiError.notFound(
				"NotFound",
				`${doctype.label} "${String(req.params.name)}" is not on this site.`,
			);
		}

		/* A submitted document is history. Amending one changes the basis of a
		   decision somebody may already have acted on, and that wants a human and
		   an approval rather than a button on a dashboard. */
		if (doc.get("docstatus") === 1) {
			throw ApiError.forbidden(
				"Submitted",
				`${doctype.label} "${String(req.params.name)}" is submitted. A submitted document is `
				+ "history — amending it is a decision for the system of record, not for this API.",
			);
		}

		for (const key of keys) doc.set(key, patch[key]);
		doc.set("modified_by", "Dashboard");
		await doc.save();

		res.json({ data: stripInternal(doc.toObject() as Record<string, unknown>) });
	}),
);

/* ----------------------------------------------------------------- DELETE it */

resourceRouter.delete(
	"/:doctype/:name",
	asyncRoute(async (req, res) => {
		const doctype = requireDoctype(String(req.params.doctype));
		requireWriteEnabled();

		/* Absent means no, which is the answer for all but one doctype here. A
		   delete is the one write with nothing to compare against afterwards — a
		   wrong PUT can be put back from the value somebody remembers, and a wrong
		   DELETE cannot. */
		const guards = doctype.deletable;
		if (!guards) {
			throw ApiError.forbidden(
				"NotDeletable",
				`${doctype.label} cannot be deleted through this API. The deletable list is in `
				+ "server/src/doctypes/registry.ts and it is one doctype long on purpose.",
			);
		}

		const name = String(req.params.name);
		const doc = await doctype.model.findOne({ name }).lean().exec();
		if (!doc) {
			throw ApiError.notFound("NotFound", `${doctype.label} "${name}" is not on this site.`);
		}

		/* The same rule the PUT route enforces, for the same reason and said the
		   same way. A submitted document is history: deleting one does not merely
		   change the basis of a decision somebody acted on, it removes it. On the
		   system of record the way past this is to cancel first, which is an act
		   with an approval behind it and is not a button on a dashboard. */
		/* `lean()` on a loosely-typed model widens to "document or array of them",
		   so the field is reached through a cast rather than off the union. */
		if ((doc as Record<string, unknown>).docstatus === 1) {
			throw ApiError.forbidden(
				"Submitted",
				`${doctype.label} "${name}" is submitted. A submitted document is history — deleting one `
				+ "is a decision for the system of record, where it is cancelled first. Nothing was deleted.",
			);
		}

		/* Link validation, done here because nothing else will do it: a master is
		   pointed at by string, so deleting one that is in use leaves the records
		   in it pointing at nothing and no database constraint notices.

		   Counted rather than merely detected. "In use" is not an answer somebody
		   can act on; "17 assets are in this category" is. */
		for (const guard of guards) {
			const used = await guard.model.countDocuments({ [guard.field]: name });
			if (used > 0) {
				/* Worded without telling the caller what to do about it. The first
				   cut said "move them to another asset category first", which is
				   advice that only makes sense for a master — an Asset Movement
				   cannot be moved to another asset, it is a record of one that
				   happened. What is true of every guard is that something points
				   here, and that is what the refusal says. */
				throw ApiError.invalid(
					"InUse",
					`${used} ${guard.label}${used > 1 ? " records" : " record"} still `
					+ `${used > 1 ? "point" : "points"} at ${doctype.label} "${name}". Nothing was deleted — `
					+ `${used > 1 ? "those records have" : "that record has"} to be dealt with first, or `
					+ `${used > 1 ? "they" : "it"} would be left referencing something that is not there.`,
				);
			}
		}

		await doctype.model.deleteOne({ name });
		res.json({ data: { name } });
	}),
);
