/* ---------------------------------------------------------------------------
   The refusals, and what each status means on the wire.

   The client reads a failure as `{error, hint}` and branches on the status —
   see `connMessage` in client/src/api/load.js, which turns each of these into
   four words in the top bar. So the codes below are a contract, not a
   preference:

     403  the server refused. Read-only run, or a doctype not on an allowlist.
     404  no such document.
     417  no such field, or no such doctype. **The client depends on this one.**
          It asks for the rich employee field list and falls back to the short
          one when it fails, so a field this schema does not carry must fail the
          whole read rather than come back as a blank column — a column that is
          quietly empty is indistinguishable from a field nobody has filled in.
     422  the document was refused by its own validation.
     429  too many requests.
     503  the server is up but cannot serve — no database, usually.
   --------------------------------------------------------------------------- */

export class ApiError extends Error {
	readonly status: number;
	readonly hint: string;

	constructor(status: number, message: string, hint?: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		/* The hint is the readable half and the client prefers it over `error`.
		   Defaulting it to the message means every refusal reads as something,
		   rather than as the word "Error" on screens that only show the hint. */
		this.hint = hint ?? message;
	}

	static forbidden(message: string, hint?: string): ApiError {
		return new ApiError(403, message, hint);
	}

	static notFound(message: string, hint?: string): ApiError {
		return new ApiError(404, message, hint);
	}

	/** No such field, or no such doctype — the shape the client probes with. */
	static unknownField(message: string, hint?: string): ApiError {
		return new ApiError(417, message, hint);
	}

	static invalid(message: string, hint?: string): ApiError {
		return new ApiError(422, message, hint);
	}

	static unavailable(message: string, hint?: string): ApiError {
		return new ApiError(503, message, hint);
	}
}
