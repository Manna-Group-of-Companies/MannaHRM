import { Router, json } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "../env.js";
import { ApiError } from "../http/ApiError.js";
import { asyncRoute } from "../http/asyncRoute.js";
import { FileModel } from "../doctypes/file.js";
import { doctypeFor } from "../doctypes/registry.js";
import { schemaPaths, stripInternal } from "../query/fields.js";

/* ---------------------------------------------------------------------------
   /api/files — putting a scan against a document, and taking one off again.

     POST   /api/files          one file, base64, with what it attaches to
     DELETE /api/files/:name    the row and the bytes behind it

   **Under /api, unlike the route that serves the bytes.** That split is the
   point: reading a file is the browser following a URL, so `/files/...` answers
   with the file itself; writing one is a write, so it goes where every other
   write on this server goes — behind `ERP_WRITE`, with its own validation, in
   the JSON shape the client already reads refusals out of.

   **Base64 in JSON rather than multipart.** A multipart parser is a dependency
   and a temp-file lifecycle: something has to decide what happens to the half
   of a file that arrived before the socket closed. Base64 costs a third more on
   the wire and is a string this process either has whole or does not have at
   all, which for a passport scan on a local dashboard is the better trade. The
   cap below is on the decoded bytes, so it means what it says.
   --------------------------------------------------------------------------- */

export const attachmentsRouter = Router();

/** Five megabytes, decoded. A phone photograph of a passport page is between
    one and three; anything above this is a scanner set to something nobody
    needed, and refusing it is kinder than holding it in memory. */
const MAX_BYTES = 5 * 1024 * 1024;

/** The body limit, in the encoded units the parser counts. Base64 is 4 bytes
    per 3, plus the JSON around it — a little headroom so a file just under the
    real cap is refused by the cap and not by the parser, which would answer
    "request entity too large" instead of the sentence below. */
const BODY_LIMIT = Math.ceil((MAX_BYTES * 4) / 3) + 64 * 1024;

/** What may be uploaded, and what it is served as.

    An allowlist by extension, and the content type is taken from *this table*
    rather than from whatever the browser claimed — a caller who says a `.exe`
    is `image/png` should not get to decide how it comes back out.

    SVG is on the list because the seeded placeholders are SVG, and a register
    that shows a file type nobody can replace is a strange thing to ship. It is
    also the one entry that can carry script, which is what the
    `Content-Security-Policy: sandbox` on the serving route is for. */
const TYPES: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
	".pdf": "application/pdf",
	".svg": "image/svg+xml",
	/* Added for On Board's Push Letter Into Document, which files an issued
	   letter against the person it was issued to. The letter's stored text is
	   HTML — that is how it was merged and how the register renders it — so
	   turning it into a PDF here would mean a renderer this app does not carry,
	   and turning it into text would throw away the document. Safe on the same
	   terms as `.svg`: served under `Content-Security-Policy: sandbox`, where
	   script cannot run and nothing in the file can reach the page. */
	".html": "text/html",
};

/** The extension, lower-cased, off the name a person gave the file. */
function extensionOf(fileName: string): string {
	const ext = path.extname(fileName).toLowerCase();
	if (!TYPES[ext]) {
		throw ApiError.invalid(
			"BadType",
			`"${fileName}" is not a kind of file this accepts. A document scan is one of `
			+ `${Object.keys(TYPES).join(", ")}. Nothing was written.`,
		);
	}
	return ext;
}

/** The bytes, from `data`. A `data:` URL is accepted whole because that is what
    a browser hands back from a FileReader, and stripping the prefix in the
    client would be one more place for the two halves to disagree. */
function bytesOf(raw: unknown): Buffer {
	if (typeof raw !== "string" || !raw) {
		throw ApiError.invalid("NoData", "No file content was sent: `data` must be base64.");
	}
	const base64 = raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;

	const buf = Buffer.from(base64, "base64");
	if (!buf.length) {
		throw ApiError.invalid("NoData", "The file content decoded to nothing. Nothing was written.");
	}
	if (buf.length > MAX_BYTES) {
		throw ApiError.invalid(
			"TooLarge",
			`That file is ${(buf.length / 1024 / 1024).toFixed(1)} MB and the limit is `
			+ `${MAX_BYTES / 1024 / 1024} MB. Nothing was written.`,
		);
	}

	/* Node's base64 decoder skips anything it does not recognise rather than
	   failing, so a truncated or mangled upload decodes to *something*. Round
	   tripping it is the cheap way to notice: a file that does not re-encode to
	   what arrived is not the file that was sent. */
	if (buf.toString("base64").replace(/=+$/, "") !== base64.replace(/[\s=]+/g, "")) {
		throw ApiError.invalid(
			"BadData",
			"The file content is not valid base64, or did not arrive whole. Nothing was written — "
			+ "a scan saved as a corrupted file would be worse than one that failed to save.",
		);
	}
	return buf;
}

/** Nothing is written unless the process was started for it. The same switch
    the resource routes check, said again here rather than imported from there,
    because a second write path that forgot to ask is exactly how a read-only
    run stops being one. */
function requireWriteEnabled(): void {
	if (env.write) return;
	throw ApiError.forbidden(
		"ReadOnly",
		"This server was started read-only. Set ERP_WRITE=1 in the environment and restart it "
		+ "to allow attachments to be added or removed. Nothing was changed.",
	);
}

interface Target {
	doctype: string;
	name: string;
	field: string;
}

