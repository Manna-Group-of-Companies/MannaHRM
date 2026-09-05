import { createAsyncThunk } from "@reduxjs/toolkit";
import { load, loadLeaveFor, loadLeaveBalances } from "@/api/load";

/* ---------------------------------------------------------------------------
   The reads, as thunks.

   These wrap the loaders in `api/load.js` rather than replacing them, and it is
   worth being plain about what that does and does not buy.

   It does not move the writes: each loader still calls `set()` itself, because
   each one writes several unrelated keys at several points — the dashboard load
   paints the connection line before the first request and the employee list
   after the last, and a single `fulfilled` payload would collapse that into one
   frame that arrives late. That is not a shape worth having for the sake of
   looking more like a tutorial.

   What it buys is the part that was missing: every read now shows up on the
   devtools timeline as `app/loadAll/pending` → `fulfilled` or `rejected`, with
   the reason attached, so a load that failed is a line in a list rather than
   something to reproduce. `loadAll` in particular swallows its own errors into
   the status line by design — see `connMessage` — and until now that meant a
   failed load left no trace anywhere a person could look at afterwards.
   --------------------------------------------------------------------------- */

/** The one read on open: employees, masters, today's punches, both queues. */
export const loadAll = createAsyncThunk("app/loadAll", () => load());

/** One person's whole leave history, and their Attendance for a month. */
export const loadLeave = createAsyncThunk(
	"app/loadLeave",
	({ employee, month }) => loadLeaveFor(employee, month),
);

/** Every approved leave application — the availed half of the balance report. */
export const loadBalances = createAsyncThunk("app/loadBalances", () => loadLeaveBalances());
