import { Plugin, TAbstractFile, TFile, TFolder } from "obsidian";
import { DEFAULT_SETTINGS, SettingsTab } from "./settings";
import { DropboxProvider } from ".././providers/dropbox.provider";
import { PubSub } from "../../lib/pubsub";
import type { PluginSettings } from "./settings";
import { DropboxResponse, files } from "dropbox";

interface ClientFileData extends TFile {
	contentHash: string;
	rev?: string;
}

// TODO: Define this type - should not bring dropbox contents into this file
interface RemoteFileData extends files.FileMetadataReference {}

enum SyncStatus {
	synced = "SYNCED",
	clientAhead = "CLIENT_AHEAD",
	remoteAhead = "REMOTE_AHEAD",
	clientNotFound = "CLIENT_NOT_FOUND",
}

export default class ObsidianDropboxConnect extends Plugin {
	settings: PluginSettings;
	fileMap = new Map<string, ClientFileData>();
	cursor: string;

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
		/** END SETUP CLOUD PROVIDERS **/

		/** PROVIDER AUTHENTICATIN`**/
		// Set  protocol handler to catch authorization response form dropbox
		this.registerObsidianProtocolHandler(
			"connect-dropbox",
			// TODO: Extract function
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

		// TODO: Create new localStorage property: "provider" in addition to
		//	property: "providerRefreshToken" for eventual scaling
		const refreshToken = localStorage.getItem("dropboxRefreshToken");

		// Automatically authenticate from refresh token
		if (refreshToken) {
			dropboxProvider.authorizeWithRefreshToken(refreshToken);
		}
		/** END PROVIDER AUTHORIZATION **/

		/** PROVIDER SYNC **/
		if (await dropboxProvider.getAuthorizationState()) {
			/** STARTUP SYNC **/
			// build fileMap from the client files
			const clientFoldersOrFiles = this.app.vault.getAllLoadedFiles();

			await this.buildFileMap({
				provider: dropboxProvider,
				clientFoldersOrFiles,
			});

			this.cursor = await this.syncRemoteFiles({
				provider: dropboxProvider,
			});
			/** END STARTUP SYNC **/

			/** SETUP LONGPOLL **/
			// TODO: Dependency inversion to not be specific to dropboxProvider
			this.registerInterval(
				window.setInterval(async () => {
					// TODO: Extract function
					const { result: longPollResult } =
						await dropboxProvider.dropbox.filesListFolderLongpoll({
							cursor: this.cursor,
						});

					if (!longPollResult.changes) return;

					const { result: filesListFolderResult } =
						await dropboxProvider.dropbox.filesListFolderContinue({
							cursor: this.cursor,
						});

					this.cursor = filesListFolderResult.cursor;

					for (let entry of filesListFolderResult.entries) {
						// TODO: Implement runtime sync
						// TODO: Extract function
						if (entry[".tag"] == "folder") continue;

						// let { result: fileDownloadResult } =
						// 	await dropboxProvider.dropbox.filesDownload({
						// 		path: entry.path_lower!,
						// 	});

						// console.log("download:", fileDownloadResult);
						//
						// console.log(
						// 	"contents:",
						// 	// @ts-ignore
						// 	fileDownloadResult.fileBlob.text(),
						// );
						let file = this.app.vault.getFileByPath(
							entry.path_lower!,
						);
						if (!file) return;
					}

					this.cursor = filesListFolderResult.cursor;
				}, 30000),
			);
		}
		/** END SETUP LONGPOLL **/

		/** SYNC EVENT HANDLERS **/
		this.app.workspace.onLayoutReady(() => {
			// This avoids running the on create callback on vault load
			this.registerEvent(
				// TODO: Extract function
				this.app.vault.on("create", (folderOrFile) => {
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
									callback: (res: any) => {
										// @ts-ignore
										this.fileMap.set(res.path_lower, {
											// @ts-ignore
											rev: res.rev,
											// @ts-ignore
											contentHash: res.content_hash,
										});
									},
								});
							});
					}
				}),
			);
		});

		this.registerEvent(
			// TODO: Extract function
			this.app.vault.on("modify", (folderOrFile) => {
				this.app.vault
					.readBinary(folderOrFile as TFile)
					.then((contents) => {
						if (!this.settings.cloudVaultPath) return;
						const path =
							`/${this.settings.cloudVaultPath}/${folderOrFile.path}`.toLowerCase();
						const localFileData = this.fileMap.get(
							path.toLowerCase(),
						);
						if (!localFileData) return;

						return dropboxProvider.modifyFile({
							path,
							contents,
							rev: localFileData.rev!,
						});
					})
					.then((res) => {
						let contentHash = res?.result.content_hash;
						let rev = res?.result.rev;
						let path = res?.result.path_lower;

						let localFile = this.fileMap.get(path!);
						if (!localFile) return;
						localFile.rev = rev;
						localFile.contentHash = contentHash!;

						console.log("fileMap after Mod:", this.fileMap);
					});
			}),
		);

		this.registerEvent(
			this.app.vault.on("rename", (folderOrFile, ctx) => {
				const fromPath = `/${this.settings.cloudVaultPath}/${ctx}`;
				const toPath = `/${this.settings.cloudVaultPath}/${folderOrFile.path}`;

				let syncData = this.fileMap.get(fromPath.toLowerCase());
				if (!syncData) return;
				this.fileMap.delete(fromPath.toLowerCase());
				this.fileMap.set(toPath.toLowerCase(), { ...syncData });

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
	/** END PROVIDER SYNC **/

	/** Helpers **/
	async buildFileMap(args: {
		provider: DropboxProvider;
		clientFoldersOrFiles: TAbstractFile[];
	}) {
		const { provider, clientFoldersOrFiles } = args;
		for (let clientFolderOrFile of clientFoldersOrFiles) {
			if (!(clientFolderOrFile instanceof TFile)) continue;

			let contentHash = provider.createDropboxContentHash({
				fileData: await this.app.vault.readBinary(clientFolderOrFile),
			});

			let fullPath =
				"/" +
				this.settings.cloudVaultPath +
				"/" +
				clientFolderOrFile.path;

			this.fileMap.set(fullPath.toLowerCase(), {
				...clientFolderOrFile,
				contentHash,
			});
		}
	}

	async syncRemoteFiles(args: {
		provider: DropboxProvider;
	}): Promise<string> {
		const { provider } = args;
		let remoteFiles = await provider.listFiles(
			"/" + this.settings.cloudVaultPath,
		);

		for (let remoteFileMetadata of remoteFiles.files) {
			// TODO: Extract function
			if (remoteFileMetadata[".tag"] != "file") continue;

			let clientFileMetadata = this.fileMap.get(
				remoteFileMetadata.path_lower!,
			);

			let syncStatus = getSyncStatus({
				clientFileMetadata,
				remoteFileMetadata,
			});

			switch (syncStatus) {
				case SyncStatus.synced:
					clientFileMetadata!.rev = remoteFileMetadata.rev;
					break;
				case SyncStatus.clientAhead:
					await this.reconcileClientAhead({
						provider: provider,
						clientFileMetadata: clientFileMetadata!,
					});
					break;
				case SyncStatus.remoteAhead:
					await this.reconcileRemoteAhead({
						provider: provider,
						clientFileMetadata: clientFileMetadata!,
					});
					break;
				case SyncStatus.clientNotFound:
					break;
			}
		}
		return remoteFiles.cursor;
	}
	async reconcileClientAhead(args: {
		provider: DropboxProvider;
		clientFileMetadata: ClientFileData;
	}) {
		console.log("reconcileClientAhead:", args.clientFileMetadata);
		const { provider, clientFileMetadata } = args;
		let clientFile = this.app.vault.getFileByPath(
			clientFileMetadata?.path!,
		);
		let clientFileContents = await this.app.vault.readBinary(clientFile!);
		await provider
			.overwriteFile({
				path:
					"/" +
					this.settings.cloudVaultPath +
					"/" +
					clientFileMetadata?.path!,
				contents: clientFileContents,
			})
			.then((res) => {
				if (!res) return;
				clientFileMetadata!.rev = res.result.rev;
				clientFileMetadata!.contentHash = res.result.content_hash!;
			});
	}

	async reconcileRemoteAhead(args: {
		provider: DropboxProvider;
		clientFileMetadata: ClientFileData;
	}) {
		console.log("reconcileRemoteAhead:", args.clientFileMetadata);
		const { provider, clientFileMetadata } = args;

		const clientFile = this.app.vault.getFileByPath(
			clientFileMetadata.path,
		);
		const remoteFileContents = await provider.downloadFile({
			path:
				"/" +
				this.settings.cloudVaultPath +
				"/" +
				clientFileMetadata?.path!,
		});
		if (!clientFile || !remoteFileContents)
			throw new Error("Error: reconcileRemoteAhead Error");

		this.app.vault.modifyBinary(
			clientFile,
			await remoteFileContents.fileBlob!.arrayBuffer(),
			{ mtime: new Date(remoteFileContents.server_modified).valueOf() },
		);
	}
	/** END HELPERS **/
}

function getSyncStatus(args: {
	clientFileMetadata: ClientFileData | undefined;
	remoteFileMetadata: RemoteFileData;
}): SyncStatus {
	const { clientFileMetadata, remoteFileMetadata } = args;
	if (clientFileMetadata == undefined) {
		return SyncStatus.clientNotFound;
	}

	if (clientFileMetadata.contentHash == remoteFileMetadata.content_hash) {
		return SyncStatus.synced;
	}

	if (
		new Date(clientFileMetadata?.stat.mtime) >
		new Date(remoteFileMetadata.server_modified)
	) {
		return SyncStatus.clientAhead;
	}

	if (
		new Date(clientFileMetadata?.stat.mtime) <
		new Date(remoteFileMetadata.server_modified)
	) {
		return SyncStatus.remoteAhead;
	}
	throw new Error("Sync Error - Invalid sync condition");
}
