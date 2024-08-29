import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, SettingsTab } from "./settings";
import { DropboxProvider } from ".././providers/dropbox.provider";
import { PubSub } from "../../lib/pubsub";
import { Sync } from "src/sync/sync";
import type { PluginSettings } from "./settings";
import { PubsubTopic } from "../types";
import { providerSyncError } from "./notice";

// TODO: Define this type - should not bring dropbox contents into this file
const LONGPOLL_FREQUENCY = 30000;

export default class VaultLink extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();
		const settingsTab = new SettingsTab(this.app, this);

		const pubsub = new PubSub();

		/** SETUP CLOUD PROVIDERS **/
		// TODO: This should be dynamic and not instantiated only by
		// - reading the eventual localstorage provider property
		// - set when the client selects the provider
		// and then be seta as a more general name - provider
		const dropboxProvider = new DropboxProvider();

		const fileSync = new Sync({
			obsidianApp: this.app,
			settings: this.settings,
			provider: dropboxProvider,
		});
		/** END SETUP CLOUD PROVIDERS **/

		/** PROVIDER AUTHENTICATIN`**/
		// Set  protocol handler to catch authorization response form dropbox
		this.registerObsidianProtocolHandler(
			"connect-dropbox",
			// TODO: Extract function
			(protocolData) => {
				if (!protocolData.code) {
					pubsub.publish(PubsubTopic.AUTHORIZATION_FAILURE);
					return;
				}

				const codeVerifier =
					window.sessionStorage.getItem("codeVerifier");
				if (!codeVerifier) {
					pubsub.publish(PubsubTopic.AUTHORIZATION_FAILURE);
					return;
				}

				dropboxProvider.setCodeVerifier(codeVerifier);
				dropboxProvider
					.setAccessAndRefreshToken(protocolData.code)
					.then(({ refreshToken }) => {
						localStorage.setItem(
							"dropboxRefreshToken",
							refreshToken,
						);
						dropboxProvider.setUserInfo();
						pubsub.publish(PubsubTopic.AUTHORIZATION_SUCCESS);
					})
					.catch((_e) => {
						pubsub.publish(PubsubTopic.AUTHORIZATION_FAILURE);
					});
			},
		);

		pubsub.subscribe(
			PubsubTopic.SET_VAULT_PATH,
			async (args: { payload: string }) => {
				const { payload } = args;

				if (this.settings.cloudVaultPath == payload) {
					console.log("No Change to vault path - returning");
					return;
				}

				this.settings.cloudVaultPath = payload;
				await this.saveSettings();

				await fileSync.initializeFileMap();
				await fileSync.syncRemoteFiles();
				await fileSync.syncClientFiles();
			},
		);

		// TODO: Create new localStorage property: "provider" in addition to
		//	property: "providerRefreshToken" for eventual scaling
		const refreshToken = localStorage.getItem("dropboxRefreshToken");

		// Automatically authenticate from refresh token
		if (refreshToken) {
			dropboxProvider.authorizeWithRefreshToken(refreshToken);
			dropboxProvider.setUserInfo();
			pubsub.publish(PubsubTopic.AUTHORIZATION_SUCCESS);
		}
		/** END PROVIDER AUTHORIZATION **/

		/** PROVIDER SYNC **/
		if (await dropboxProvider.getAuthorizationState()) {
			/** STARTUP SYNC **/
			await fileSync.initializeFileMap();
			await fileSync.syncRemoteFiles();
			/** END STARTUP SYNC **/

			/** SETUP LONGPOLL **/
			// TODO: Dependency inversion to not be specific to dropboxProvider
			this.registerInterval(
				window.setInterval(() => {
					dropboxProvider.dropbox
						.filesListFolderLongpoll({
							cursor: fileSync.cursor!,
						})
						.then((res) => {
							if (!res.result.changes) return;
							return fileSync.syncRemoteFilesLongPoll({
								cursor: fileSync.cursor!,
							});
						});
				}, LONGPOLL_FREQUENCY),
			);
		}
		/** END SETUP LONGPOLL **/

		/** SYNC EVENT HANDLERS **/
		this.app.workspace.onLayoutReady(() => {
			// This avoids running the on create callback on vault load
			this.registerEvent(
				this.app.vault.on("create", (folderOrFile) => {
					fileSync
						.reconcileCreateFileOnClient({ folderOrFile })
						.catch((e) => {
							providerSyncError(e);
						});
				}),
			);
		});

		this.registerEvent(
			// TODO: Extract function
			this.app.vault.on("modify", (folderOrFile) => {
				fileSync
					.reconcileClientAhead({ clientFile: folderOrFile })
					.catch((e) => {
						providerSyncError(e);
					});
			}),
		);

		this.registerEvent(
			this.app.vault.on("rename", (folderOrFile, ctx) => {
				fileSync
					.reconcileMoveFileOnClient({ folderOrFile, ctx })
					.catch((e) => {
						providerSyncError(e);
					});
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", (folderOrFile) => {
				fileSync
					.reconcileDeletedOnClient({ folderOrFile })
					.catch((e) => {
						providerSyncError(e);
					});
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