/** That the thing being attached to exists, and that the field named is a real
    field on it.

    Both checked, because an attachment whose `attached_to_name` is a typo is
    invisible: it is filed, it takes up disk, and no screen ever asks for that
    key again. A refusal is legible; an orphan is not. */
async function requireTarget(body: Record<string, unknown>): Promise<Target> {
	const label = String(body.attached_to_doctype ?? "");
	const name = String(body.attached_to_name ?? "");
	const field = String(body.attached_to_field ?? "");

	const target = doctypeFor(label);
	if (!target) {
		throw ApiError.unknownField(
			"UnknownDoctype",
			`This site does not carry a doctype called "${label}", so nothing can be attached to one.`,
		);
	}
	/* **Optional, which is Frappe's own shape and was over-constrained here.**
	   `File` carries `attached_to_field` for the case where an attachment
	   belongs to one field of a record — a passport scan against
	   `passport_number` — and most attachments are not that: they hang off the
	   document. Requiring it made the Document register's model the only one
	   this route could serve, and Push Letter Into Document files a letter
	   against a *person*, not against a field of one.

	   Still checked when it is given. A field named and wrong is a typo; a field
	   left out is a different claim. */
	if (field && !schemaPaths(target.model).has(field)) {
		throw ApiError.unknownField(
			"UnknownField",
			`${label} has no field "${field}". An attachment is filed against a record *and* a field — `
			+ "one filed against a field that does not exist is one no screen will ever ask for again.",
		);
	}
	const exists = await target.model.exists({ name });
	if (!exists) {
		throw ApiError.notFound(
			"NoRecord",
			`${label} "${name}" is not on this site. Nothing was written.`,
		);
	}
	return { doctype: label, name, field };
}

/* ------------------------------------------------------------------ POST it */

attachmentsRouter.post(
	"/files",
	/* This one route parses a bigger body than the rest of the API, and only
	   this one: raising the global limit would let every other endpoint accept
	   five megabytes of JSON it has no use for. */
	json({ limit: BODY_LIMIT }),
	asyncRoute(async (req, res) => {
		requireWriteEnabled();

		const body = (req.body ?? {}) as Record<string, unknown>;
		const target = await requireTarget(body);

		/* The name a person will see, and it is theirs — the browser's, off the
		   file they picked. Slashes and quotes out, because it goes into a header
		   and into a download name; length capped, because it goes into a
		   column. */
		const shown = String(body.file_name ?? "").replace(/[/\\\r\n"]/g, "").trim().slice(0, 180);
		if (!shown) {
			throw ApiError.invalid("NoName", "The file arrived without a name. Nothing was written.");
		}

		const ext = extensionOf(shown);
		const bytes = bytesOf(body.data);

		await fs.promises.mkdir(env.filesDir, { recursive: true });

		/* The name on disk is this server's, not the caller's, and that is the
		   whole of the path-safety story on this route: nothing a caller sent
		   reaches the filesystem. Record, field, and eight random hex — so two
		   people's passports do not collide, two scans of the *same* passport do
		   not either, and the seed's own cleanup pattern cannot match an uploaded
		   file and delete somebody's upload on the next reseed. */
		const id = crypto.randomBytes(8).toString("hex");
		const stored = `${target.name}.${target.field || "doc"}.${id}${ext}`;

		await fs.promises.writeFile(path.join(env.filesDir, stored), bytes);

		/* Created through the model rather than through the generic POST, which
		   refuses `File` outright: that route takes JSON documents and this one
		   takes bytes, and keeping `creatable: false` in the registry means
		   nobody can forge a File row pointing at a path this route did not
		   write. */
		const created = await FileModel.create({
			name: `FILE-${id}`,
			file_name: shown,
			file_url: `/files/${encodeURIComponent(stored)}`,
			file_type: ext.slice(1).toUpperCase(),
			file_size: bytes.length,
			is_private: 1,
			attached_to_doctype: target.doctype,
			attached_to_name: target.name,
			attached_to_field: target.field,
		});

		/* Through `unknown`, because a Mongoose document's object form is a
		   concrete interface rather than an index signature and TypeScript will
		   not widen one to the other directly. `stripInternal` only ever reads
		   keys off it. */
		const saved = created.toObject() as unknown as Record<string, unknown>;
		res.status(201).json({ data: stripInternal(saved) });
	}),
);

/* ---------------------------------------------------------------- DELETE it */

attachmentsRouter.delete(
	"/files/:name",
	asyncRoute(async (req, res) => {
		requireWriteEnabled();

		const name = String(req.params.name);
		const doc = await FileModel.findOne({ name }).lean().exec();
		if (!doc) {
			throw ApiError.notFound("NotFound", `There is no File "${name}" on this site.`);
		}

		/* The row goes first. If the unlink below fails, the bytes are orphaned
		   on disk — a tidiness problem nobody sees. The other order risks a row
		   pointing at bytes that are gone, which is the state the serving route
		   has to apologise for on a screen. Of the two failures, prefer the
		   invisible one. */
		await FileModel.deleteOne({ name });

		/* Only inside `FILES_DIR`, and only the basename. `file_url` is written
		   by the route above and has never been caller-controlled, but a delete
		   that trusts a stored path is one schema change away from deleting
		   something else. */
		const stored = path.basename(decodeURIComponent(String(doc.file_url ?? "")));
		if (stored) {
			const abs = path.resolve(env.filesDir, stored);
			if (abs.startsWith(env.filesDir + path.sep)) {
				await fs.promises.unlink(abs).catch(() => {});
			}
		}

		res.json({ data: { name } });
	}),
);
