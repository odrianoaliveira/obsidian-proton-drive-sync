import { Plugin, Notice, TFile, FileSystemAdapter } from "obsidian";
import { DEFAULT_SETTINGS, ProtonDriveSyncSettings } from "./settings";
import { ProtonDriveSyncClient, SyncResult } from "./client";
import { ProtonDriveSyncSettingTab } from "./setting-tab";
import * as path from "path";
import * as fs from "fs";

export default class ProtonDriveSyncPlugin extends Plugin {
  settings: ProtonDriveSyncSettings = { ...DEFAULT_SETTINGS };
  statusBarEl!: HTMLElement;
  client!: ProtonDriveSyncClient;
  private syncing = false;
  private pending = false;
  private debounceTimer: number | null = null;

  async onload() {
    await this.loadSettings();

    // Resolve binary and instantiate client
    const resolvedBinary = ProtonDriveSyncClient.resolveBinary(this.settings.binaryPath);
    this.client = new ProtonDriveSyncClient(resolvedBinary);

    // Status bar
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setText("PD: idle");

    // Commands
    this.addCommand({
      id: "sync-now",
      name: "Sync now",
      callback: () => this.sync(),
    });

    // Event handlers
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        this.scheduleSync();
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        this.scheduleSync();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          this.journalDeletion(file.path, "delete");
          this.scheduleSync();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) {
          this.journalDeletion(oldPath, "rename");
          this.scheduleSync();
        }
      })
    );

    // Periodic sync
    if (this.settings.intervalMinutes > 0) {
      this.registerInterval(
        window.setInterval(
          () => this.sync(),
          this.settings.intervalMinutes * 60000
        )
      );
    }

    this.addSettingTab(new ProtonDriveSyncSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  scheduleSync() {
    if (!this.settings.autoSync) {
      return;
    }
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => this.sync(), this.settings.debounceMs);
  }

  getSyncTargets(): string[] {
    const base = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
    const targets: string[] = [];
    for (const child of this.app.vault.getRoot().children) {
      if (this.settings.ignore.includes(child.name)) {
        continue;
      }
      targets.push(path.join(base, child.path));
    }
    return targets;
  }

  async sync() {
    if (this.syncing) {
      this.pending = true;
      return;
    }

    this.syncing = true;
    this.statusBarEl.setText("PD: syncing…");

    try {
      const targets = this.getSyncTargets();
      if (targets.length === 0) {
        this.statusBarEl.setText("PD: idle (nothing to sync)");
        return;
      }

      const ensured = await this.client.ensureRemoteFolder(this.settings.remotePath);
      if (!ensured.ok) {
        this.reportFailure(ensured);
        return;
      }

      const result = await this.client.upload(
        targets,
        this.settings.remotePath,
        {
          fileStrategy: this.settings.fileConflictStrategy,
          folderStrategy: this.settings.folderConflictStrategy,
          skipThumbnails: this.settings.skipThumbnails,
        }
      );

      if (result.ok) {
        const now = new Date();
        this.statusBarEl.setText(`PD: synced ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`);
      } else {
        this.reportFailure(result);
      }
    } finally {
      this.syncing = false;
      if (this.pending) {
        this.pending = false;
        void this.sync();
      }
    }
  }

  private reportFailure(result: SyncResult) {
    const kind = ProtonDriveSyncClient.classifyError(result.stderr, result.error);
    let message = "Proton Drive sync failed";
    switch (kind) {
      case "not-logged-in":
        message = "Proton Drive: not logged in — run `proton-drive auth login`";
        break;
      case "keyring-locked":
        message = "Proton Drive: keyring locked/unreachable — unlock your session keyring";
        break;
      case "binary-not-found":
        message = "Proton Drive: binary not found";
        break;
      case "other":
        message = `Proton Drive sync error: ${result.stderr.substring(0, 200)}${result.stderr.length > 200 ? "..." : ""}`;
        break;
    }
    new Notice(message);
    this.statusBarEl.setText("PD: error");
  }

  journalDeletion(vaultPath: string, kind: "delete" | "rename") {
    try {
      const journalPath = path.join(
        this.manifest.dir ??
          (this.app.vault.adapter as FileSystemAdapter).getBasePath(),
        "deletion-journal.json"
      );
      let entries: Array<{ path: string; kind: string; timestamp: string }> = [];

      if (fs.existsSync(journalPath)) {
        const content = fs.readFileSync(journalPath, "utf8");
        try {
          entries = JSON.parse(content);
          if (!Array.isArray(entries)) {
            entries = [];
          }
        } catch {
          entries = [];
        }
      }

      entries.push({
        path: vaultPath,
        kind,
        timestamp: new Date().toISOString(),
      });

      fs.writeFileSync(journalPath, JSON.stringify(entries, null, 2));
    } catch {
      // Swallow errors - journaling must never break sync
    }
  }

  onunload() {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
    }
  }
}
