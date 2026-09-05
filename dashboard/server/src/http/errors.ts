import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ApiError } from "./ApiError.js";

/* ---------------------------------------------------------------------------
   Every failure leaves here in one shape: `{error, hint}`.

   That shape is the client's, not this server's preference — `reason()` in
   client/src/api/client.js reads `hint` first and `error` second, and anything
   else arrives in the top bar as a raw object next to somebody's name.

   Mongoose's own errors are translated rather than passed through. A validation
   failure names the path that failed, which is worth keeping; a cast failure
   and a duplicate key are both requests that cannot be satisfied and are said
   so in words somebody can act on.
   --------------------------------------------------------------------------- */

interface Body {
	error: string;
	hint: string;
}

function translate(err: unknown): { status: number; body: Body } {
	if (err instanceof ApiError) {
		return { status: err.status, body: { error: err.message, hint: err.hint } };
	}

	if (err instanceof mongoose.Error.ValidationError) {
		const parts = Object.values(err.errors).map((e) => e.message);
		return {
			status: 422,
			body: {
				error: "ValidationError",
				hint: parts.join(" ") || "The document was refused by its own validation.",
			},
		};
	}

	if (err instanceof mongoose.Error.CastError) {
		return {
			status: 417,
			body: {
				error: "CastError",
				hint: `"${String(err.value)}" is not a value ${err.path} can hold.`,
			},
		};
	}

	/* A duplicate key is almost always `name`, and on this API `name` is the
	   document id — so the useful sentence is which id, not which index. */
	if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
		const keys = Object.keys((err as { keyValue?: Record<string, unknown> }).keyValue ?? {});
		return {
			status: 422,
			body: {
				error: "DuplicateEntry",
				hint: keys.length
					? `A document with that ${keys.join(" and ")} already exists.`
					: "A document with those values already exists.",
			},
		};
	}

	if (err instanceof mongoose.Error.MongooseServerSelectionError) {
		return {
			status: 503,
			body: {
				error: "NoDatabase",
				hint: "The API is up but cannot reach MongoDB. Check MONGODB_URI and that mongod is running.",
			},
		};
	}

	const message = err instanceof Error ? err.message : String(err);
	return { status: 500, body: { error: "ServerError", hint: message } };
}

/** Anything that reached the API and is not a route. */
export function notFound(_req: Request, res: Response): void {
	res.status(404).json({
		error: "NotFound",
		hint: "No such endpoint. This API serves /api/site and /api/resource/<Doctype>.",
	});
}

export function errorHandler(
	err: unknown,
	_req: Request,
	res: Response,
	next: NextFunction,
): void {
	if (res.headersSent) return next(err);
	const { status, body } = translate(err);
	/* Server faults are logged whole; a refusal is not a fault and logging every
	   403 buries the one 500 that matters. */
	if (status >= 500) console.error(err);
	res.status(status).json(body);
}
