import { Plugin, Notice, TFile, TFolder, FileSystemAdapter } from "obsidian";
import { DEFAULT_SETTINGS, ProtonDriveSyncSettings } from "./settings";
import { ProtonDriveSyncClient, SyncResult } from "./client";
import { ProtonDriveSyncSettingTab } from "./setting-tab";
import * as path from "path";
import * as fs from "fs";
import * as reconcile from "./reconcile";

export default class ProtonDriveSyncPlugin extends Plugin {
  settings: ProtonDriveSyncSettings = { ...DEFAULT_SETTINGS };
  statusBarEl!: HTMLElement;
  client!: ProtonDriveSyncClient;
  lastSyncAt: number | null = null;
  lastSyncError: string | null = null;
  private syncing = false;
  private reconciling = false;
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
        if (file instanceof TFile || file instanceof TFolder) {
          this.journalDeletion(file.path, "delete");
          this.scheduleSync();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile || file instanceof TFolder) {
          this.journalDeletion(oldPath, "rename", file.path);
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
      const ensured = await this.client.ensureRemoteFolder(this.settings.remotePath);
      if (!ensured.ok) {
        this.reportFailure(ensured);
        return;
      }

      const targets = this.getSyncTargets();
      if (targets.length > 0) {
        this.log(`uploading ${targets.length} targets to ${this.settings.remotePath}`);
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
          this.lastSyncAt = Date.now();
          this.lastSyncError = null;
          this.log(`sync ok: ${result.stdout.trim()}`);
          this.statusBarEl.setText(`PD: synced ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`);
        } else {
          this.reportFailure(result);
          return;
        }
      } else {
        const now = new Date();
        this.lastSyncAt = Date.now();
        this.lastSyncError = null;
        this.statusBarEl.setText("PD: idle (nothing to sync)");
      }

      await this.reconcileDeletions();
    } catch (err) {
      this.reportFailure({
        ok: false,
        code: null,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        error: "sync-threw",
      });
    } finally {
      this.syncing = false;
      if (this.pending) {
        this.pending = false;
        void this.sync();
      }
    }
  }

  async reconcileDeletions(): Promise<{ actioned: string[] }> {
    if (!this.settings.reconcileDeletions) {
      return { actioned: [] };
    }
    if (this.reconciling) {
      return { actioned: [] };
    }

    this.reconciling = true;
    try {
      const journalPath = path.join(this.getPluginDir(), "deletion-journal.json");
      const base = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
      const remotePath = this.settings.remotePath;

      const snapshot = reconcile.readJournal(journalPath);
      const cutoff = new Date().toISOString();

      if (snapshot.length === 0) {
        return { actioned: [] };
      }

      const pending = reconcile.dedupByPath(snapshot);
      const actioned: string[] = [];
      const resolved = new Set<string>();
      let trashedCount = 0;

      for (const entry of pending) {
        const p = reconcile.normalizeVaultPath(entry.path);
        if (p === null) {
          resolved.add(entry.path);
          continue;
        }

        const localAbs = path.join(base, p);
        if (fs.existsSync(localAbs)) {
          resolved.add(entry.path);
          continue;
        }

        const r = reconcile.joinRemote(remotePath, p);
        const info = await this.client.info(r);

        if (info.ok) {
          actioned.push(r);
          if (this.settings.reconcileMode === "apply") {
            const trashed = await this.client.trash([r]);
            if (trashed.ok) {
              resolved.add(entry.path);
              trashedCount++;
              this.log(`trashed ${r} (journal path ${entry.path})`);
            } else if (reconcile.isNodeNotFound(trashed.stderr)) {
              resolved.add(entry.path);
            } else {
              this.log(`reconcile aborted due to error on ${r}: ${trashed.stderr}`);
              break;
            }
          } else {
            this.log(`[reconcile dry-run] would trash ${r}`);
          }
        } else if (reconcile.isNodeNotFound(info.stderr)) {
          resolved.add(entry.path);
          continue;
        } else {
          this.log(`reconcile aborted due to error on ${r}: ${info.stderr}`);
          break;
        }
      }

      if (this.settings.reconcileMode === "apply") {
        const fresh = reconcile.readJournal(journalPath);
        const remaining = reconcile.mergeJournal(fresh, resolved, cutoff);
        reconcile.writeJournalAtomic(journalPath, remaining);
        if (trashedCount > 0) {
          new Notice(`Proton Drive: moved ${trashedCount} remote item(s) to trash`);
        }
      }

      return { actioned };
    } catch (err) {
      this.log(`reconcileDeletions error: ${err instanceof Error ? err.message : String(err)}`);
      return { actioned: [] };
    } finally {
      this.reconciling = false;
    }
  }

  async reconcileNow(): Promise<void> {
    if (!this.settings.reconcileDeletions) {
      new Notice("Proton Drive: enable 'Reconcile deletions' in settings first");
      return;
    }
    if (this.syncing || this.reconciling) {
      new Notice("Proton Drive: sync/reconcile already running");
      return;
    }

    if (this.settings.reconcileMode === "dry-run") {
      const { actioned } = await this.reconcileDeletions();
      new Notice(`Reconcile dry-run: ${actioned.length} file(s) would be trashed`);
      return;
    }

    if (this.settings.reconcileMode === "apply") {
      await this.sync();
      return;
    }
  }

  private reportFailure(result: SyncResult) {
    const message = `Proton Drive: ${ProtonDriveSyncClient.formatSyncError(result)}`;
    this.lastSyncError = message;
    this.log(`sync failed: ${message}`);
    new Notice(message);
    this.statusBarEl.setText("PD: error");
  }

  private getPluginDir(): string {
    const base = (this.app.vault.adapter as FileSystemAdapter).getBasePath();
    const dir = this.manifest.dir;
    // manifest.dir is a vault-relative path (e.g. ".obsidian/plugins/proton-drive-sync"),
    // not an absolute filesystem path.
    return dir ? path.join(base, dir) : base;
  }

  private log(message: string) {
    try {
      const logPath = path.join(this.getPluginDir(), "sync.log");
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
    } catch {
      // logging must never break sync
    }
  }

  journalDeletion(vaultPath: string, kind: "delete" | "rename", newPath?: string) {
    try {
      const journalPath = path.join(this.getPluginDir(), "deletion-journal.json");
      const entries: reconcile.DeletionJournalEntry[] = reconcile.readJournal(journalPath);

      entries.push({
        path: vaultPath,
        kind,
        timestamp: new Date().toISOString(),
        ...(newPath ? { newPath } : {}),
      });

      reconcile.writeJournalAtomic(journalPath, entries);
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
