import { EventRef, Plugin, TAbstractFile } from "obsidian";
import { DEFAULT_SETTINGS, SettingsTab } from "./settings";
import { DropboxProvider } from ".././providers/dropbox.provider";
import { PubSub } from "../../lib/pubsub";
import { Sync } from "src/sync/sync";
import type { PluginSettings } from "./settings";
import { PubsubTopic } from "../types";
import { providerLongpollError, providerSyncError } from "./notice";

// TODO: Define this type - should not bring dropbox contents into this file
const LONGPOLL_FREQUENCY = 30000;

export default class VaultLink extends Plugin {
	private fileSync: Sync;
	public settings: PluginSettings;

	private longpollIntervalId: number | undefined;

	private handleCreateEventRef: EventRef | undefined;
	private handleModifyEventRef: EventRef | undefined;
	private handleRenameEventRef: EventRef | undefined;
	private handleDeleteEventRef: EventRef | undefined;

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

		this.fileSync = new Sync({
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
				if (!this.settings.cloudVaultPath) return;

				try {
					await this.fileSync.initializeFileMap();
					await this.fileSync.syncRemoteFiles();
					await this.fileSync.syncClientFiles();
				} catch (e) {
					providerSyncError(e);
				}
			},
		);

		pubsub.subscribe(PubsubTopic.AUTHORIZATION_SUCCESS, async () => {
			//TODO: Cloudvault setting should be reset on login. Once that happend
			//need to check if there is a valut setup.
			if (!this.settings.cloudVaultPath) return;
			try {
				await this.fileSync.initializeFileMap();
				await this.fileSync.syncRemoteFiles();
				await this.fileSync.syncClientFiles();
				this.registerPluginIntervals();
				this.registerPluginEventHandlers();
			} catch (e) {
				providerSyncError(e);
			}
		});

		pubsub.subscribe(PubsubTopic.AUTHORIZATION_FAILURE, () => {
			this.clearPluginIntervals();
			this.clearPluginEventHandlers();
		});

		pubsub.subscribe(PubsubTopic.AUTHORIZATION_DISCONNECT, () => {
			this.clearPluginIntervals();
			this.clearPluginEventHandlers();
		});

		// TODO: Create new localStorage property: "provider" in addition to
		//	property: "providerRefreshToken" for eventual scaling
		const refreshToken = localStorage.getItem("dropboxRefreshToken");

		// Automatically authenticate from refresh token
		if (refreshToken) {
			try {
				dropboxProvider.authorizeWithRefreshToken(refreshToken);
				await dropboxProvider.setUserInfo();
				pubsub.publish(PubsubTopic.AUTHORIZATION_SUCCESS);
			} catch (e) {
				pubsub.publish(PubsubTopic.AUTHORIZATION_FAILURE);
			}
		}

		// Add Settings Tab For Plugin
		this.addSettingTab(settingsTab);
	}

	registerPluginIntervals() {
		this.longpollIntervalId = window.setInterval(() => {
			this.fileSync.syncRemoteFilesLongPoll().catch((e) => {
				providerLongpollError(e);
			});
		}, LONGPOLL_FREQUENCY);
		this.registerInterval(this.longpollIntervalId);
	}

	clearPluginIntervals() {
		window.clearInterval(this.longpollIntervalId);
		this.longpollIntervalId = undefined;
	}

	registerPluginEventHandlers() {
		// This avoids running the on create callback on vault load
		this.app.workspace.onLayoutReady(() => {
			this.handleCreateEventRef = this.app.vault.on(
				"create",
				(folderOrFile: TAbstractFile) => {
					this.fileSync
						.reconcileCreateFileOnClient({ folderOrFile })
						.catch((e) => {
							providerSyncError(e);
						});
				},
			);
			this.registerEvent(this.handleCreateEventRef);
		});

		this.handleModifyEventRef = this.app.vault.on(
			"modify",
			(folderOrFile: TAbstractFile) => {
				this.fileSync
					.reconcileClientAhead({ clientFile: folderOrFile })
					.catch((e) => {
						providerSyncError(e);
					});
			},
		);
		this.registerEvent(this.handleModifyEventRef);

		this.handleRenameEventRef = this.app.vault.on(
			"rename",
			(folderOrFile: TAbstractFile, ctx: string) => {
				this.fileSync
					.reconcileMoveFileOnClient({ folderOrFile, ctx })
					.catch((e) => {
						providerSyncError(e);
					});
			},
		);
		this.registerEvent(this.handleRenameEventRef);

		this.handleDeleteEventRef = this.app.vault.on(
			"delete",
			(folderOrFile: TAbstractFile) => {
				this.fileSync
					.reconcileDeletedOnClient({ folderOrFile })
					.catch((e) => {
						providerSyncError(e);
					});
			},
		);
		this.registerEvent(this.handleDeleteEventRef);
	}

	clearPluginEventHandlers() {
		if (this.handleCreateEventRef) {
			this.app.vault.offref(this.handleCreateEventRef);
			this.handleCreateEventRef = undefined;
		}

		if (this.handleModifyEventRef) {
			this.app.vault.offref(this.handleModifyEventRef);
			this.handleModifyEventRef = undefined;
		}

		if (this.handleRenameEventRef) {
			this.app.vault.offref(this.handleRenameEventRef);
			this.handleRenameEventRef = undefined;
		}

		if (this.handleDeleteEventRef) {
			this.app.vault.offref(this.handleDeleteEventRef);
			this.handleDeleteEventRef = undefined;
		}
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
