import { model, type Model } from "mongoose";
import { docSchema, type DocBase } from "./base.js";

/* ---------------------------------------------------------------------------
   The scan behind a document — Frappe's `File`, and the answer to the one
   column On Board's Document register had been drawing dead.

   Factor HR's register has a paperclip on every row and it is the thing that
   makes theirs a filing cabinet rather than a list of numbers. Nothing on this
   side held one, and the comment in DocumentEntry.jsx said why: a document here
   is a *field* on `Employee`, and Frappe hangs an attachment off a *document*.

   This is the half of that which is fixable. `File` does not hang off a
   document, it hangs off a document **and a field** — `attached_to_field` is
   ERPNext's own column and it exists for exactly this case. So a passport scan
   attaches to `Employee / HR-EMP-00007 / passport_number`, and the synthesised
   row on the register finds it by the same pair it was synthesised from.

   What this still does not fix, and the register keeps saying: one person can
   hold one passport number here, so they can hold one passport scan. Two of
   them needs a Document doctype, not a second file.

   The bytes live on disk under `FILES_DIR` and are served by
   routes/files.ts — this collection holds where they are, not what they are.
   `file_url` is a path on this origin (`/files/...`), never an absolute URL:
   the page and the API are one origin on purpose, and a file that arrived from
   somewhere else would be the one thing on the page that is not.
   --------------------------------------------------------------------------- */

export interface FileDoc extends DocBase {
	file_name?: string;
	file_url?: string;
	file_type?: string;
	file_size?: number;
	is_private?: number;
	attached_to_doctype?: string;
	attached_to_name?: string;
	attached_to_field?: string;
	folder?: string;
}

export const FileModel: Model<FileDoc> = model<FileDoc>(
	"File",
	docSchema<FileDoc>({
		/* What a person called it. Shown on the popover and used as the name the
		   browser saves it under, which is why it is kept apart from `file_url` —
		   the URL is unique and unreadable, the name is neither. */
		file_name: { type: String, required: true },
		/* A path on this origin, `/files/<stored name>`. Not the filename above:
		   two people's passports are both "Passport.jpg" and one would overwrite
		   the other on disk. */
		file_url: { type: String, required: true },
		/* ERPNext keeps the extension, upper-cased, rather than a MIME type. */
		file_type: String,
		file_size: { type: Number, default: 0 },
		/* 0 or 1, as Frappe stores it. Everything seeded here is private — a
		   scan of somebody's passport is not a public asset — and the flag is
		   carried so the day this API grows an upload has somewhere to put the
		   answer rather than inventing one then. */
		is_private: { type: Number, enum: [0, 1], default: 1 },

		/* The three columns that make this an attachment rather than a file.
		   Indexed together in the order the one query this serves asks in:
		   every file on Employee, then grouped per record per field. */
		attached_to_doctype: { type: String, index: true },
		attached_to_name: { type: String, index: true },
		/* **The column the register depends on.** Without it a passport scan and
		   a PAN scan on the same person are two files against one employee with
		   no way to say which row each belongs to. */
		attached_to_field: { type: String, index: true },

		folder: { type: String, default: "Home/Attachments" },
	}),
	"files",
);
