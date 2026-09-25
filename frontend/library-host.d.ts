export interface LibraryRequestOptions {
  method?: string;
  body?: string | FormData;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface LibraryHost {
  request<T>(path: string, options?: LibraryRequestOptions): Promise<T>;
  translate(key: string, fallback: string): string;
  closeDrawer(): void;
  collectDrop(transfer: DataTransfer): Promise<Array<{file: File; relDir: string}>>;
  mention(projectId: string): Promise<void>;
  context(): string;
}

declare global {
  interface Window {
    libraryHost: LibraryHost;
    HermesLibrary: { refresh(): void };
  }
}
