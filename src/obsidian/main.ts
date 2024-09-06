import { EventRef, Plugin, TAbstractFile } from "obsidian";
import { PubSub } from "../../lib/pubsub";
import { DEFAULT_SETTINGS, SettingsTab } from "./settings";
import {
	providerLongpollError,
	providerMoveFolderOrFileError,
	providerSyncError,
} from "./notice";
import { DropboxProvider } from "../providers/dropbox.provider";
import { FileSync } from "../sync/file-sync";

import { PubsubTopic } from "../types";
import type { ClientPath, ProviderPath } from "../types";
import type { PluginSettings } from "./settings";

const LONGPOLL_FREQUENCY = 30000;

export default class VaultLink extends Plugin {
	public settings: PluginSettings;
	private fileSync: FileSync;
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
		const provider = new DropboxProvider();

		this.fileSync = new FileSync({
			obsidianApp: this.app,
			settings: this.settings,
			provider: provider,
		});
		/** END SETUP CLOUD PROVIDERS **/

		/** PROVIDER AUTHENTICATIN`**/
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

				provider.setCodeVerifier(codeVerifier);
				provider
					.setAccessAndRefreshToken(protocolData.code)
					.then(({ refreshToken }) => {
						localStorage.setItem(
							"dropboxRefreshToken",
							refreshToken,
						);
						return provider.setUserInfo();
					})
					.then(() => {
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

				const providerPath = ("/" + payload) as ProviderPath;
				const providerPathDisplay = payload as ClientPath;

				if (this.settings.providerPath == providerPath) return;

				this.settings.providerPath = providerPath;
				this.settings.providerPathDisplay = providerPathDisplay;

				await this.saveSettings();
				if (!this.settings.providerPath) return;

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
			if (!this.settings.providerPath) return;
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
				provider.authorizeWithRefreshToken(refreshToken);
				await provider.setUserInfo();
				pubsub.publish(PubsubTopic.AUTHORIZATION_SUCCESS);
			} catch (e) {
				pubsub.publish(PubsubTopic.AUTHORIZATION_FAILURE);
			}
		}

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
					.reconcileMoveFolderOrFileOnClient({ folderOrFile, ctx })
					.catch((e) => {
						providerMoveFolderOrFileError(e);
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

	onunload() {
		// TODO: Remove all local storage data
	}

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
