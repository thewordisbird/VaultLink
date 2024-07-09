import { Plugin, TFile, TFolder } from "obsidian";
import { DEFAULT_SETTINGS, SettingsTab } from "./settings";
import { DropboxProvider } from ".././providers/dropbox.provider";
import { PubSub } from "../../lib/pubsub";
import type { PluginSettings } from "./settings";
import { dropboxContentHasher } from "src/providers/dropbox.hasher";

type FileData = {
	name: string;
	path: string;
	contentHash: string;
	rev?: string;
};
export default class ObsidianDropboxConnect extends Plugin {
	settings: PluginSettings;
	fileMap = new Map<string, FileData>();
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

		if (await dropboxProvider.getAuthorizationState()) {
			let clientFoldersOrFiles = this.app.vault.getAllLoadedFiles();
			for (let clientFolderOrFile of clientFoldersOrFiles) {
				if (clientFolderOrFile instanceof TFile) {
					console.log(
						"Name:",
						clientFolderOrFile.name,
						"Size:",
						clientFolderOrFile.stat.size / 1024,
					);

					let contentHash = dropboxContentHasher(
						await this.app.vault.readBinary(clientFolderOrFile),
					);

					let { name, path } = clientFolderOrFile;
					this.fileMap.set(path, {
						name,
						path: "/" + path,
						contentHash,
					});
				}
			}

			console.log("fileMap:", this.fileMap);
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
						dropboxProvider.batchCreateFolder(
							`/${this.settings.cloudVaultPath}/${folderOrFile.path}`,
						);
					}

					if (folderOrFile instanceof TFile) {
						console.log("new file created", folderOrFile);
						this.app.vault
							.readBinary(folderOrFile)
							.then((contents) => {
								if (!this.settings.cloudVaultPath) return;
								dropboxProvider.createFile({
									path: `/${this.settings.cloudVaultPath}/${folderOrFile.path}`,
									contents: contents,
								});
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

				dropboxProvider.batchRenameFolderOrFile({
					from_path: fromPath,
					to_path: toPath,
				});
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", (folderOrFile) => {
				console.log("Delete\n", folderOrFile);
				const path = `/${this.settings.cloudVaultPath}/${folderOrFile.path}`;
				dropboxProvider.batchDeleteFolderOrFile(path);
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
