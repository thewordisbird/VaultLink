import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, SettingsTab } from "./settings";
import { DropboxProvider } from "./dropboxProvider";
import type { PluginSettings } from "./settings";
import { PubSub } from "./pubsub";

// TODO: create dropbox class

export default class ObsidianDropboxConnect extends Plugin {
	settings: PluginSettings;
	dropboxProvider: DropboxProvider;

	async onload() {
		await this.loadSettings();
		const settingsTab = new SettingsTab(this.app, this);

		const pubsub = new PubSub();

		// Setup Dropbox Provider
		this.dropboxProvider = new DropboxProvider();

		this.registerObsidianProtocolHandler(
			"connect-dropbox",
			(protocolData) => {
				this.dropboxProvider.getAccessToken(protocolData);

				pubsub.publish("authorization-success");
			},
		);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(settingsTab);
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
