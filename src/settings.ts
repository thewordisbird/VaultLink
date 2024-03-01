import { App, Setting, PluginSettingTab } from "obsidian";
import ObsidianDropboxConnect from "./main";
import { PubSub } from "./pubsub";

export interface PluginSettings {}

export const DEFAULT_SETTINGS: PluginSettings = {};

export class SettingsTab extends PluginSettingTab {
	plugin: ObsidianDropboxConnect;

	constructor(app: App, plugin: ObsidianDropboxConnect) {
		super(app, plugin);
		this.plugin = plugin;

		// Register pubsub subscriptions
		const pubsub = new PubSub();
		pubsub.subscribe("authorization-success", () => {
			console.log("pubsub works!");
			const dropboxButton = document.getElementById("dbx-btn");
			dropboxButton?.hide();
		});
	}

	display() {
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

		new Setting(containerEl).addButton((componenet) => {
			const button = componenet.buttonEl;
			button.setText("Connect To Dropbox");
			button.id = "dbx-btn";
			button.onClickEvent(() =>
				this.plugin.dropboxProvider.authorizeDropbox(),
			);
		});
	}
}
