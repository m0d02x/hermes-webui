import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2 } from "lucide-react";
import { libraryError, libraryPathJoin, libraryUrl, listDirectory, listProjects, postLibrary, uploadLibraryBatch, type LibraryEntry, type LibraryProject, type UploadItem } from "./library-api";

const t = (key: string, fallback: string) => window.libraryHost.translate(key, fallback);
const textTypes = ["txt", "md", "markdown", "csv", "tsv", "html", "htm", "xml", "json", "yaml", "yml", "toml", "log", "py", "js", "ts", "css", "sh", "rst", "docx", "xlsx", "pptx"];
const imageTypes = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
const audioTypes = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];
const videoTypes = ["mp4", "webm", "ogv"];

type Edit = { kind: "create-project" | "rename-project" | "create-folder" | "rename-entry"; projectId?: string; projectName?: string; folder: string; path?: string; value: string };
type Confirm = { kind: "project" | "entry"; projectId: string; folder?: string; path?: string; name: string; directory?: boolean };

function rawUrl(projectId: string, path: string, download = false) {
  return libraryUrl("/api/library/file/raw", { project_id: projectId, path, ...(download ? { download: 1 } : {}) });
}

function extension(path: string) {
  return path.split("/").pop()?.split(".").pop()?.toLowerCase() || "";
}

