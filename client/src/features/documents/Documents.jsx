/** Documents, as the HRDashboard reference draws it (21 October 2026): the
 *  company's folders as cards, one folder's files as a table, upload, rename,
 *  delete, and Share — on the site's own `File` folders and `DocShare`
 *  (api/documents.js says which folders and why).
 *
 *  The reference's `R.documents` and `R.folder`, markup and classes, with its
 *  saved list replaced by the site. Two of its controls have nothing behind
 *  them here and are left off rather than faked: a folder's colour (a File has
 *  no such field, so it is worked out from the name) and "Move to…".
 */

import { useCallback, useEffect, useState } from "react";
import { useApp, set } from "@/store";
import { navigate } from "@/routes/router";
import {
	createFolder, deleteFile, kb, readFiles, readFolder, readFolders, readShares, readUsers, renameFile,
	share, unshare, uploadTo,
} from "@/api/documents";
import KitIcon from "@/components/kit/KitIcon";
import KitAvatar from "@/components/kit/KitAvatar";
import { EmptyState, PageHead, Who, stagger } from "@/components/kit/ui";
import { Confirm, DotsMenu, KitModal, ModalFoot, toast } from "@/components/kit/overlay";

/* A folder's colour, from its name: the File record has none to read, and a
   colour that changed from visit to visit would be worse than none. */
const TONES = ["chart-1", "chart-2", "chart-3", "bad-fill", "rest", "info-ink", "brand-dark"];
const toneOf = (name) => {
	let h = 0;
	for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return TONES[h % TONES.length];
};

/* The reference's file-type badge, its colours as the avatar pairs. */
const TYPE_TONE = { pdf: 4, doc: 3, docx: 3, xls: 2, xlsx: 2, csv: 2, jpg: 5, jpeg: 5, png: 5, zip: 6 };
function FileType({ name }) {
	const x = (String(name).split(".").pop() || "").toLowerCase();
	const t = TYPE_TONE[x];
	return (
		<span className="k-ftype" style={t
			? { background: `rgb(var(--av${t}))`, color: `rgb(var(--av${t}-ink))` }
			: { background: "rgb(var(--wash))", color: "rgb(var(--ink-2))" }}>
			{x.slice(0, 4).toUpperCase() || "FILE"}
		</span>
	);
}

