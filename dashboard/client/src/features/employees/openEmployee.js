import { go } from "@/routes/router";

/* ---------------------------------------------------------------------------
   One function, in a module of its own.

   It lived on Employee Master, and three screens outside that page imported it
   — the People list, Employee Detail's generated rows, and Final Settlement's
   queue. When Employee Master was deleted on 4 September 2026 they would have
   gone with it, so it came out here first.

   A module rather than a home on `EmployeeProfile.jsx`, which is the page it
   opens: three screens that only want *this* would then pull the whole profile
   — its thirteen panes, its document reads, its field map — into their own
   chunk to get one call to `go`.
   --------------------------------------------------------------------------- */

/** Open one person's whole record.

    It lands on Employee Profile rather than Employee Detail: the → on the old
    cards always read as "open this person", and Employee Detail turned out to
    be a report builder rather than a record page. See FACTOHR_SCREENS §15, §23. */
export const openEmployee = (name) =>
	go({ empSel: name, section: "employees", subtab: "profile" });
