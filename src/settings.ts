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
		const title = header.createEl("h1", {
			text: "Dropbox Connect (Unofficial)",
		});
		title.style.marginBottom = "0";
		const author = header.createEl("small", {
			text: "Author: Justin Bird",
		});

		const spacer = containerEl.createEl("div");
		spacer.style.width = "100%";
		spacer.style.height = "24px";
		spacer.style.margin = "0";

		const content = containerEl.createEl("main");
		content.style.display = "flex";
		content.style.flexDirection = "column";
		content.style.gap = "24px";

		const connectDropboxButton = content.createEl("button", {
			text: "Connect Dropbox",
		});
		connectDropboxButton.onClickEvent(
			this.plugin.dropboxProvider.authorizeDropbox,
		);
		connectDropboxButton.style.background = "#3984FF";
		connectDropboxButton.style.borderRadius = "unset";
		connectDropboxButton.style.color = "#1E1919";
		connectDropboxButton.style.fontSize = "16px";
		connectDropboxButton.style.fontWeight = "600";

		const fetchFileInfoButton = content.createEl("button", {
			text: "Fetch File Info",
		});
		fetchFileInfoButton.onClickEvent(
			this.plugin.dropboxProvider.fetchFileInfo,
		);
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