const date = (iso) => (iso ? new Date(String(iso).replace(" ", "T")).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const short = (iso) => (iso ? new Date(String(iso).replace(" ", "T")).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
const why = (e) => String(e?.message || e || "The site would not do that.").slice(0, 240);

/** New folder, or a new name for one. */
function FolderForm({ folder, onClose, onDone }) {
	const [name, setName] = useState(folder ? folder.file_name : "");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const submit = async (e) => {
		e.preventDefault();
		if (!name.trim()) { setErr("Name the folder"); return; }
		setBusy(true);
		try {
			if (folder) await renameFile(folder.name, name.trim());
			else await createFolder(name.trim());
			toast(folder ? "Folder renamed" : "Folder created");
			onDone();
		} catch (x) {
			setErr(why(x));
		} finally {
			setBusy(false);
		}
	};
	return (
		<KitModal title={folder ? "Rename folder" : "New folder"} sub={folder ? "" : "Create a folder for the company's files."} onClose={onClose}>
			<form onSubmit={submit} noValidate>
				<div className={`k-field${err ? " k-bad" : ""}`}>
					<label htmlFor="fname">Folder name</label>
					<input id="fname" className="k-inp" value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} />
					{err ? <small className="k-err">{err}</small> : null}
				</div>
				<ModalFoot ok={folder ? "Save" : "Create folder"} busy={busy} onCancel={onClose} />
			</form>
		</KitModal>
	);
}

/** Who a folder is shared with, and adding somebody. */
function ShareForm({ folder, onClose }) {
	const [rows, setRows] = useState(null);
	const [users, setUsers] = useState([]);
	const [who, setWho] = useState("");
	const [editor, setEditor] = useState(false);
	const [err, setErr] = useState("");
	const reload = useCallback(() => {
		readShares(folder.name).then(setRows).catch((x) => { setRows([]); setErr(why(x)); });
	}, [folder.name]);
	useEffect(() => {
		reload();
		readUsers().then(setUsers).catch(() => setUsers([]));
	}, [reload]);
	const nameOf = (u) => users.find((x) => x.name === u)?.full_name || u;
	const add = async (e) => {
		e.preventDefault();
		try {
			await share(folder.name, who === "*" ? "" : who, editor);
			toast("Shared");
			setWho("");
			reload();
		} catch (x) {
			setErr(why(x));
		}
	};
	const taken = new Set((rows || []).map((r) => r.user));
	return (
		<KitModal title={`Share “${folder.file_name}”`} sub="Choose who can view or edit this folder." onClose={onClose}>
			<form onSubmit={add} noValidate style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
				<div style={{ flex: 1 }} className="k-field">
					<label htmlFor="shwho">Add people</label>
					<select id="shwho" className="k-sel" value={who} onChange={(e) => setWho(e.target.value)}>
						<option value="">Choose…</option>
						<option value="*">Everyone</option>
						{users.filter((u) => !taken.has(u.name)).map((u) => <option key={u.name} value={u.name}>{u.full_name || u.name}</option>)}
					</select>
				</div>
				<div style={{ width: 130 }} className="k-field">
					<label htmlFor="shperm">Access</label>
					<select id="shperm" className="k-sel" value={editor ? "Editor" : "Viewer"} onChange={(e) => setEditor(e.target.value === "Editor")}>
						<option>Viewer</option>
						<option>Editor</option>
					</select>
				</div>
				<button type="submit" className="k-btn k-btn-ink" disabled={!who}>Add</button>
			</form>
			{err ? <p className="k-err" style={{ marginTop: 10 }}>{err}</p> : null}
			<div style={{ marginTop: 16 }}>
				{rows === null ? <div className="k-sk" style={{ height: 42 }} /> : rows.length ? rows.map((r) => (
					<div className="k-list-row" key={r.name}>
						{Number(r.everyone)
							? <span className="k-icon-sq"><KitIcon name="users" size={18} stroke={2} /></span>
							: <KitAvatar name={nameOf(r.user)} />}
						<div className="k-grow">
							<b>{Number(r.everyone) ? "Everyone" : nameOf(r.user)}</b>
							<small>{Number(r.write) ? "Editor" : "Viewer"}</small>
						</div>
						<button type="button" className="k-btn k-btn-ghost k-btn-sm"
							onClick={async () => { try { await unshare(folder.name, r); reload(); } catch (x) { setErr(why(x)); } }}>
							Remove
						</button>
					</div>
				)) : <p className="k-muted">Only the people who can read every file can see this folder.</p>}
			</div>
			<div className="k-modal-f"><button type="button" className="k-btn k-btn-ink" onClick={onClose}>Done</button></div>
		</KitModal>
	);
}

/** Files into a folder: the reference's drop zone. */
function UploadForm({ folder, onClose, onDone }) {
	const [files, setFiles] = useState([]);
	const [over, setOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const submit = async (e) => {
		e.preventDefault();
		if (!files.length) { setErr("Choose at least one file"); return; }
		setBusy(true);
		try {
			const done = await uploadTo(folder.name, files);
			toast(`${done.length} file${done.length === 1 ? "" : "s"} uploaded`);
			onDone();
		} catch (x) {
			setErr(why(x));
		} finally {
			setBusy(false);
		}
	};
	return (
		<KitModal title="Upload files" sub={`Add files to ${folder.file_name}. They are kept private.`} onClose={onClose}>
			<form onSubmit={submit}>
				<label className={`k-drop${over ? " k-over" : ""}`}
					onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragEnter={() => setOver(true)}
					onDragLeave={() => setOver(false)}
					onDrop={(e) => { e.preventDefault(); setOver(false); setFiles([...e.dataTransfer.files]); setErr(""); }}>
					<KitIcon name="upload" size={28} stroke={1.8} />
					<b>Drop files here or click to browse</b>
					<span>PDF, Word, Excel or images.</span>
					<input type="file" multiple aria-label="Files" onChange={(e) => { setFiles([...e.target.files]); setErr(""); }} />
				</label>
				<div style={{ marginTop: 14 }}>
					{files.map((f) => (
						<div className="k-list-row" key={f.name}>
							<FileType name={f.name} />
							<div className="k-grow"><b>{f.name}</b><small>{kb(f.size)}</small></div>
						</div>
					))}
				</div>
				{err ? <p className="k-err">{err}</p> : null}
				<ModalFoot ok="Upload" busy={busy} onCancel={onClose} />
			</form>
		</KitModal>
	);
}

/** One file's new name. */
function RenameForm({ file, onClose, onDone }) {
	const [name, setName] = useState(file.file_name);
	const [err, setErr] = useState("");
	return (
		<KitModal title="Rename file" onClose={onClose}>
			<form noValidate onSubmit={async (e) => {
				e.preventDefault();
				if (!name.trim()) { setErr("Name the file"); return; }
				try { await renameFile(file.name, name.trim()); toast("File renamed"); onDone(); } catch (x) { setErr(why(x)); }
			}}>
				<div className={`k-field${err ? " k-bad" : ""}`}>
					<label htmlFor="rname">File name</label>
					<input id="rname" className="k-inp" value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} />
					{err ? <small className="k-err">{err}</small> : null}
				</div>
				<ModalFoot ok="Rename" onCancel={onClose} />
			</form>
		</KitModal>
	);
}

/** Every folder, as the reference's cards. */
function Folders() {
	const s = useApp();
	const [rows, setRows] = useState(null);
	const [err, setErr] = useState("");
	const [dlg, setDlg] = useState(null);
	const reload = useCallback(() => {
		readFolders().then((r) => { setRows(r); setErr(""); }).catch((x) => { setRows([]); setErr(why(x)); });
	}, []);
	useEffect(() => { reload(); }, [reload]);
	const personOf = (u) => (s.employees.find((e) => e.user_id === u)?.employee_name) || u || "?";
	const open = (f) => { set({ docFolder: f.name }); navigate("documents", "folder"); };
	const close = () => setDlg(null);
	const done = () => { setDlg(null); reload(); };
	const files = (rows || []).reduce((t, f) => t + f.files, 0);
	const size = (rows || []).reduce((t, f) => t + f.size, 0);

	return (
		<div className="kit k-enter">
			<PageHead title="Documents" sub="Company files, organised in folders">
				<button type="button" className="k-btn k-btn-ink" onClick={() => setDlg({ kind: "folder" })}>
					<KitIcon name="plus" size={18} stroke={2} />New folder
				</button>
			</PageHead>
			<div className="k-mini-grid">
				{[["Folders", rows?.length], ["Files", rows ? files : undefined], ["Storage used", rows ? kb(size) : undefined]].map(([t, v], i) => (
					<div className="k-mini k-anim" style={stagger(i)} key={t}>
						<div className="k-mini-t">{t}</div>
						<div className="k-mini-v"><b>{v ?? "—"}</b></div>
					</div>
				))}
			</div>
			{err ? <div className="k-card"><EmptyState icon="info" title="The folders could not be read" sub={err} /></div> : null}
			{rows === null ? <div className="k-sk" style={{ height: 160 }} /> : (
				<div className="k-jobs">
					{rows.map((f, i) => (
						<div className="k-folder k-anim" style={stagger(i + 3)} key={f.name}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
								<span className="k-folder-ic" style={{ color: `rgb(var(--${toneOf(f.name)}))` }} />
								<DotsMenu label={`More for ${f.file_name}`} items={[
									{ label: "Open", icon: "folder", onClick: () => open(f) },
									{ label: "Share", icon: "users", onClick: () => setDlg({ kind: "share", folder: f }) },
									{ label: "Rename", icon: "edit", onClick: () => setDlg({ kind: "folder", folder: f }) },
									"-",
									{ label: "Delete", icon: "trash", danger: true, onClick: () => setDlg({ kind: "delete", folder: f }) },
								]} />
							</div>
							<button type="button" style={{ textAlign: "left" }} onClick={() => open(f)}>
								<h3>{f.file_name}</h3>
								<small>{f.files} file{f.files === 1 ? "" : "s"} · {kb(f.size)}</small>
							</button>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
								<div style={{ display: "flex" }}>
									{(f.shared.some((x) => Number(x.everyone)) ? [{ everyone: 1 }] : f.shared.length ? f.shared : [{ user: f.owner }])
										.slice(0, 3).map((x, j) => (Number(x.everyone)
											? <span className="k-pill k-p-green k-nodot" key="all">Everyone</span>
											: <KitAvatar key={x.user} name={personOf(x.user)} title={personOf(x.user)} size={26}
												style={{ width: 26, height: 26, fontSize: 10, marginLeft: j ? -8 : 0, border: "2px solid rgb(var(--card))" }} />))}
								</div>
								<small>{short(f.creation)}</small>
							</div>
						</div>
					))}
					<button type="button" className="k-folder" style={{ border: "2px dashed rgb(var(--line-2))", boxShadow: "none", alignItems: "center", justifyContent: "center", color: "rgb(var(--ink-2))", minHeight: 150 }}
						onClick={() => setDlg({ kind: "folder" })}>
						<KitIcon name="plus" size={24} stroke={2} />New folder
					</button>
				</div>
			)}
			{dlg?.kind === "folder" ? <FolderForm folder={dlg.folder} onClose={close} onDone={done} /> : null}
			{dlg?.kind === "share" ? <ShareForm folder={dlg.folder} onClose={close} /> : null}
			{dlg?.kind === "delete" ? (
				<Confirm title={`Delete “${dlg.folder.file_name}”?`}
					sub={dlg.folder.files ? `${dlg.folder.files} file${dlg.folder.files === 1 ? " is" : "s are"} inside. The site deletes only an empty folder.` : "The folder is empty."}
					ok="Delete folder" onClose={close}
					onOk={async () => { try { await deleteFile(dlg.folder.name); toast("Folder deleted"); done(); } catch (x) { setErr(why(x)); close(); } }} />
			) : null}
		</div>
	);
}

/** One folder's files. */
function Folder() {
	const s = useApp();
	const name = s.docFolder;
	const [folder, setFolder] = useState(undefined);
	const [files, setFiles] = useState(null);
	const [q, setQ] = useState("");
	const [dlg, setDlg] = useState(null);
	const [err, setErr] = useState("");
	const reload = useCallback(() => {
		if (!name) { setFolder(null); return; }
		readFolder(name).then(setFolder).catch(() => setFolder(null));
		readFiles(name).then(setFiles).catch((x) => { setFiles([]); setErr(why(x)); });
	}, [name]);
	useEffect(() => { reload(); }, [reload]);
	const ownerName = (u) => (s.employees.find((e) => e.user_id === u)?.employee_name) || u;
	const close = () => setDlg(null);
	const done = () => { setDlg(null); reload(); };

	if (folder === null) {
		return (
			<div className="kit k-enter">
				<div className="k-card">
					<EmptyState icon="folder" title="This folder is not there" sub="It may have been deleted.">
						<button type="button" className="k-btn k-btn-ink k-btn-sm" onClick={() => navigate("documents")}>Go to Documents</button>
					</EmptyState>
				</div>
			</div>
		);
	}
	const title = folder?.file_name || "Folder";
	const shownFiles = (files || []).filter((x) => !q || String(x.file_name).toLowerCase().includes(q.toLowerCase()));

	return (
		<div className="kit k-enter">
			<div className="k-ph">
				<div>
					<button type="button" className="k-back" onClick={() => navigate("documents")}>
						<KitIcon name="left" size={22} stroke={2} />{title}
					</button>
					<div className="k-crumbs">
						<button type="button" onClick={() => navigate("documents")}>Documents</button>
						<KitIcon name="right" size={14} stroke={2} /><b>{title}</b>
					</div>
				</div>
				<div className="k-ph-act">
					<button type="button" className="k-btn k-btn-line" disabled={!folder} onClick={() => setDlg({ kind: "share" })}>
						<KitIcon name="users" size={16} stroke={2} />Share
					</button>
					<button type="button" className="k-btn k-btn-ink" disabled={!folder} onClick={() => setDlg({ kind: "upload" })}>
						<KitIcon name="upload" size={18} stroke={2} />Upload
					</button>
				</div>
			</div>
			<div className="k-card">
				{err ? <p className="k-err">{err}</p> : null}
				{files === null ? <div className="k-sk" style={{ height: 200 }} /> : files.length ? (
					<>
						<div className="k-inp-ic" style={{ maxWidth: 320, marginBottom: 14 }}>
							<KitIcon name="search" size={18} stroke={2} />
							<input className="k-inp" placeholder="Search files" value={q} aria-label="Search files" onChange={(e) => setQ(e.target.value)} />
						</div>
						<div className="k-tbl-wrap">
							<table className="k-rt">
								<thead><tr>{["Name", "Size", "Owner", "Last modified", ""].map((c) => <th key={c}><span>{c}</span></th>)}</tr></thead>
								<tbody>
									{shownFiles.map((x) => (
										<tr key={x.name}>
											<td className="k-title-cell">
												<div className="k-file-row">
													<FileType name={x.file_name} />
													<a href={x.file_url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{x.file_name}</a>
												</div>
											</td>
											<td data-label="Size">{kb(x.file_size)}</td>
											<td data-label="Owner"><Who name={ownerName(x.owner)} sub="" /></td>
											<td data-label="Last modified">{date(x.modified)}</td>
											<td data-label="">
												<DotsMenu label={`More for ${x.file_name}`} items={[
													{ label: "Rename", icon: "edit", onClick: () => setDlg({ kind: "rename", file: x }) },
													"-",
													{ label: "Delete", icon: "trash", danger: true, onClick: () => setDlg({ kind: "delete", file: x }) },
												]} />
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</>
				) : (
					<div className="k-empty-st" style={{ padding: "60px 20px" }}>
						<div className="k-e-ic" style={{ width: 72, height: 72 }}><KitIcon name="folder" size={30} stroke={1.8} /></div>
						<b>This folder is empty</b>
						Upload files to share them with your team.
						<div>
							<button type="button" className="k-btn k-btn-ink k-btn-sm" disabled={!folder} onClick={() => setDlg({ kind: "upload" })}>
								<KitIcon name="upload" size={18} stroke={2} />Upload files
							</button>
						</div>
					</div>
				)}
			</div>
			{dlg?.kind === "share" && folder ? <ShareForm folder={folder} onClose={close} /> : null}
			{dlg?.kind === "upload" && folder ? <UploadForm folder={folder} onClose={close} onDone={done} /> : null}
			{dlg?.kind === "rename" ? <RenameForm file={dlg.file} onClose={close} onDone={done} /> : null}
			{dlg?.kind === "delete" ? (
				<Confirm title={`Delete “${dlg.file.file_name}”?`} sub="The file is removed from the site." ok="Delete file" onClose={close}
					onOk={async () => { try { await deleteFile(dlg.file.name); toast("File deleted"); done(); } catch (x) { setErr(why(x)); close(); } }} />
			) : null}
		</div>
	);
}

export default function Documents() {
	const { subtab } = useApp();
	return subtab === "folder" ? <Folder /> : <Folders />;
}
