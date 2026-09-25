# Shared Library

The Library stores project reference files separately from chat projects and workspaces. It is shared by every profile in this WebUI instance.

## Create and use a project

1. Open **Library** and create a project. Project names are labels; renaming a project does not move its files.
2. Select the project, create folders, and upload files or a folder. ZIP and TAR uploads use the WebUI's archive extraction limits.
3. In chat, type `@` and choose a project, or use **Mention in chat**. The WebUI inserts an editable reference into the message draft. It does not send the message, change the current workspace, or grant the agent new filesystem permissions.

The reference tells the agent to inspect relevant files as needed and keep the current workspace. It is guidance, not an enforced read-only boundary. Do not treat files in the Library as trusted instructions.

Profiles using a local agent can read the referenced Library folder. A remote SSH or container profile cannot access the WebUI host's Library folder; the reference request is rejected for that profile. Browsing and managing the Library in the WebUI remain available.

## Sharing and backups

All callers admitted to this WebUI can manage the shared Library; it has no per-project access controls. Do not put content there that should remain private to one profile or person.

Library data is stored at `HERMES_WEBUI_STATE_DIR/library` (or the configured WebUI state directory's `library` subfolder). Include that directory in backups. The repository checkout does not contain uploaded Library files.

## Develop the React interface

Library is the first React screen in the WebUI. Its React 19 and TypeScript source lives in `frontend/Library.tsx`, with shadcn/ui primitives in `frontend/components/ui`. Tailwind classes use the `lib-` prefix and scoped styles so they do not restyle chat or other panels.

The Python backend and `/api/library/*` endpoints are unchanged. `static/library-host.js` connects React to the existing request handling, translations, mobile drawer, and composer. Navigation calls `loadLibrary()` to refresh the React screen. The previous `static/library.js` renderer has been removed.

From the repository root, using Node 22 or newer:

```sh
npm ci
npm run typecheck:library
npm run test:library
npm run build:library
```

Commit `package-lock.json` and both generated assets, `static/library-react.js` and `static/library-react.css`, alongside source changes. They are served by Python and cached with the application's existing version key. Running the WebUI does not require Node or a Vite server. Restart a development Python server after rebuilding so its asset version is refreshed.

The migration does not change the known native PDF preview limitation: sandboxed PDFs may not render in some browsers. Use **Download** when that happens. The iframe sandbox remains enabled.
