# 0001 — Do not build an Android/mobile extension yet

- Date: 2026-10-13
- Status: Accepted

## Context

The plugin syncs the vault to Proton Drive by shelling out to the official
`proton-drive` CLI (via `child_process.spawn`) and authenticating through
gnome-keyring/Secret Service over DBus. A question was raised whether this
plugin could be installed on Obsidian for Android.

Investigation found two independent blockers to running the current plugin on
mobile:

1. `manifest.json` sets `isDesktopOnly: true`, so Obsidian mobile will not load
   it at all.
2. The architecture is desktop-only regardless of that flag: it requires a
   Node.js runtime (`child_process`, `os`, `fs`), an executable
   `proton-drive` binary, and a DBus keyring — none of which exist in Obsidian's
   sandboxed mobile (Capacitor) runtime.

The follow-up question was whether a mobile port could instead talk to Proton
Drive directly over HTTP. Research findings:

- Proton Drive's HTTP API is **undocumented and reverse-engineered**, not a
  supported public API. rclone's Proton Drive backend explicitly warns that
  there is no official API documentation.
- Auth is **SRP (username + password + optional 2FA)**, not browser OAuth.
  Working non-desktop clients (`ProtonMail/go-proton-api`, rclone) prove login
  is possible without a keyring or browser flow.
- An official **TypeScript SDK** exists (`ProtonDriveApps/sdk`) — the same code
  the official CLI (itself built with Bun) and Proton's own apps use — but it is
  explicitly an **early preview, "not ready for public use"**, with no support
  commitment.
- A direct-API port is not just `fetch` calls: Proton Drive is client-side
  end-to-end encrypted, so the port would have to reimplement file/folder/link/
  keys/revision crypto handling in JS/TS. This is a substantial, risky effort.

## Decision

We will **not** build an Android/mobile extension at this time. The plugin
remains desktop-only, and the desktop CLI integration stays the single
integration point.

We will re-evaluate when the following prerequisites are met:

1. The official Proton TypeScript SDK (`ProtonDriveApps/sdk`) reaches a stable
   release (1.0) with real public documentation.
2. SRP authentication is confirmed to work from a mobile webview context (rclone
   and go-proton-api already demonstrate it outside a browser, so this is a
   de-risking check rather than an open question).

## Consequences

- Mobile users continue to rely on Proton Drive's own Android/iOS apps, with no
  in-vault Obsidian integration.
- No effort is spent reimplementing Proton's E2E encryption against an
  undocumented, unstable API.
- A future mobile port has a clear, concrete trigger condition (stable SDK +
  docs) rather than an open-ended effort.

### Watchlist

- `github.com/ProtonDriveApps/sdk` — for a stable/1.0 release.
- `proton.me/developers` — for official API documentation.
- `github.com/ProtonMail/go-proton-api` and rclone's Proton Drive backend — as
  reference implementations if a from-scratch JS port becomes necessary.

## Alternatives considered

| Option | Effort | Risk | Outcome |
| --- | --- | --- | --- |
| Keep desktop CLI plugin (status quo) | none | none | **Chosen** |
| Port to the official TS SDK now | large | high — SDK preview, no docs, no support | Rejected |
| Port go-proton-api/rclone approach to TS (reverse-engineered) | very large | high — undocumented, breakage-prone | Rejected |
| Use Proton Drive's own mobile app alongside Obsidian | none | none | Not an integration; unchanged |
