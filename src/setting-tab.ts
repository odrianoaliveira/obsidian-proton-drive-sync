import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type ProtonDriveSyncPlugin from "./main";
import { ProtonDriveSyncClient } from "./client";
import { FileConflictStrategy, FolderConflictStrategy } from "./settings";

export class ProtonDriveSyncSettingTab extends PluginSettingTab {
  private plugin: ProtonDriveSyncPlugin;
  private connectionStatusEl!: HTMLElement;
  private lastSyncEl!: HTMLElement;
  private lastSyncErrorEl!: HTMLElement;

  constructor(app: App, plugin: ProtonDriveSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Proton Drive Sync" });

    // Remote target
    containerEl.createEl("h3", { text: "Remote target" });
    new Setting(containerEl)
      .setName("Remote folder")
      .setDesc("Posix path on Proton Drive; `/my-files` is your 'My files' root. Created automatically if missing.")
      .addText(text => text
        .setPlaceholder("/my-files/Obsidian")
        .setValue(this.plugin.settings.remotePath)
        .onChange(async (value) => {
          this.plugin.settings.remotePath = value.trim();
          await this.plugin.saveSettings();
        })
      );

    // Sync behavior
    containerEl.createEl("h3", { text: "Sync behavior" });
    new Setting(containerEl)
      .setName("Sync automatically on changes")
      .setDesc("Debounced upload when notes are created, modified, deleted, or renamed.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoSync)
        .onChange(async (value) => {
          this.plugin.settings.autoSync = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Debounce (ms)")
      .setDesc("Wait after a change before syncing.")
      .addText(text => text
        .setPlaceholder("3000")
        .setValue(this.plugin.settings.debounceMs.toString())
        .onChange(async (value) => {
          const numValue = parseInt(value, 10);
          if (!isNaN(numValue)) {
            this.plugin.settings.debounceMs = numValue;
            await this.plugin.saveSettings();
          }
        })
      );

    new Setting(containerEl)
      .setName("Periodic sync (minutes)")
      .setDesc("Full sync every N minutes as a fallback. 0 disables. Takes effect after reload.")
      .addText(text => text
        .setPlaceholder("5")
        .setValue(this.plugin.settings.intervalMinutes.toString())
        .onChange(async (value) => {
          const numValue = parseInt(value, 10);
          if (!isNaN(numValue)) {
            this.plugin.settings.intervalMinutes = numValue;
            await this.plugin.saveSettings();
          }
        })
      );

    // Conflict handling
    containerEl.createEl("h3", { text: "Conflict handling" });
    new Setting(containerEl)
      .setName("File conflict strategy")
      .setDesc("What to do when a local file conflicts with a remote file")
      .addDropdown(dropdown => dropdown
        .addOption("create-new-revision", "Create new revision")
        .addOption("rename", "Rename (add suffix)")
        .addOption("replace", "Replace (trash remote)")
        .addOption("skip", "Skip")
        .setValue(this.plugin.settings.fileConflictStrategy)
        .onChange(async (value) => {
          this.plugin.settings.fileConflictStrategy = value as FileConflictStrategy;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Folder conflict strategy")
      .setDesc("What to do when a local folder conflicts with a remote folder")
      .addDropdown(dropdown => dropdown
        .addOption("merge", "Merge")
        .addOption("rename", "Rename (add suffix)")
        .addOption("replace", "Replace (trash remote)")
        .addOption("skip", "Skip")
        .setValue(this.plugin.settings.folderConflictStrategy)
        .onChange(async (value) => {
          this.plugin.settings.folderConflictStrategy = value as FolderConflictStrategy;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Skip thumbnails")
      .setDesc("Don't generate server-side thumbnails during upload.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.skipThumbnails)
        .onChange(async (value) => {
          this.plugin.settings.skipThumbnails = value;
          await this.plugin.saveSettings();
        })
      );

    // Advanced
    containerEl.createEl("h3", { text: "Advanced" });
    new Setting(containerEl)
      .setName("proton-drive binary path")
      .setDesc("Absolute path. Empty auto-resolves to ~/.local/bin/proton-drive, then PATH. Takes effect after reload.")
      .addText(text => text
        .setPlaceholder("")
        .setValue(this.plugin.settings.binaryPath)
        .onChange(async (value) => {
          this.plugin.settings.binaryPath = value.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Ignore folders/files (comma-separated)")
      .setDesc("Top-level vault names to exclude from upload. Defaults to `.obsidian, .trash`. Don't remove `.obsidian` — it would upload your config and plugin binaries.")
      .addText(text => text
        .setPlaceholder(".obsidian, .trash")
        .setValue(this.plugin.settings.ignore.join(", "))
        .onChange(async (value) => {
          this.plugin.settings.ignore = value.split(",").map(s => s.trim()).filter(s => s.length > 0);
          await this.plugin.saveSettings();
        })
      );

    // Connection
    containerEl.createEl("h3", { text: "Connection" });

    const testConnectionSetting = new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Check if the remote folder is accessible");

    testConnectionSetting.addButton(button => button
      .setButtonText("Test connection")
      .onClick(async () => {
        try {
          button.setDisabled(true);
          button.setButtonText("Testing...");
          const result = await this.plugin.client.ensureRemoteFolder(this.plugin.settings.remotePath);
          if (result.ok) {
            new Notice("Connection OK — remote folder is ready");
            this.updateConnectionStatus("✓ Connection successful");
          } else {
            const message = ProtonDriveSyncClient.formatSyncError(result);
            this.updateConnectionStatus(`✗ ${message}`);
          }
        } catch (error) {
          this.updateConnectionStatus(`✗ Error: ${(error as Error).message}`);
        } finally {
          button.setDisabled(false);
          button.setButtonText("Test connection");
        }
      })
    );

    const syncNowSetting = new Setting(containerEl)
      .setName("Sync now")
      .setDesc("Manually trigger a sync");

    syncNowSetting.addButton(button => button
      .setButtonText("Sync now")
      .onClick(async () => {
        try {
          button.setDisabled(true);
          button.setButtonText("Syncing...");
          await this.plugin.sync();
          this.renderLastSync();
        } finally {
          button.setDisabled(false);
          button.setButtonText("Sync now");
        }
      })
    );

    this.connectionStatusEl = containerEl.createEl("p", {
      cls: "proton-drive-connection-status",
      text: " ",
    });

    // Last sync info
    const lastSyncContainer = containerEl.createDiv();
    this.lastSyncEl = lastSyncContainer.createEl("p", { text: "" });
    this.lastSyncErrorEl = lastSyncContainer.createEl("p", {
      cls: "proton-drive-error",
      text: "",
    });
    this.renderLastSync();
  }

  private renderLastSync() {
    this.lastSyncEl.setText(
      "Last sync: " +
        (this.plugin.lastSyncAt
          ? new Date(this.plugin.lastSyncAt).toLocaleString()
          : "Never")
    );
    this.lastSyncErrorEl.setText(this.plugin.lastSyncError ?? "");
  }

  private updateConnectionStatus(message: string) {
    this.connectionStatusEl.setText(message);
    this.connectionStatusEl.removeClass("proton-drive-success");
    this.connectionStatusEl.removeClass("proton-drive-error");

    if (message.startsWith("✓")) {
      this.connectionStatusEl.addClass("proton-drive-success");
    } else if (message.startsWith("✗")) {
      this.connectionStatusEl.addClass("proton-drive-error");
    }
  }
}
