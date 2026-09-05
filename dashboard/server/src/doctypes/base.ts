import { Schema, model, type Model, type SchemaDefinition } from "mongoose";

/* ---------------------------------------------------------------------------
   What every document carries, and how it gets its name.

   `name` is the document id and it is a *string*, not an ObjectId. That is not
   a stylistic choice: the client addresses documents by it in URLs
   (`/api/resource/Employee/HR-EMP-00007`), stores it as the key of `byName`,
   and prints it on screen as the Record ID column. A surrogate ObjectId beside
   a human-readable id would give every document two names, and the screens
   would disagree about which one to show.

   `creation`, `modified`, `owner`, `modified_by` and `docstatus` are on every
   doctype because the client reads them on several — a queue sorts by
   `creation`, an audit line prints `modified_by`, and Salary Master's whole
   safety story is that `docstatus` is 0. Carrying them everywhere costs five
   columns and means no screen has to ask whether this particular doctype
   happens to have them.
   --------------------------------------------------------------------------- */

/** 0 draft · 1 submitted · 2 cancelled. Only 0 is ever written from here. */
export type DocStatus = 0 | 1 | 2;

export interface DocBase {
	name: string;
	owner: string;
	creation: Date;
	modified: Date;
	modified_by: string;
	docstatus: DocStatus;
}

const BASE_FIELDS: SchemaDefinition = {
	name: { type: String, required: true, unique: true, index: true },
	owner: { type: String, default: "Administrator" },
	creation: { type: Date, default: () => new Date() },
	modified: { type: Date, default: () => new Date() },
	modified_by: { type: String, default: "Administrator" },
	docstatus: { type: Number, enum: [0, 1, 2], default: 0 },
};

/** Build one doctype's schema. Child tables are plain sub-documents with their
    own `_id` off — a child row is addressed by its position in its parent, and
    an id on it would be a second way to name the same thing. */
export function docSchema<T>(fields: SchemaDefinition): Schema<T> {
	const schema = new Schema<T>(
		{ ...BASE_FIELDS, ...fields } as SchemaDefinition<T>,
		{
			versionKey: false,
			/* Empty objects are kept rather than stripped. A child table that saved
			   as absent and a child table that saved as empty read the same to
			   Mongo and differently to a screen counting rows. */
			minimize: false,
			/* `_id` stays — Mongo wants one — but nothing outside this file ever
			   sees it. See `stripInternal` in query/fields.ts. */
		},
	);

	/* Every write moves `modified`, including the allowlisted PUT. Frappe does
	   the same, and the audit line on the approval queues prints it. */
	schema.pre("save", function bumpModified(next) {
		this.set("modified", new Date());
		next();
	});

	return schema;
}

export function childSchema(fields: SchemaDefinition): Schema {
	return new Schema(fields, { _id: false, versionKey: false, minimize: false });
}

/* ---------------------------------------------------------------------------
   Naming series.

   Frappe hands out `HR-EMP-00001` and the next document gets `00002`, and the
   numbers are contiguous because a gap in an employee code is a question
   somebody has to answer. `findOneAndUpdate` with `$inc` and `upsert` is the
   one form of this that is safe under two simultaneous creates: the increment
   and the read are one operation in the server, so two callers cannot both see
   the same number.
   --------------------------------------------------------------------------- */

interface Counter {
	_id: string;
	seq: number;
}

const counterSchema = new Schema<Counter>(
	{ _id: { type: String, required: true }, seq: { type: Number, default: 0 } },
	{ versionKey: false },
);

export const CounterModel: Model<Counter> = model<Counter>("Counter", counterSchema, "counters");

/** The next name in a series, e.g. `nextName("HR-EMP-", 5)` → `HR-EMP-00042`. */
export async function nextName(prefix: string, width = 5): Promise<string> {
	const row = await CounterModel.findOneAndUpdate(
		{ _id: prefix },
		{ $inc: { seq: 1 } },
		{ new: true, upsert: true },
	).lean();
	return prefix + String(row?.seq ?? 1).padStart(width, "0");
}

/** Move a series past names that already exist — used by the seed, so that
    seeding twice does not hand out an id the first run already used. */
export async function bumpSeries(prefix: string, to: number): Promise<void> {
	await CounterModel.updateOne(
		{ _id: prefix },
		{ $max: { seq: to } },
		{ upsert: true },
	);
}
