import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, SettingsTab } from "./settings";
import { DropboxProvider } from "./providers/dropbox.provider";
import type { PluginSettings } from "./settings";
import { PubSub } from "../lib/pubsub";

export default class ObsidianDropboxConnect extends Plugin {
	settings: PluginSettings;
	dropboxProvider: DropboxProvider;

	async onload() {
		await this.loadSettings();
		const settingsTab = new SettingsTab(this.app, this);

		const pubsub = new PubSub();

		// Setup Dropbox Provider
		this.dropboxProvider = new DropboxProvider();

		// Retrieve and set new access token if a valid refresh token is stored in local storage
		const refreshToken = localStorage.getItem("dropboxRefreshToken");
		if (refreshToken) {
			this.dropboxProvider.authorizeWithRefreshToken(refreshToken);
		}

		// Set  protocol handler to catch authorization response form dropbox
		this.registerObsidianProtocolHandler(
			"connect-dropbox",
			(protocolData) => {
				// TODO: Handle error if no code is available
				if (!protocolData.code) throw new Error("");

				const codeVerifier =
					window.sessionStorage.getItem("codeVerifier");
				// TOOD: Handle error if no code verifier in sessionStorage
				if (!codeVerifier) throw new Error("");
				this.dropboxProvider.setCodeVerifier(codeVerifier);

				this.dropboxProvider
					.setAccessAndRefreshToken(protocolData.code)
					.then(({ refreshToken }) => {
						// Store Refresh token in local storage for persistant authorization
						localStorage.setItem(
							"dropboxRefreshToken",
							refreshToken,
						);
						this.dropboxProvider.getUserInfo();
					});
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
