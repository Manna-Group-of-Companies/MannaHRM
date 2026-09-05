import type { NextFunction, Request, RequestHandler, Response } from "express";

/* Express 4 does not catch a rejected promise from a handler — it hangs the
   request instead, which is the worst of the three possible outcomes: no
   answer, no log, and a socket held until the client's own timeout. Wrapping
   every async handler in this is the whole fix.

   Express 5 does this itself. This file is the one thing to delete on that
   upgrade. */
export function asyncRoute(
	fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
	return (req, res, next) => {
		void fn(req, res, next).catch(next);
	};
}
