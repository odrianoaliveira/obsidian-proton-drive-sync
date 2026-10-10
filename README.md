# Proton Drive Sync

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An [Obsidian](https://obsidian.md) plugin that syncs your vault to [Proton Drive](https://proton.me/drive)
using the official [Proton Drive CLI](https://proton.me/support/drive-cli).

## Features

- **Event-driven** — debounced uploads when notes are created, modified, renamed, or deleted.
- **Manual** — "Sync now" command (Command Palette) and a settings button.
- **Periodic fallback** — configurable interval (default 5 minutes).
- **Configurable** — remote folder, file/folder conflict strategies, debounce, ignore list, binary path.
- **Status bar + last-sync display**, plus a local `sync.log`.

## How it works

The plugin wraps the `proton-drive` binary (v0.9.0) and performs one-way, additive uploads. It uploads
your vault's top-level entries (excluding `.obsidian/` and `.trash/` by default) into a remote folder
(default `/my-files/Obsidian`), creating that folder if it does not exist yet. Files with unchanged
content are skipped automatically.

## Requirements

- Obsidian **desktop** (the plugin is `isDesktopOnly`).
- The `proton-drive` CLI installed and authenticated (`proton-drive auth login`). The plugin auto-resolves
  `~/.local/bin/proton-drive`, or you can set an absolute path in settings.

## Install (GitHub release)

1. Download `proton-drive-sync.zip` from the [latest release](../../releases/latest).
2. Create the plugin folder and unzip the three files into it:

   ```bash
   mkdir -p "<vault>/.obsidian/plugins/proton-drive-sync"
   unzip proton-drive-sync.zip -d "<vault>/.obsidian/plugins/proton-drive-sync"
   ```

3. Reload Obsidian and enable **Proton Drive Sync** in Settings → Community plugins.

## Install (development)

```bash
cd obsidian-proton-drive-sync
npm install
npm run build
mkdir -p "<vault>/.obsidian/plugins/proton-drive-sync"
cp main.js manifest.json styles.css "<vault>/.obsidian/plugins/proton-drive-sync/"
```

Then enable **Proton Drive Sync** in Settings → Community plugins.

## Development

```bash
npm install
npm run dev      # esbuild watch (rebuild on change)
npm run build    # typecheck + production bundle -> main.js
```

## Settings

- **Remote folder** — Proton Drive path (default `/my-files/Obsidian`).
- **Sync automatically on changes**, **Debounce (ms)**, **Periodic sync (minutes)**.
- **File/folder conflict strategies** — default `create-new-revision` + `merge`.
- **Ignore** — comma-separated top-level vault names to exclude (default `.obsidian, .trash`).
- **Test connection** and **Sync now** buttons, plus a last-sync display.

## Limitations

- **One-way and additive**: locally deleted files are NOT removed remotely. Deletion reconciliation
  (recoverable `trash`-based) is planned for a future version.
- No filesystem watching outside Obsidian — it relies on Obsidian's change events plus the interval.
- Proton Drive has no official sync API; this wraps the CLI's one-shot `filesystem upload`.

## Logs

Sync outcomes are appended to `sync.log` inside the plugin directory
(`<vault>/.obsidian/plugins/proton-drive-sync/sync.log`).

## License

[MIT](LICENSE)
