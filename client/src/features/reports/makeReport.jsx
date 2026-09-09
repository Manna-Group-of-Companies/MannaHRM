import Report from "@/features/reports/Report";

/* One page component per report, from one spec.

   **Named `makeReport`, not `report`.** It was the second for about ten
   minutes, next to `Report.jsx`, and two files differing only in case are one
   file on Windows and on macOS — where this repo is checked out. It builds
   here, on Linux, and breaks on the machine it is written on, which is the
   worst order for that to happen in. The registry wants a component
   per address; `data/reports.js` has the fifteen specs, and this is the two
   lines between them.

   A named function with a `displayName` rather than an arrow, so a stack trace
   from inside a report says which report. */
export default function report(section, id) {
	function ReportPage() {
		return <Report section={section} id={id} />;
	}
	ReportPage.displayName = `Report(${section}/${id})`;
	return ReportPage;
}