function bytes(size?: number) {
  if (size === undefined || !Number.isFinite(size) || size < 0) return "";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unit = units[0];
  for (let index = 0; value >= 1024 && index < units.length - 1; index++) { value /= 1024; unit = units[index + 1]; }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`;
}

export function Library() {
  const sidebarHost = document.getElementById("panelLibrary");
  const [projects, setProjects] = useState<LibraryProject[]>([]);
  const [nextProjects, setNextProjects] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folder, setFolder] = useState(".");
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [nextEntries, setNextEntries] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ projectId: string; path: string; content?: string; error?: string } | null>(null);
  const [projectStatus, setProjectStatus] = useState("");
  const [mainStatus, setMainStatus] = useState(() => t("library_select_project", "Select a project to browse its files."));
  const [projectError, setProjectError] = useState(false);
  const [mainError, setMainError] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [draft, setDraft] = useState("");
  const [formError, setFormError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const projectGeneration = useRef(0);
  const directoryGeneration = useRef(0);
  const previewGeneration = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const folderRef = useRef(".");
  const projectsRef = useRef<LibraryProject[]>([]);
  const nextProjectsRef = useRef<number | null>(null);
  const entriesRef = useRef<LibraryEntry[]>([]);
  const nextEntriesRef = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const syncSelection = (id: string | null, path = ".") => {
    selectedRef.current = id;
    folderRef.current = path;
    setSelectedId(id);
    setFolder(path);
  };

  const loadDirectory = useCallback(async (path: string, append = false, projectId = selectedRef.current): Promise<boolean> => {
    if (!projectId) return false;
    const context = window.libraryHost.context();
    if (!append) {
      folderRef.current = path || ".";
      setFolder(path || ".");
      entriesRef.current = [];
      setEntries([]);
      nextEntriesRef.current = null;
      setNextEntries(null);
      setPreview(null);
      setPreviewBusy(false);
      ++previewGeneration.current;
    }
    const destination = append ? folderRef.current : path || ".";
    const generation = ++directoryGeneration.current;
    setMainError(false);
    setMainStatus(t("library_loading", "Loading…"));
    try {
      const page = await listDirectory(projectId, destination, append ? nextEntriesRef.current ?? 0 : 0);
      if (generation !== directoryGeneration.current || projectId !== selectedRef.current || destination !== folderRef.current || context !== window.libraryHost.context()) return false;
      const updated = append ? [...entriesRef.current, ...page.entries] : page.entries;
      entriesRef.current = updated;
      setEntries(updated);
      nextEntriesRef.current = page.next_offset;
      setNextEntries(page.next_offset);
      setMainStatus(updated.length ? "" : t("library_folder_empty", "This folder is empty."));
      return true;
    } catch (error) {
      if (generation === directoryGeneration.current && projectId === selectedRef.current && destination === folderRef.current && context === window.libraryHost.context()) {
        setMainError(true);
        setMainStatus(libraryError(error));
      }
      return false;
    }
  }, []);

  const loadProjects = useCallback(async (search: string, append = false) => {
    const generation = ++projectGeneration.current;
    const context = window.libraryHost.context();
    setProjectError(false);
    if (!append) setProjectStatus(t("library_loading", "Loading projects…"));
    try {
      const page = await listProjects(search, append ? nextProjectsRef.current ?? 0 : 0);
      if (generation !== projectGeneration.current || context !== window.libraryHost.context()) return;
      const updated = append ? [...projectsRef.current, ...page.projects] : page.projects;
      projectsRef.current = updated;
      setProjects(updated);
      nextProjectsRef.current = page.next_offset;
      setNextProjects(page.next_offset);
      setProjectStatus(updated.length ? "" : t("library_empty", "Create your first project"));
      if (selectedRef.current && !append) void loadDirectory(folderRef.current, false, selectedRef.current);
    } catch (error) {
      if (generation === projectGeneration.current && context === window.libraryHost.context()) {
        setProjectError(true);
        setProjectStatus(libraryError(error));
      }
    }
  }, [loadDirectory]);

  const refresh = useCallback(() => { void loadProjects(query); }, [loadProjects, query]);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => {
    const onRefresh = () => refreshRef.current();
    window.addEventListener("hermes-library-refresh", onRefresh);
    const main = document.getElementById("mainLibrary");
    if (main && getComputedStyle(main).display !== "none") refreshRef.current();
    return () => {
      window.removeEventListener("hermes-library-refresh", onRefresh);
      ++projectGeneration.current;
      ++directoryGeneration.current;
      ++previewGeneration.current;
    };
  }, []);

  const lastQuery = useRef(query);
  useEffect(() => {
    if (lastQuery.current === query) return;
    lastQuery.current = query;
    const timer = window.setTimeout(() => { void loadProjects(query); }, 180);
    return () => window.clearTimeout(timer);
  }, [loadProjects, query]);

  const selectProject = (projectId: string) => {
    syncSelection(projectId);
    entriesRef.current = [];
    setEntries([]);
    setPreview(null);
    ++directoryGeneration.current;
    ++previewGeneration.current;
    window.libraryHost.closeDrawer();
    void loadDirectory(".", false, projectId);
  };

  const openEdit = (payload: Edit) => { setEdit(payload); setDraft(payload.value); setFormError(""); };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!edit || submitting) return;
    const payload = edit;
    const value = draft.trim();
    if (!value) { setFormError(t("library_value_required", "A value is required")); return; }
    setSubmitting(true);
    setFormError("");
    try {
      if (payload.kind === "create-project") {
        const result = await postLibrary<{ project: LibraryProject }>("/api/library/projects/create", { name: value });
        syncSelection(result.project.project_id);
        lastQuery.current = "";
        setQuery("");
        await loadProjects("");
        await loadDirectory(".", false, result.project.project_id);
        window.libraryHost.closeDrawer();
      } else if (payload.kind === "rename-project") {
        await postLibrary("/api/library/projects/rename", { project_id: payload.projectId, name: value });
        await loadProjects(query);
      } else if (payload.kind === "create-folder") {
        await postLibrary("/api/library/file/create-dir", { project_id: payload.projectId, path: libraryPathJoin(payload.folder, value) });
        if (payload.projectId === selectedRef.current && payload.folder === folderRef.current) await loadDirectory(payload.folder, false, payload.projectId);
      } else {
        if (value !== payload.path) await postLibrary("/api/library/file/rename", { project_id: payload.projectId, path: payload.path, new_path: value });
        if (payload.projectId === selectedRef.current && payload.folder === folderRef.current) await loadDirectory(payload.folder, false, payload.projectId);
      }
      setEdit(null);
    } catch (error) { setFormError(libraryError(error)); }
    finally { setSubmitting(false); }
  };

  const deleteConfirmed = async () => {
    if (!confirm || submitting) return;
    const target = confirm;
    setSubmitting(true);
    try {
      if (target.kind === "project") {
        await postLibrary("/api/library/projects/delete", { project_id: target.projectId, recursive: true });
        if (selectedRef.current === target.projectId) {
          syncSelection(null);
          entriesRef.current = [];
          setEntries([]);
          setPreview(null);
          setMainStatus(t("library_select_project", "Select a project to browse its files."));
        }
        await loadProjects(query);
      } else {
        await postLibrary("/api/library/file/delete", { project_id: target.projectId, path: target.path, ...(target.directory ? { recursive: true } : {}) });
        if (target.projectId === selectedRef.current && target.folder === folderRef.current) await loadDirectory(target.folder || ".", false, target.projectId);
      }
      setConfirm(null);
    } catch (error) {
      setConfirmError(libraryError(error));
    } finally { setSubmitting(false); }
  };

  const previewFile = async (projectId: string, path: string) => {
    const generation = ++previewGeneration.current;
    const context = window.libraryHost.context();
    const type = extension(path);
    setPreview({ projectId, path });
    setPreviewBusy(false);
    if (!textTypes.includes(type)) return;
    setPreviewBusy(true);
    try {
      const result = await window.libraryHost.request<{ content?: string; text?: string }>(libraryUrl("/api/library/file", { project_id: projectId, path }));
      if (generation === previewGeneration.current && projectId === selectedRef.current && context === window.libraryHost.context()) setPreview({ projectId, path, content: result.content || result.text || "" });
    } catch (error) {
      if (generation === previewGeneration.current && projectId === selectedRef.current && context === window.libraryHost.context()) setPreview({ projectId, path, error: libraryError(error) });
    } finally { if (generation === previewGeneration.current) setPreviewBusy(false); }
  };

  const uploadBatch = async (uploads: readonly UploadItem[], projectId = selectedRef.current, destination = folderRef.current, context = window.libraryHost.context()) => {
    if (!projectId || !uploads.length) return;
    setUploading(true);
    try {
      const failed = await uploadLibraryBatch(uploads, projectId, destination, window.libraryHost.request);
      if (projectId === selectedRef.current && destination === folderRef.current && context === window.libraryHost.context()) {
        const refreshed = await loadDirectory(destination, false, projectId);
        if (refreshed && failed.length) { setMainError(true); setMainStatus(`${failed.length} upload(s) failed: ${failed.join("; ")}`); }
        else if (refreshed) setMainStatus(t("library_upload_complete", "Upload complete"));
      }
    } finally { setUploading(false); }
  };

  const changeFiles = (input: HTMLInputElement) => {
    const uploads = [...(input.files || [])].map((file) => ({ file, relDir: (file as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/").slice(0, -1).join("/") || "" }));
    input.value = "";
    void uploadBatch(uploads);
  };

  const mentionProject = async (projectId: string) => {
    try {
      await window.libraryHost.mention(projectId);
    } catch (error) {
      setMainError(true);
      setMainStatus(libraryError(error));
    }
  };
  const breadcrumbs = useMemo(() => ({ project: projects.find((project) => project.project_id === selectedId), parts: folder.split("/").filter((part) => part && part !== ".") }), [folder, projects, selectedId]);
  const sidebar = sidebarHost && createPortal(<section className="lib-scope lib-flex lib-h-full lib-flex-col lib-gap-3 lib-p-3" aria-label="Library projects">
    <header className="lib-flex lib-items-center lib-justify-between lib-gap-2"><h2 className="lib-text-sm lib-font-semibold">{t("tab_library", "Library")}</h2><Button size="sm" onClick={() => { window.libraryHost.closeDrawer(); openEdit({ kind: "create-project", folder: ".", value: "" }); }}>{t("library_create_project", "New project")}</Button></header>
    <label className="lib-sr-only" htmlFor="librarySearch">{t("library_search", "Search projects")}</label>
    <Input id="librarySearch" type="search" placeholder={t("library_search", "Search projects")} value={query} onChange={(event) => { ++projectGeneration.current; nextProjectsRef.current = null; setNextProjects(null); setQuery(event.target.value); }} />
    {projectStatus && <p className={`lib-text-sm ${projectError ? "lib-text-destructive" : "lib-text-muted-foreground"}`} role={projectError ? "alert" : "status"}>{projectStatus}</p>}
    {projectError && <Button variant="outline" size="sm" onClick={refresh}>{t("library_retry", "Retry")}</Button>}
    <ul className="lib-m-0 lib-flex lib-list-none lib-flex-col lib-gap-1 lib-overflow-y-auto lib-p-0">{projects.map((project) => <li key={project.project_id} className="lib-flex lib-items-center lib-gap-1">
      <Button variant={selectedId === project.project_id ? "secondary" : "ghost"} className="lib-min-w-0 lib-flex-1 lib-justify-start lib-truncate" aria-current={selectedId === project.project_id ? "true" : undefined} onClick={() => selectProject(project.project_id)}>{project.name}</Button>
      <Button variant="ghost" size="icon" aria-label={`${t("library_rename", "Rename")} ${project.name}`} onClick={() => openEdit({ kind: "rename-project", projectId: project.project_id, projectName: project.name, folder, value: project.name })}><Pencil aria-hidden="true" /></Button>
      <Button variant="ghost" size="icon" aria-label={`${t("library_delete", "Delete")} ${project.name}`} onClick={() => { setConfirmError(""); setConfirm({ kind: "project", projectId: project.project_id, name: project.name }); }}><Trash2 aria-hidden="true" /></Button>
    </li>)}</ul>
    {nextProjects !== null && <Button variant="outline" size="sm" onClick={() => void loadProjects(query, true)}>{t("library_load_more", "Load more")}</Button>}
  </section>, sidebarHost);

  return <>{sidebar}
    <div className="lib-scope lib-flex lib-w-full lib-flex-1 lib-h-full lib-min-h-0 lib-flex-col lib-gap-3 lib-p-4" onDragOver={(event) => { event.preventDefault(); if (selectedId) setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={async (event) => {
      event.preventDefault();
      setDragging(false);
      const projectId = selectedRef.current;
      const destination = folderRef.current;
      const context = window.libraryHost.context();
      if (!projectId) return;
      try {
        const uploads = await window.libraryHost.collectDrop(event.dataTransfer);
        if (projectId === selectedRef.current && destination === folderRef.current && context === window.libraryHost.context()) void uploadBatch(uploads, projectId, destination, context);
      } catch (error) {
        if (projectId === selectedRef.current && destination === folderRef.current && context === window.libraryHost.context()) {
          setMainError(true);
          setMainStatus(libraryError(error));
        }
      }
    }}>
      <header className="lib-flex lib-flex-wrap lib-items-center lib-justify-between lib-gap-3">
        <nav className="lib-flex lib-flex-wrap lib-items-center lib-gap-1 lib-text-sm" aria-label="Library folder path">{breadcrumbs.project && <><button className="lib-underline-offset-4 hover:lib-underline" type="button" onClick={() => void loadDirectory(".")}>{breadcrumbs.project.name}</button>{breadcrumbs.parts.map((part, index) => { const path = breadcrumbs.parts.slice(0, index + 1).join("/"); return <span key={path} className="lib-flex lib-items-center lib-gap-1"><span aria-hidden="true">/</span><button className="lib-underline-offset-4 hover:lib-underline" type="button" onClick={() => void loadDirectory(path)}>{part}</button></span>; })}</>}</nav>
        <div className="lib-flex lib-flex-wrap lib-gap-2">
          <Button variant="outline" disabled={!selectedId} onClick={() => selectedId && openEdit({ kind: "create-folder", projectId: selectedId, folder, value: "" })}>{t("library_new_folder", "New folder")}</Button>
          <Button variant="outline" disabled={!selectedId} onClick={() => fileInput.current?.click()}>{t("library_upload_files", "Upload files")}</Button>
          <Button variant="outline" disabled={!selectedId} onClick={() => folderInput.current?.click()}>{t("library_upload_folder", "Upload folder")}</Button>
          <Button variant="outline" disabled={!selectedId} onClick={() => selectedId && void mentionProject(selectedId)}>{t("library_mention", "Mention in chat")}</Button>
          <Button variant="outline" disabled={!selectedId} onClick={() => void loadDirectory(folder)}>{t("library_refresh", "Refresh")}</Button>
        </div>
        <input ref={fileInput} type="file" multiple hidden aria-label={t("library_upload_files", "Upload files")} onChange={(event) => changeFiles(event.currentTarget)} />
        <input ref={folderInput} type="file" multiple hidden aria-label={t("library_upload_folder", "Upload folder")} {...({ webkitdirectory: "", directory: "" } as InputHTMLAttributes<HTMLInputElement> & { webkitdirectory?: string; directory?: string })} onChange={(event) => changeFiles(event.currentTarget)} />
      </header>
      <p className="lib-m-0 lib-text-xs lib-text-muted-foreground">{t("library_shared_hint", "Library projects and files are shared across all profiles on this WebUI.")}</p>
      {mainStatus && <p className={`lib-m-0 lib-text-sm ${mainError ? "lib-text-destructive" : "lib-text-muted-foreground"}`} role={mainError ? "alert" : "status"}>{mainStatus}</p>}
      {mainError && <Button variant="outline" size="sm" className="lib-self-start" onClick={() => void loadDirectory(folder)}>{t("library_retry", "Retry")}</Button>}
      <div className={`lib-flex lib-min-h-0 lib-flex-1 lib-flex-col lib-gap-3 md:lib-flex-row ${dragging ? "lib-ring-2 lib-ring-primary" : ""}`}>
        <section className="lib-min-h-0 lib-flex-1 lib-overflow-auto" aria-label="Project files" role="list">
          {uploading && <p className="lib-text-sm" role="status">{t("library_loading", "Loading…")}</p>}
          {entries.map((entry) => {
            const unavailable = !!entry.unavailable || entry.type === "unavailable" || entry.type === "symlink";
            const directory = !!entry.is_dir || entry.type === "dir";
            const path = libraryPathJoin(folder, entry.name);
            const date = entry.mtime_ns === undefined || entry.mtime_ns === null ? null : new Date(Number(entry.mtime_ns) / 1_000_000);
            return <article key={path} className="lib-flex lib-flex-wrap lib-items-center lib-justify-between lib-gap-2 lib-border-b lib-py-2" role="listitem">
              <div className="lib-flex lib-w-full lib-min-w-0 lib-flex-wrap lib-items-center lib-gap-2">
                <button type="button" className="lib-min-w-0 lib-flex-1 lib-break-all lib-text-left lib-font-medium" disabled={unavailable} onClick={() => directory ? void loadDirectory(path) : selectedId && void previewFile(selectedId, path)}>{directory ? "▸ " : ""}{entry.name}{unavailable ? " (unavailable)" : ""}</button>
                {entry.size !== undefined && <span className="lib-text-xs lib-text-muted-foreground">{bytes(entry.size)}</span>}
                {date && Number.isFinite(date.getTime()) && <time className="lib-text-xs lib-text-muted-foreground" dateTime={date.toISOString()}>{date.toLocaleDateString()}</time>}
              </div>
              {!unavailable && <div className="lib-flex lib-flex-wrap lib-items-center lib-gap-1">{!directory && <><Button variant="ghost" size="sm" onClick={() => selectedId && void previewFile(selectedId, path)}>{t("library_preview", "Preview")}</Button><a className="lib-text-sm lib-underline" href={rawUrl(selectedId!, path, true)}>{t("library_download", "Download")}</a></>}<Button variant="ghost" size="sm" onClick={() => selectedId && openEdit({ kind: "rename-entry", projectId: selectedId, folder, path, value: path })}>{t("library_rename_move", "Rename / Move")}</Button><Button variant="ghost" size="sm" onClick={() => { setConfirmError(""); if (selectedId) setConfirm({ kind: "entry", projectId: selectedId, folder, path, name: entry.name, directory }); }}>{t("library_delete", "Delete")}</Button></div>}
            </article>;
          })}
          {nextEntries !== null && <Button variant="outline" size="sm" className="lib-mt-3" onClick={() => void loadDirectory(folder, true)}>{t("library_load_more", "Load more")}</Button>}
        </section>
        {preview && <section className="lib-flex lib-min-h-0 lib-max-h-[50vh] lib-min-w-0 lib-flex-1 lib-flex-col lib-gap-2 lib-overflow-auto lib-border-t lib-pt-3 md:lib-max-h-none md:lib-border-l md:lib-border-t-0 md:lib-pl-3 md:lib-pt-0" aria-label="File preview">
          <div className="lib-flex lib-items-center lib-justify-between"><strong className="lib-break-all lib-text-sm">{preview.path}</strong><Button variant="outline" size="sm" onClick={() => { ++previewGeneration.current; setPreviewBusy(false); setPreview(null); }}>{t("library_back", "Back")}</Button></div>
          {previewBusy && <p role="status">{t("library_loading", "Loading…")}</p>}{preview.error && <p role="alert" className="lib-text-destructive">{preview.error}</p>}
          {imageTypes.includes(extension(preview.path)) && <img className="lib-max-h-full lib-max-w-full lib-self-start lib-object-contain" src={rawUrl(preview.projectId, preview.path)} alt={preview.path.split("/").pop()} />}
          {extension(preview.path) === "pdf" && <iframe className="lib-min-h-64 lib-w-full lib-flex-1" src={rawUrl(preview.projectId, preview.path)} title={preview.path.split("/").pop()} sandbox="" />}
          {audioTypes.includes(extension(preview.path)) && <audio controls aria-label={preview.path.split("/").pop()} src={rawUrl(preview.projectId, preview.path)} />}{videoTypes.includes(extension(preview.path)) && <video controls aria-label={preview.path.split("/").pop()} src={rawUrl(preview.projectId, preview.path)} />}
          {textTypes.includes(extension(preview.path)) && preview.content !== undefined && <pre className="lib-max-h-full lib-overflow-auto lib-whitespace-pre-wrap lib-break-words lib-rounded lib-border lib-p-3 lib-font-mono lib-text-xs">{preview.content}</pre>}
          <a className="lib-self-start lib-text-sm lib-underline" href={rawUrl(preview.projectId, preview.path, true)}>{t("library_download", "Download")}</a>
        </section>}
      </div>
    </div>
    <Dialog open={!!edit} onOpenChange={(open) => { if (!open && !submitting) { setEdit(null); setFormError(""); } }}>
      <DialogContent className="lib-scope" onOpenAutoFocus={(event) => { if (window.matchMedia("(pointer: coarse)").matches) event.preventDefault(); }}><form onSubmit={submitEdit}>
        <DialogHeader><DialogTitle>{edit?.kind === "create-project" ? t("library_create_project", "New project") : edit?.kind === "rename-project" ? t("library_rename_project", "Rename project") : edit?.kind === "create-folder" ? t("library_new_folder", "New folder") : t("library_move_prompt", "Destination path within this project")}</DialogTitle><DialogDescription>{edit?.kind === "create-project" ? t("library_shared_hint", "Shared across all profiles on this WebUI.") : edit?.kind === "rename-project" ? edit.projectName : edit?.kind === "create-folder" ? `${t("library_new_folder", "New folder")} · ${edit.folder}` : edit?.path ? `${t("library_move_prompt", "Destination path within this project")}: ${edit.path}` : t("library_project_name", "Project name")}</DialogDescription></DialogHeader>
        <label className="lib-mt-4 lib-block lib-text-sm" htmlFor="libraryEditValue">{edit?.kind === "create-project" ? t("library_project_name", "Project name") : edit?.kind === "create-folder" ? t("library_folder_name", "Folder name") : edit?.kind === "rename-entry" ? t("library_move_prompt", "Destination path within this project") : t("library_rename_project", "Project name")}</label>
        <Input id="libraryEditValue" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={submitting} />
        {formError && <p className="lib-mt-2 lib-text-sm lib-text-destructive" role="alert">{formError}</p>}
        <DialogFooter className="lib-mt-4"><Button type="button" variant="outline" disabled={submitting} onClick={() => setEdit(null)}>{t("cancel", "Cancel")}</Button><Button type="submit" disabled={submitting}>{submitting ? t("library_loading", "Loading…") : edit?.kind.startsWith("create") ? t("library_create", "Create") : t("library_save", "Save")}</Button></DialogFooter>
      </form></DialogContent>
    </Dialog>
    <AlertDialog open={!!confirm} onOpenChange={(open) => { if (!open && !submitting) setConfirm(null); }}>
      <AlertDialogContent className="lib-scope"><AlertDialogHeader><AlertDialogTitle>{confirm?.kind === "project" ? `${t("library_delete_project", "Delete project")} “${confirm.name}”?` : `${t("library_delete", "Delete")} “${confirm?.name}”?`}</AlertDialogTitle><AlertDialogDescription>{confirm?.kind === "project" ? t("library_delete_project_warning", "Its files will be deleted for every profile.") : confirm?.directory ? t("library_recursive_warning", "All files in this folder will be deleted.") : ""}{confirmError && <span className="lib-mt-2 lib-block lib-text-destructive" role="alert">{confirmError}</span>}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={submitting}>{t("cancel", "Cancel")}</AlertDialogCancel><AlertDialogAction disabled={submitting} className="lib-bg-destructive lib-text-destructive-foreground" onClick={(event) => { event.preventDefault(); void deleteConfirmed(); }}>{t("library_delete", "Delete")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
