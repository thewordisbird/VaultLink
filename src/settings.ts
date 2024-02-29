import { App, PluginSettingTab } from "obsidian";
import ObsidianDropboxConnect from "./main";

export interface PluginSettings {}

export const DEFAULT_SETTINGS: PluginSettings = {};

export class SettingsTab extends PluginSettingTab {
	plugin: ObsidianDropboxConnect;

	constructor(app: App, plugin: ObsidianDropboxConnect) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const header = containerEl.createEl("header");
		header.createEl("h1", { text: "Dropbox Connect (Unofficial)" });
		header.createEl("small", { text: "Author: Justin Bird" });

		const content = containerEl.createEl("main");
		const connectDropboxButton = content.createEl("button", {
			text: "Connect Dropbox",
		});
		connectDropboxButton.onClickEvent(this.plugin.authorizeDropbox);
		connectDropboxButton.style.background = "blue";
		connectDropboxButton.style.borderRadius = "unset";

		const fetchFileInfoButton = content.createEl("button", {
			text: "Fetch File Info",
		});
		fetchFileInfoButton.onClickEvent(this.plugin.fetchFileInfo);
		fetchFileInfoButton.style.borderColor = "blue";
		fetchFileInfoButton.style.borderRadius = "unset";

		// new Setting(containerEl)
		// 	.setName("Setting #1")
		// 	.setDesc("It's a secret")
		// 	.addText((text) =>
		// 		text
		// 			.setPlaceholder("Enter your secret")
		// 			.setValue(this.plugin.settings.mySetting)
		// 			.onChange(async (value) => {
		// 				this.plugin.settings.mySetting = value;
		// 				await this.plugin.saveSettings();
		// 			}),
		// 	);
	}
}
