import { Plugin, TFile, TFolder } from "obsidian";
import { DEFAULT_SETTINGS, SettingsTab } from "./settings";
import { DropboxProvider } from ".././providers/dropbox.provider";
import { PubSub } from "../../lib/pubsub";
import type { PluginSettings } from "./settings";

export default class ObsidianDropboxConnect extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();
		const settingsTab = new SettingsTab(this.app, this);

		const pubsub = new PubSub();

		// Setup Dropbox Provider
		const dropboxProvider = new DropboxProvider();

		/** PROVIDER AUTHENTICATIN`**/
		// Retrieve and set new access token if a valid refresh token is stored in local storage
		const refreshToken = localStorage.getItem("dropboxRefreshToken");
		if (refreshToken) {
			dropboxProvider.authorizeWithRefreshToken(refreshToken);
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
				dropboxProvider.setCodeVerifier(codeVerifier);

				dropboxProvider
					.setAccessAndRefreshToken(protocolData.code)
					.then(({ refreshToken }) => {
						// Store Refresh token in local storage for persistant authorization
						localStorage.setItem(
							"dropboxRefreshToken",
							refreshToken,
						);
						dropboxProvider.getUserInfo();
					});
				pubsub.publish("authorization-success");
			},
		);

		/** END PROVIDER AUTHORIZATION **/

		/** SYNC EVENT HANDLERS **/
		this.app.workspace.onLayoutReady(() => {
			// This avoids running the on create callback on vault load
			this.registerEvent(
				this.app.vault.on("create", (folderOrFile) => {
					console.log("Running inside onLayoutReady");
					console.log(folderOrFile);

					if (folderOrFile instanceof TFolder) {
						console.log("new folder created");

						dropboxProvider.createFolder(
							`/${this.settings.cloudVaultPath}/${folderOrFile.path}`,
						);
					}

					if (folderOrFile instanceof TFile) {
						console.log("new file created");
						this.app.vault
							.readBinary(folderOrFile)
							.then((contents) => {
								if (!this.settings.cloudVaultPath) return;
								dropboxProvider.createFile(
									`/${this.settings.cloudVaultPath}/${folderOrFile.path}`,
									contents,
								);
							});
					}
				}),
			);
		});

		this.registerEvent(
			// TODO: handle sync on load
			this.app.vault.on("create", (folderOrFile) => {}),
		);

		this.registerEvent(
			this.app.vault.on("modify", (folderOrFile) => {
				/*
				this.app.vault
					.readBinary(folderOrFile as TFile)
					.then((contents) => {
						if (!this.settings.cloudVaultPath) return;
						dropboxProvider.uploadFile({
							path: `/${this.settings.cloudVaultPath}/${folderOrFile.path}`,
							contents,
						});
					});
				*/
			}),
		);

		this.registerEvent(
			this.app.vault.on("rename", (folderOrFile, ctx) => {
				const fromPath = `/${this.settings.cloudVaultPath}/${ctx}`;
				const toPath = `/${this.settings.cloudVaultPath}/${folderOrFile.path}`;

				dropboxProvider.renameFolderOrFile(fromPath, toPath);
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", (folderOrFile) => {
				console.log("Delete\n", folderOrFile);
				const path = `/${this.settings.cloudVaultPath}/${folderOrFile.path}`;
				dropboxProvider.deleteFolderOrFile(path);
			}),
		);

		/** END SYNC EVENT HANDLERS **/

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
