# Releasing

Releases are built and published automatically by GitHub Actions when you push a version tag
(`.github/workflows/release.yml`).

## Cut a release

1. Bump the version in **both** files so they stay in sync:
   - `manifest.json` → `"version"`
   - `package.json` → `"version"`
2. Update `CHANGELOG.md`: rename the `[Unreleased]` heading to `[X.Y.Z] - YYYY-MM-DD`, curate the
   entries under **Added**/**Changed**/**Fixed**, and add a fresh empty `[Unreleased]` section at
   the top.
3. Commit the version bump and the changelog together:
   ```bash
   git commit -am "vX.Y.Z"
   ```
4. Tag and push:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
5. The `Release` workflow runs `npm ci && npm run build`, packages `main.js` + `manifest.json` +
   `styles.css` into `proton-drive-sync.zip`, and creates a GitHub release whose notes are the
   `[X.Y.Z]` section of `CHANGELOG.md`.

Watch it with `gh run watch` or in the Actions tab. The release appears under
[Releases](../../releases) when it finishes.

## Install from a release (users)

1. Download `proton-drive-sync.zip` from the [latest release](../../releases/latest).
2. Create the plugin folder and unzip the three files into it:
   ```bash
   mkdir -p "<vault>/.obsidian/plugins/proton-drive-sync"
   unzip proton-drive-sync.zip -d "<vault>/.obsidian/plugins/proton-drive-sync"
   ```
3. Reload Obsidian and enable **Proton Drive Sync** in Settings → Community plugins.

## Roadmap

- Publishing to the Obsidian community plugin directory (requires `versions.json` and a manifest
  that meets the community submission requirements) — not needed for the v1 manual-install flow.
