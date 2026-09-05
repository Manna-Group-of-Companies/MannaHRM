/** The report on paper.

    No PDF library is shipped to this browser and none is going to be, for a
    table. Every format the export menu offers is this one HTML document handed
    to something the platform already has: Print and PDF are the same print
    dialog with a different destination chosen in it, Word opens an HTML file
    served as a Word document — which is exactly what its own Save as Web Page
    writes — and Preview is the document rendered where it can be read before
    any of that.

    So there is one builder and one place a column can go wrong, rather than
    four renderers that agree until somebody edits one of them. */

export const esc = (v) =>
	String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Deliberately plain CSS. Word understands about as much of a stylesheet as a
   browser did twenty years ago, and a rule it cannot read is a rule the Word
   export silently loses — so nothing here is a variable, a grid or a shadow.

   The `mso-` block is the one Word-only thing kept: without it a landscape
   table opens on portrait A4 and the last two columns fall off the page. */
const PAPER = `
	@page WordSection1 { size: 297mm 210mm; mso-page-orientation: landscape; margin: 12mm; }
	div.WordSection1 { page: WordSection1; }
	@page { size: A4 landscape; margin: 12mm; }
	body { font: 11px "Segoe UI", Arial, sans-serif; color: #141d2b; margin: 0; }
	.head { border-bottom: 2px solid #141d2b; padding-bottom: 8px; margin-bottom: 10px; }
	.mark { font-size: 15px; font-weight: bold; letter-spacing: .18em; }
	h1 { font-size: 13px; margin: 6px 0 2px; letter-spacing: .04em; }
	.sub, .crit { font-size: 10px; color: #465468; margin: 2px 0 0; }
	table { border-collapse: collapse; width: 100%; font-size: 10px; }
	th, td { border: 1px solid #c7d2e2; padding: 3px 6px; text-align: left; vertical-align: top; }
	th { background: #eef2f8; font-weight: bold; }
	tr.grp td { background: #f8fafd; font-weight: bold; }
	tr.sec td { background: #e0e7f1; font-weight: bold; letter-spacing: .04em; }
	td.mono { font-family: Consolas, "Courier New", monospace; }
	td.muted { color: #465468; }
	tfoot td { border: 0; padding-top: 8px; font-size: 9px; color: #465468; }
	@media print { tr { page-break-inside: avoid; } thead { display: table-header-group; } }
`;

/* A payslip is a page per person and it is portrait — a report is landscape
   because it is a wide table. One document builder, two page sizes, rather than
   a second builder that would drift from this one. */
const PORTRAIT = `
	@page WordSection1 { size: 210mm 297mm; mso-page-orientation: portrait; margin: 14mm; }
	div.WordSection1 { page: WordSection1; }
	@page { size: A4 portrait; margin: 14mm; }
	.slip { page-break-after: always; }
	.slip:last-child { page-break-after: auto; }
	.slip .head { margin-top: 4px; }
	table.facts { width: auto; margin-bottom: 10px; }
	table.facts th { width: 34mm; }
	td.amt, th.amt { text-align: right; width: 26mm; }
	tfoot tr.grp td { border: 1px solid #c7d2e2; background: #eef2f8; font-weight: bold; }
`;

/** A standalone document — no stylesheet, script or image fetched from
    anywhere, because a printed page that needs the network is a page that
    prints blank on the day the network is the thing being investigated. */
export function paper(title, body, portrait) {
	/* The portrait block is appended rather than swapped in: it re-declares the
	   two @page rules and adds what a slip needs, so a rule the report relies on
	   cannot be lost by picking the wrong page size. */
	const css = PAPER + (portrait ? PORTRAIT : "");
	return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>`
		+ `<style>${css}</style></head><body><div class="WordSection1">${body}</div></body></html>`;
}

/** Print it from a hidden iframe rather than a new window: a popup blocker
    stops `window.open` on a click the browser has stopped believing in, and a
    report that silently fails to print is worse than one that cannot. */
export function printPaper(html) {
	const frame = document.createElement("iframe");
	frame.setAttribute("aria-hidden", "true");
	frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
	frame.srcdoc = html;
	frame.onload = () => {
		frame.contentWindow.focus();
		frame.contentWindow.print();
		/* Removed on a timer, not on afterprint: Safari never fires that event,
		   and an iframe torn down while the dialog is still open cancels the
		   job the person was in the middle of confirming. */
		setTimeout(() => frame.remove(), 60000);
	};
	document.body.appendChild(frame);
}
