/* ---------------------------------------------------------------------------
   A resume file → its text, for `lib/resumescore.js`.

   LinkedIn and Indeed hand over what the applicant uploaded, which is a PDF
   or a Word file nearly every time; LinkedIn's own "Save to PDF" profile is a
   PDF. So those two, and plain text. An old `.doc` and a scanned image come
   back with no text and a reason, and the page adds them unscored rather than
   scoring them zero.

   **These files come from strangers.** pdf.js is told not to compile fonts
   into code (`isEvalSupported: false` — CVE-2024-4367 was exactly that) and
   never to load a font face or run a script, and only the first pages are
   read: a resume is not forty pages, and a file that claims to be is not one.
   Both libraries are imported when a file is opened, so nobody who never
   opens Recruitment downloads them.
   --------------------------------------------------------------------------- */

/** Pages read from a PDF. */
const MAX_PAGES = 8;

/** Bytes read from any file — a resume with photographs in it is a few MB. */
export const MAX_BYTES = 15 * 1024 * 1024;

/** The kind of file, by its name — what the browser says a file's type is
    depends on the machine it was saved on. */
export function kindOf(name) {
	const ext = String(name || "").toLowerCase().split(".").pop();
	if (ext === "pdf") return "pdf";
	if (ext === "docx") return "docx";
	if (ext === "txt") return "txt";
	if (ext === "doc") return "doc";
	return "";
}

export const ACCEPT = ".pdf,.docx,.doc,.txt";

let pdfLib = null;

/** pdf.js and its worker, once.

    The worker is bundled by Vite as an ordinary `.js` worker rather than
    pointed at pdf.js's own `.mjs` file: a server that sends `.mjs` as
    anything but JavaScript has the browser refuse it, and the site and the
    Cloudflare Worker are two servers to get that right on. */
async function loadPdf() {
	if (!pdfLib) {
		const [lib, worker] = await Promise.all([
			import("pdfjs-dist"),
			import("pdfjs-dist/build/pdf.worker.min.mjs?worker"),
		]);
		lib.GlobalWorkerOptions.workerPort = new worker.default();
		pdfLib = lib;
	}
	return pdfLib;
}

/** A PDF's text, line by line in reading order. `lib` is pdf.js — given by a
    test, loaded here otherwise. */
export async function pdfText(bytes, lib) {
	const pdf = lib || await loadPdf();
	const doc = await pdf.getDocument({
		data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
		isEvalSupported: false,
		disableFontFace: true,
		enableXfa: false,
		stopAtErrors: false,
		/* Errors only. A resume whose fonts are not embedded is still read; the
		   warning about it is for drawing the glyphs, which nothing here does. */
		verbosity: 0,
	}).promise;
	const lines = [];
	try {
		for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
			const page = await doc.getPage(n);
			const { items } = await page.getTextContent();
			let line = "";
			let lastY = null;
			let lastEnd = null;
			for (const it of items) {
				const x = it.transform?.[4] ?? 0;
				const y = it.transform?.[5] ?? 0;
				/* A drop in the baseline is a new line even when the PDF did not
				   say so — two columns of a resume are two runs of lines. */
				if (lastY != null && Math.abs(y - lastY) > 2 && line.trim()) {
					lines.push(line.trim());
					line = "";
					lastEnd = null;
				}
				if (lastEnd != null && x - lastEnd > 1 && !/\s$/.test(line) && !/^\s/.test(it.str)) line += " ";
				line += it.str;
				lastY = y;
				lastEnd = x + (it.width || 0);
				if (it.hasEOL) {
					if (line.trim()) lines.push(line.trim());
					line = "";
					lastEnd = null;
				}
			}
			if (line.trim()) lines.push(line.trim());
			page.cleanup();
		}
	} finally {
		await doc.destroy();
	}
	return lines.join("\n");
}

const ENTITY = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

const unescapeXml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
	if (e[0] === "#") {
		const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
		return Number.isFinite(code) ? String.fromCodePoint(code) : m;
	}
	return ENTITY[e.toLowerCase()] ?? m;
});

/** The words of one WordprocessingML part, and nothing else in it.

    Only `<w:t>` is text. Everything else — drawing offsets, style ids,
    revision numbers — is numbers that would read as phone numbers and years,
    so the XML is walked for text, tabs, breaks and paragraph ends and the rest
    is dropped rather than stripped of its tags. */
export function wordXmlText(xml) {
	let out = "";
	const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>|<\/w:p>/g;
	for (const m of String(xml || "").matchAll(re)) {
		if (m[1] != null) out += unescapeXml(m[1]);
		else if (m[0].startsWith("<w:tab")) out += "\t";
		else out += "\n";
	}
	return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** A .docx's text: its headers first — that is where a resume often keeps
    the name and phone — then the body. */
export async function docxText(bytes) {
	const { default: JSZip } = await import("jszip");
	const zip = await JSZip.loadAsync(bytes);
	const body = zip.file("word/document.xml");
	if (!body) throw new Error("This is not a Word document.");
	const headers = zip.file(/^word\/header\d*\.xml$/);
	const parts = [];
	for (const h of headers) parts.push(wordXmlText(await h.async("string")));
	parts.push(wordXmlText(await body.async("string")));
	return parts.filter(Boolean).join("\n");
}

/**
 * One file's text.
 *
 * @returns {Promise<{text: string, error: string}>} — never throws: a file
 *   that cannot be read is a row on the page saying why, not a failed batch.
 */
export async function resumeText(file) {
	const kind = kindOf(file?.name);
	if (!kind) return { text: "", error: "Not a PDF, Word or text file." };
	if (kind === "doc") return { text: "", error: "An old Word (.doc) file — save it as PDF or .docx to score it." };
	if (file.size > MAX_BYTES) return { text: "", error: "Larger than 15 MB." };
	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (kind === "txt") return { text: new TextDecoder().decode(bytes), error: "" };
		const text = kind === "pdf" ? await pdfText(bytes) : await docxText(bytes);
		return { text, error: "" };
	} catch (e) {
		return { text: "", error: `Could not be read: ${String(e?.message || e).slice(0, 120)}` };
	}
}
