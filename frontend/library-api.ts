export type LibraryProject = { project_id: string; name: string; created_at: number };
export type LibraryEntry = {
  name: string;
  path?: string;
  type?: string;
  is_dir?: boolean;
  size?: number;
  mtime_ns?: string | number | null;
  birthtime_ns?: string | number | null;
  unavailable?: boolean;
};
export type UploadItem = { file: File; relDir?: string };
export type LibraryRequest = <T>(path: string, options?: {
  method?: string;
  body?: string | FormData;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}) => Promise<T>;

type ProjectPage = { projects: LibraryProject[]; next_offset: number | null };
type EntryPage = { entries: LibraryEntry[]; next_offset: number | null };
type UploadResponse = { error?: string; extract_error?: string; files?: { extract_error?: string }[] };

export function libraryUrl(path: string, params: Record<string, string | number>) {
  const target = new URL(path.replace(/^\/+/, ""), document.baseURI);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
  return target.href;
}

export async function listProjects(query: string, offset = 0): Promise<ProjectPage> {
  return window.libraryHost.request<ProjectPage>(libraryUrl("/api/library/projects", { q: query, offset, limit: 100 }));
}

export async function listDirectory(projectId: string, path: string, offset = 0): Promise<EntryPage> {
  return window.libraryHost.request<EntryPage>(libraryUrl("/api/library/list", { project_id: projectId, path, offset, limit: 200 }));
}

export async function postLibrary<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return window.libraryHost.request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export async function uploadLibraryBatch(uploads: readonly UploadItem[], projectId: string, folder: string, request: LibraryRequest): Promise<string[]> {
  const destinationProject = projectId;
  const destinationFolder = folder || ".";
  const failed: string[] = [];
  for (const { file, relDir = "" } of uploads) {
    const relativeDirectory = relDir.replace(/^\/+|\/+$/g, "");
    const path = !relativeDirectory ? destinationFolder : destinationFolder === "." ? relativeDirectory : `${destinationFolder}/${relativeDirectory}`;
    const form = new FormData();
    form.append("project_id", destinationProject);
    form.append("path", path);
    form.append("file", file, file.name);
    try {
      const result = await request<UploadResponse>("/api/library/upload", { method: "POST", body: form, headers: {}, timeoutMs: 120_000 });
      const error = result?.error || result?.extract_error || result?.files?.find((item) => item.extract_error)?.extract_error;
      if (error) failed.push(`${file.name}: ${error}`);
    } catch (error) {
      failed.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return failed;
}

export function libraryPathJoin(parent: string, child: string): string {
  return !parent || parent === "." ? child : `${parent}/${child}`;
}

export function libraryError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  if (error && typeof error === "object" && "error" in error && typeof error.error === "string") return error.error;
  return "Library request failed";
}
