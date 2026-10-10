# AGENTS.md

Guidance for AI coding agents (and future maintainers) working on this repository.

## What this is

An Obsidian desktop plugin (`proton-drive-sync`) that syncs the vault to Proton Drive by wrapping the
official `proton-drive` CLI. One-way, additive uploads. There is no official Proton Drive sync API — the
CLI is the integration point.

## Layout

- `src/main.ts` — plugin entry (`ProtonDriveSyncPlugin`): event wiring, debounce, single-flight `sync()`,
  status bar, deletion journal, logging.
- `src/client.ts` — `ProtonDriveSyncClient`: spawns the CLI (`run`), plus `list`, `createFolder`,
  `ensureRemoteFolder`, `upload`, `classifyError`, `formatSyncError`.
- `src/settings.ts` — settings model + defaults + `FileConflictStrategy`/`FolderConflictStrategy` unions.
- `src/setting-tab.ts` — settings UI (`ProtonDriveSyncSettingTab`).
- `manifest.json` — `isDesktopOnly: true`, `minAppVersion: 1.14.4`.
- `styles.css` — success/error status colors.

## Commands

```bash
npm install
npm run dev        # esbuild watch
npm run build      # tsc -noEmit + esbuild production -> main.js
```

Install into a vault for testing: copy `main.js`, `manifest.json`, `styles.css` into
`<vault>/.obsidian/plugins/proton-drive-sync/`, then reload Obsidian.

## Release process

Releases are built by `.github/workflows/release.yml` on tag push (`v*`): it runs
`npm ci && npm run build`, packages `main.js` + `manifest.json` + `styles.css` into
`proton-drive-sync.zip`, and creates a GitHub release. To cut one: bump `version` in `manifest.json`
and `package.json`, commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`. See `RELEASING.md`.

## Verified Proton Drive CLI facts (do not re-derive)

CLI `proton-drive` v0.9.0, auth via gnome-keyring/Secret Service.

- There is NO `sync`/`watch`/continuous command — only one-shot `filesystem upload/download`.
- `filesystem upload [-f STRATEGY] [-d STRATEGY] [-t] [-j] localPath... parentPath`
  - `-f` (file): `create-new-revision` | `rename` | `replace` | `skip`
  - `-d` (folder): `merge` | `rename` | `replace` | `skip`
  - `-t` skip thumbnails; `-j` JSON output; unchanged files auto-skipped.
- `replace` means "trash the remote file/folder and upload" — destructive; default to
  `create-new-revision` + `merge`.
- The CLI does NOT auto-create the remote parent folder. `upload` to a missing parent fails with
  "Node not found: <name>". Hence `ensureRemoteFolder` runs before every upload.
- A FOLDER `localPath` lands as `parentPath/<basename>` (structure preserved); a FILE `localPath` lands
  as `parentPath/<basename>` (flattened). Never pass individual files for nested content.
- `filesystem list|create-folder|trash|restore|delete|empty-trash|move|rename|copy|download` also exist.

## Key design decisions & gotchas

- Import Node builtins WITHOUT the `node:` prefix (e.g. `import { spawn } from "child_process"`). esbuild
  `platform` is browser and `builtin-modules` exports bare names — `node:child_process` breaks bundling.
- Strategy settings are union literals, not `string` (compile-time typo detection). Dropdowns cast via
  `value as FileConflictStrategy`.
- `getSyncTargets()` returns TOP-LEVEL vault children only (folders whole, files individually), filtering
  top-level `ignore` names (`.obsidian`, `.trash`). Do NOT recurse into files — that flattens the tree.
- `sync()` is single-flight (`syncing`/`pending`) and never rejects (try/catch/finally routes errors to
  `reportFailure`).
- Binary resolution: `~/.local/bin/proton-drive` then PATH, via `os.homedir()` (no `~`, no `shell:true`).
- Deletion/rename events are journaled to `<plugin dir>/deletion-journal.json` (unused until the deletion
  reconciliation feature lands).

## Settings (defaults)

`remotePath` `/my-files/Obsidian`, `fileConflictStrategy` `create-new-revision`,
`folderConflictStrategy` `merge`, `skipThumbnails` `true`, `debounceMs` `3000`, `intervalMinutes` `5`,
`autoSync` `true`, `binaryPath` `""`, `ignore` `[".obsidian", ".trash"]`.

## Deferred / roadmap

- **Deletion reconciliation** (v1.1): replay `deletion-journal.json` against `filesystem list` and issue
  `filesystem trash` for orphans, behind a toggle. Journaling is already in place.
- `sync.log` has no rotation; `lastSyncAt` is in-memory only.

## Local machine context (this user)

The active vault is `~/Sync/Obsidian/ASO` (inside `~/Sync`). A systemd user timer
(`~/.config/systemd/user/proton-drive-sync.timer`, 15 min) runs `~/.local/bin/proton-drive-sync` to sync
non-vault `~/Sync` content → `/my-files/Sync`; this plugin syncs the vault → `/my-files/Obsidian`.
