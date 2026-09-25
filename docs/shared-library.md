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
