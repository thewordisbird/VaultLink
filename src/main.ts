import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, SettingsTab } from "./settings";
import { DropboxProvider } from "./dropbox";
import type { PluginSettings } from "./settings";

// TODO: create dropbox class

export default class ObsidianDropboxConnect extends Plugin {
	settings: PluginSettings;
	dropboxProvider: DropboxProvider;

	async onload() {
		await this.loadSettings();

		// Setup Dropbox Provider
		this.dropboxProvider = new DropboxProvider();

		this.registerObsidianProtocolHandler(
			"connect-dropbox",
			this.dropboxProvider.getAccessToken,
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingsTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
