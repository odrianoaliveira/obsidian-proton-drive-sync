# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-11

### Added

- Deletion reconciliation: trash remote nodes on Proton Drive that no longer exist in the vault
  (deleted or renamed files and folders). Opt-in via a `reconcileDeletions` toggle, with a
  `reconcileMode` (`dry-run` default | `apply`) and a manual "Reconcile now" button.
- CLI client wrappers `info()` and `trash()` for `filesystem info` / `filesystem trash`.
- `src/reconcile.ts` pure helpers (vault-path normalization, remote-path join, dedup, atomic journal
  writes, corrupt-file backup, merge-before-write).

### Changed

- The deletion journal now records folders (`TFolder`) as well as files, and the rename target
  (`newPath`).

### Fixed

- `sync.log` and the deletion journal were written to a non-existent path and silently dropped,
  because `manifest.dir` is a vault-relative path; it is now resolved against the vault base path.

## [0.1.0] - 2026-10-10

### Added

- Obsidian plugin scaffold (manifest, esbuild build, styles).
- Sync engine wrapping the `proton-drive` CLI: event-driven debounced sync, single-flight, and a
  status-bar indicator.
- Automatic creation of the remote parent folder before upload (the CLI does not auto-create it).
- Settings UI: remote path, file/folder conflict strategies, skip thumbnails, debounce, sync
  interval, auto-sync, binary path, and ignore list, with test-connection and sync-now buttons.
- Deletion journal (`deletion-journal.json`) recording delete/rename events.
- Local sync log (`sync.log`).
- README, LICENSE, and AGENTS.md.
- GitHub Actions release workflow and RELEASING.md.
