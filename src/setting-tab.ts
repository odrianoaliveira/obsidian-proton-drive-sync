import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

export class ProtonDriveSyncSettingTab extends PluginSettingTab {
  private plugin: Plugin;

  constructor(app: App, plugin: Plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Proton Drive Sync" });
    new Setting(containerEl)
      .setName("Settings")
      .setDesc("Options will be added in a later phase.");
  }
}
