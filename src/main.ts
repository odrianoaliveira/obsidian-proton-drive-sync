import { Plugin } from "obsidian";
import { ProtonDriveSyncSettingTab } from "./setting-tab";
import { DEFAULT_SETTINGS, ProtonDriveSyncSettings } from "./settings";

export default class ProtonDriveSyncPlugin extends Plugin {
  settings: ProtonDriveSyncSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new ProtonDriveSyncSettingTab(this.app, this));

    // Placeholder command — Phase 2 wires this to the real sync engine.
    this.addCommand({
      id: "sync-now",
      name: "Sync now",
      callback: () => {
        console.log("proton-drive-sync: sync now (placeholder)");
      },
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {}
}
