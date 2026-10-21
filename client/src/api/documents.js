/* ---------------------------------------------------------------------------
   Documents: the site's own file folders (21 October 2026, the HRDashboard
   reference's Documents page — docs/kit-pages.md).

   A folder is a Frappe `File` with `is_folder`, under Home; a file is a `File`
   whose `folder` names it. Sharing is Frappe's own `DocShare`, through
   `frappe.share`, so a folder shared here is shared on the desk too.

   **Home/Attachments is left out.** It holds every file attached to a record —
   a scan on an Employee, a resume on an applicant — and those belong to their
   record, where they are opened and kept; listing two thousand of them here as
   if they were company documents would put a passport scan one click from
   anybody browsing policies.

   **Every upload is private.** A public file in Frappe is served to anyone who
   guesses its address, and a company's contracts and payslips are exactly the
   files somebody would guess at.
   --------------------------------------------------------------------------- */

import { apiCall, apiDelete, apiWrite, http, listAll } from "@/api/client";

export const HOME = "Home";
export const ATTACHMENTS = "Home/Attachments";
const FILE_FIELDS = ["name", "file_name", "folder", "is_folder", "file_size", "file_url", "is_private", "owner", "modified", "creation"];

/** Every folder under Home but Attachments, and the files in them, in two
    reads: the folders, then everything inside any of them. */
export async function readFolders() {
	const folders = (await listAll("File", FILE_FIELDS, [["is_folder", "=", 1], ["folder", "=", HOME]]))
		.filter((f) => f.name !== ATTACHMENTS);
	const inside = folders.length
		? await listAll("File", FILE_FIELDS, [["folder", "in", folders.map((f) => f.name)]], 500)
		: [];
	/* Who each is shared with, for the card's foot — one read for all of them.
	   A login that may not read DocShare still gets its folders. */
	const shares = folders.length
		? await listAll("DocShare", ["share_name", "user", "everyone"],
			[["share_doctype", "=", "File"], ["share_name", "in", folders.map((f) => f.name)]], 500).catch(() => [])
		: [];
	return folders.map((f) => {
		const files = inside.filter((x) => x.folder === f.name && !Number(x.is_folder));
		return {
			...f,
			files: files.length,
			size: files.reduce((t, x) => t + (Number(x.file_size) || 0), 0),
			shared: shares.filter((x) => x.share_name === f.name),
		};
	});
}

/** The files in one folder, newest first. */
export async function readFiles(folder) {
	const rows = await listAll("File", FILE_FIELDS, [["folder", "=", folder], ["is_folder", "=", 0]]);
	return rows.sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
}

/** One folder's record, or null — for a page opened on a folder somebody
    has since deleted. */
export async function readFolder(name) {
	const rows = await listAll("File", FILE_FIELDS, [["name", "=", name], ["is_folder", "=", 1]]);
	return rows[0] || null;
}

export const createFolder = (name) =>
	apiCall("frappe.core.api.file.create_new_folder", { file_name: name, folder: HOME });

/** A folder's or a file's name as people read it. The record keeps its own
    key, so whatever points at it still does. */
export async function renameFile(name, fileName) {
	const r = await apiWrite("File", name, { file_name: fileName });
	if (!r.ok) throw new Error(r.error || "The site would not rename it.");
}

/** Frappe refuses to delete a folder with anything in it, and says so; that
    refusal is the message shown. */
export const deleteFile = (name) => apiDelete("File", name);

/** Files into a folder, one at a time so one refusal names its own file. */
export async function uploadTo(folder, files) {
	const done = [];
	for (const file of files) {
		const form = new FormData();
		form.append("file", file, file.name || "upload");
		form.append("is_private", "1");
		form.append("folder", folder);
		form.append("optimize", "0");
		await http.post("/api/method/upload_file", form, { timeout: 120000 });
		done.push(file.name);
	}
	return done;
}

/* ---------------------------------------------------------------- sharing */

/** Who a folder is shared with: Frappe's DocShare rows for it. */
export const readShares = (name) =>
	listAll("DocShare", ["name", "user", "read", "write", "everyone"],
		[["share_doctype", "=", "File"], ["share_name", "=", name]]);

/** The people it can be shared with: the site's enabled desk users. */
export const readUsers = () =>
	listAll("User", ["name", "full_name"], [["enabled", "=", 1], ["user_type", "=", "System User"]]);

/** Share with one person, or with everybody (`user` empty); Editor can write. */
export const share = (name, user, editor) =>
	apiCall("frappe.share.add", {
		doctype: "File", name, user: user || null, read: 1, write: editor ? 1 : 0, everyone: user ? 0 : 1,
	});

/** Stop sharing one row. A person's share goes through `frappe.share.remove`,
    which checks the right to share; the everybody row has no user for that
    call to find, so it is the row itself that goes. */
export const unshare = (name, row) => (Number(row.everyone)
	? apiDelete("DocShare", row.name)
	: apiCall("frappe.share.remove", { doctype: "File", name, user: row.user }));

/** A size as the reference writes one. */
export const kb = (n) => {
	const v = Number(n) || 0;
	return v < 1024 ? `${v} B` : v < 1048576 ? `${(v / 1024).toFixed(0)} KB` : `${(v / 1048576).toFixed(1)} MB`;
};
