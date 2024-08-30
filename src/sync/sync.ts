import { App, Notice, TAbstractFile, TFile, TFolder } from "obsidian";
import { PluginSettings } from "src/obsidian/settings";
import { Provider } from "src/providers/types";
import type { files } from "dropbox";
import {
	batch,
	convertRemoteToClientPath,
	RemoteFilePath,
	sanitizeRemotePath,
} from "src/utils";
import {
	obsidianFileRetrievalError,
	providerSyncError,
} from "src/obsidian/notice";

type FileSyncMetadata = TFile & {
	remotePath: RemoteFilePath;
	rev: string | undefined;
	fileHash: string | undefined;
};

// TODO: This is Dropbox specific - need to generalize
type RemoteFileData =
	| files.FileMetadataReference
	| files.FolderMetadataReference
	| files.DeletedMetadataReference;

enum SyncStatus {
	synced = "SYNCED",
	clientAhead = "CLIENT_AHEAD",
	remoteAhead = "REMOTE_AHEAD",
	clientNotFound = "CLIENT_NOT_FOUND",
	deletedOnServer = "DELETED_ON_SERVER",
	remoteAheadFolder = "REMOTE_AHEAD_FOLDER",
}

export class Sync {
	provider: Provider;
	fileMap: Map<RemoteFilePath, FileSyncMetadata> | undefined;
	obsidianApp: App;
	settings: PluginSettings;
	_cursor: string | null;

	constructor(args: {
		obsidianApp: App;
		settings: PluginSettings;
		provider: Provider;
	}) {
		this.obsidianApp = args.obsidianApp;
		this.settings = args.settings;
		this.provider = args.provider;
	}

	public async initializeFileMap(): Promise<void> {
		//if (this.fileMap) return;
		this.fileMap = new Map();

		const clientFoldersOrFiles = this.obsidianApp.vault.getAllLoadedFiles();

		const clientFiles = clientFoldersOrFiles.filter(
			(folderOrFile) => folderOrFile instanceof TFile,
		) as TFile[];

		const fileContents = await Promise.allSettled(
			clientFiles.map((clientFile) =>
				this.obsidianApp.vault.readBinary(clientFile),
			),
		);

		for (let i = 0; i < clientFiles.length; i++) {
			if (fileContents[i].status == "rejected") {
				obsidianFileRetrievalError(clientFiles[i].name);
				continue;
			}

			const fileHash = this.provider.createFileHash(
				// @ts-ignore (typesript bug - not type narroring)
				{ fileData: fileContents[i].value },
			);

			const sanitizedRemotePath = sanitizeRemotePath({
				vaultRoot: this.settings.cloudVaultPath!,
				filePath: clientFiles[i].path,
			});

			this.fileMap.set(sanitizedRemotePath, {
				...clientFiles[i],
				remotePath: sanitizedRemotePath,
				fileHash,
				rev: undefined,
			});
		}
	}

	public async syncClientFiles(): Promise<void> {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		const files: TFile[] = [];
		for (let fileData of this.fileMap.values()) {
			if (fileData.rev) continue;

			const file = this.obsidianApp.vault.getFileByPath(fileData.path);
			if (!file) continue;

			files.push(file);
		}

		const fileContents = await Promise.allSettled(
			files.map((file) => this.obsidianApp.vault.readBinary(file)),
		);

		if (!files.length) return;

		await this.provider.processBatchCreateFile(
			fileContents.reduce<{ path: string; contents: ArrayBuffer }[]>(
				(acc, cur, idx) => {
					if (cur.status == "rejected") {
						obsidianFileRetrievalError(files[idx].name);
					} else {
						const sanitizedRemotePath = sanitizeRemotePath({
							vaultRoot: this.settings.cloudVaultPath,
							filePath: files[idx].path,
						});
						acc.push({
							path: sanitizedRemotePath,
							contents: cur.value,
						});
					}
					return acc;
				},
				[],
			),
		);
	}

	public async syncRemoteFiles(): Promise<void> {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		// TODO: This returns a dropbox specific path - will need to be generalized for additional providers
		// TODO: Refactor to include has_more
		let remoteFiles = await this.provider.listFiles({
			// TODO: the path should include the "/"
			vaultRoot: "/" + this.settings.cloudVaultPath,
		});

		try {
			await this.syncFiles({ remoteFiles });
			this.cursor = remoteFiles.cursor;
		} catch (e) {
			providerSyncError(e);
		}
	}

	public async syncRemoteFilesLongPoll(): Promise<void> {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}
		if (!this.cursor) return;

		const remoteFiles = await this.provider.longpoll({
			cursor: this.cursor,
		});

		await this.syncFiles({ remoteFiles });
		this.cursor = remoteFiles.cursor;
	}

	private syncFiles(args: {
		remoteFiles: {
			files: (
				| files.FileMetadataReference
				| files.FolderMetadataReference
				| files.DeletedMetadataReference
			)[];
			cursor: string;
		};
	}): Promise<PromiseSettledResult<void>[]> {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}
		return Promise.allSettled(
			args.remoteFiles.files.map((file) => {
				const sanitizedRemotePath = sanitizeRemotePath({
					filePath: file.path_lower!,
				});
				return this.syncFile({
					clientFileMetadata: this.fileMap?.get(sanitizedRemotePath),
					remoteFileMetadata: file,
				});
			}),
		);
	}

	private async syncFile(args: {
		clientFileMetadata: FileSyncMetadata | undefined;
		remoteFileMetadata: RemoteFileData;
	}): Promise<void> {
		let syncStatus = this.getSyncStatus({
			clientFileMetadata: args.clientFileMetadata,
			remoteFileMetadata: args.remoteFileMetadata,
		});

		switch (syncStatus) {
			case SyncStatus.deletedOnServer:
				await this.reconcileDeletedOnServer({
					clientFileMetadata: args.clientFileMetadata,
					remoteFileMetadata: args.remoteFileMetadata,
				});
				break;
			case SyncStatus.synced:
				if (args.remoteFileMetadata[".tag"] == "file") {
					args.clientFileMetadata!.rev = args.remoteFileMetadata.rev;
				}
				break;
			case SyncStatus.clientAhead:
				await this.reconcileClientAhead({
					clientFileMetadata: args.clientFileMetadata!,
				});
				break;
			case SyncStatus.remoteAhead:
				await this.reconcileRemoteAhead({
					clientFileMetadata: args.clientFileMetadata!,
				});
				break;
			case SyncStatus.clientNotFound:
				await this.reconcileClientNotFound({
					remoteFileMetadata: args.remoteFileMetadata,
				});
				break;
			case SyncStatus.remoteAheadFolder:
				await this.reconcileRemoteAheadFolder({
					remoteFileMetadata: args.remoteFileMetadata,
				});
				break;
			default:
				throw new Error(`Invalid Sync Status: ${syncStatus}`);
		}
	}

	getSyncStatus(args: {
		clientFileMetadata: FileSyncMetadata | undefined;
		remoteFileMetadata: RemoteFileData;
	}): SyncStatus {
		const { clientFileMetadata, remoteFileMetadata } = args;
		if (remoteFileMetadata[".tag"] == "deleted") {
			return SyncStatus.deletedOnServer;
		}

		if (remoteFileMetadata[".tag"] == "folder") {
			return SyncStatus.remoteAheadFolder;
		}

		if (remoteFileMetadata[".tag"] == "file") {
			if (clientFileMetadata == undefined) {
				return SyncStatus.clientNotFound;
			}

			if (
				clientFileMetadata.fileHash == remoteFileMetadata.content_hash
			) {
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
		}
		throw new Error("Sync Error - Invalid sync condition");
	}

	public async reconcileCreateFileOnClient(args: {
		folderOrFile: TAbstractFile;
	}) {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		if (args.folderOrFile instanceof TFolder) {
			try {
				const folders = await this.batchCreateFolder(
					args.folderOrFile,
				).then((folders) => {
					return folders.map((folder) => {
						const sanitizedRemotePath = sanitizeRemotePath({
							vaultRoot: this.settings.cloudVaultPath,
							filePath: folder.path,
						});

						return sanitizedRemotePath;
					});
				});

				await this.provider.processBatchCreateFolder({
					paths: folders,
				});
			} catch (e) {
				providerSyncError(e);
			}
		}

		if (args.folderOrFile instanceof TFile) {
			try {
				const files = await this.batchCreateFile(args.folderOrFile);
				const binaryFileContents = await Promise.allSettled(
					files.map((file) =>
						this.obsidianApp.vault.readBinary(file),
					),
				);

				const toProcess: {
					path: RemoteFilePath;
					contents: ArrayBuffer;
				}[] = [];
				for (let i = 0; i < files.length; i++) {
					const bFileContents = binaryFileContents[i];
					if (bFileContents.status == "rejected") {
						obsidianFileRetrievalError(files[i].name);
						continue;
					}
					const sanitizedRemotePath = sanitizeRemotePath({
						vaultRoot: this.settings.cloudVaultPath,
						filePath: files[i].path,
					});
					toProcess.push({
						path: sanitizedRemotePath,
						contents: bFileContents.value,
					});
				}

				const entries =
					await this.provider.processBatchCreateFile(toProcess);

				for (let entry of entries.result.entries) {
					// TODO: This shouldn't bee needed. improve typing on createFile
					if (entry[".tag"] == "failure") continue;

					this.fileMap.set(entry.path_lower as RemoteFilePath, {
						...(args.folderOrFile as TFile),
						remotePath: entry.path_lower as RemoteFilePath,
						rev: entry.rev,
						fileHash: entry.content_hash!,
					});
				}
			} catch (e) {
				providerSyncError(e);
			}

			console.log("fileMap after create:", this.fileMap);
		}
	}

	private batchCreateFolder = batch<TFolder>({ wait: 250 });
	private batchCreateFile = batch<TFile>({ wait: 250 });

	public async reconcileMoveFileOnClient(args: {
		folderOrFile: TAbstractFile;
		ctx: string;
	}) {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		try {
			const { results, items } = await this.batchRenameFolderOrFile(args);

			const entries = await this.provider.processBatchRenameFolderOrFile(
				results.map((result) => {
					const fromPath = sanitizeRemotePath({
						vaultRoot: this.settings.cloudVaultPath,
						filePath: result.ctx,
					});
					const toPath = sanitizeRemotePath({
						vaultRoot: this.settings.cloudVaultPath,
						filePath: result.folderOrFile.path,
					});

					return {
						from_path: fromPath,
						to_path: toPath,
					};
				}),
			);

			for (let entry of entries) {
				if (entry[".tag"] == "failure") {
					providerSyncError();
					continue;
				}

				if (entry[".tag"] == "success") {
					if (entry.success[".tag"] === "folder") {
						const entryName = entry.success.name;

						const subFiles = items.filter((item) => {
							return (
								item.folderOrFile instanceof TFile &&
								item.folderOrFile.parent?.name == entryName
							);
						});

						subFiles.forEach((subFile) => {
							const sanitizedFromPath = sanitizeRemotePath({
								vaultRoot: this.settings.cloudVaultPath,
								filePath: subFile.ctx,
							});
							const sanitizedToPath = sanitizeRemotePath({
								vaultRoot: this.settings.cloudVaultPath,
								filePath: subFile.folderOrFile.path,
							});

							const clientFileMetadata =
								this.fileMap?.get(sanitizedFromPath);
							if (clientFileMetadata)
								this.fileMap?.delete(sanitizedFromPath);

							this.fileMap?.set(sanitizedToPath, {
								...(subFile.folderOrFile as TFile),
								remotePath: sanitizedToPath,
								rev: clientFileMetadata?.rev,
								fileHash: clientFileMetadata?.fileHash,
							});
						});
					}

					if (entry.success[".tag"] == "file") {
						const providerPath = entry.success.path_lower;
						const clientFile = items.find(
							(item) => item.folderOrFile.path == providerPath,
						);
						// TODO: This shouldn't be possible
						if (!clientFile) continue;

						const sanitizedFromPath = sanitizeRemotePath({
							vaultRoot: this.settings.cloudVaultPath,
							filePath: clientFile.ctx,
						});
						const sanitizedToPath = sanitizeRemotePath({
							vaultRoot: this.settings.cloudVaultPath,
							filePath: clientFile.folderOrFile.path,
						});

						const clientFileMetadata =
							this.fileMap?.get(sanitizedFromPath);
						if (clientFileMetadata)
							this.fileMap?.delete(sanitizedFromPath);

						this.fileMap?.set(sanitizedToPath, {
							...(clientFile.folderOrFile as TFile),
							remotePath: sanitizedToPath,
							rev: clientFileMetadata?.rev,
							fileHash: clientFileMetadata?.fileHash,
						});
					}
				}
			}
		} catch (e) {
			providerSyncError(e);
		}
	}

	private batchRenameFolderOrFile = batch<{
		folderOrFile: TAbstractFile;
		ctx: string;
	}>({ func: this.processBatchReanemFolderOrFileV2.bind(this), wait: 250 });

	private processBatchReanemFolderOrFileV2(
		args: { folderOrFile: TAbstractFile; ctx: string }[],
	) {
		const foldersToProcess = args.filter(
			({ folderOrFile }) => folderOrFile instanceof TFolder,
		);

		const folders = new Set(
			foldersToProcess.map(({ folderOrFile }) => folderOrFile.name),
		);

		const filesToProcess = args.filter(
			({ folderOrFile }) =>
				folderOrFile instanceof TFile &&
				!folders.has(folderOrFile.parent?.name || ""),
		);

		return [...foldersToProcess, ...filesToProcess];
	}

	public async reconcileDeletedOnClient(args: {
		folderOrFile: TAbstractFile;
	}) {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		try {
			const deleted = await this.batchDeleteFolderOrFile(
				args.folderOrFile,
			);

			const toProcess = deleted.map((folderOrFile) => {
				const sanitizedPath = sanitizeRemotePath({
					vaultRoot: this.settings.cloudVaultPath,
					filePath: folderOrFile.path,
				});

				return sanitizedPath;
			});

			const entries = await this.provider.processBatchDeleteFolderOfFile({
				paths: toProcess,
			});

			for (let entry of entries) {
				if (entry[".tag"] == "failure") {
					providerSyncError();
					continue;
				}

				if (entry[".tag"] == "success") {
					this.fileMap.delete(
						entry.metadata.path_lower as RemoteFilePath,
					);
				}
			}
		} catch (e) {
			providerSyncError(e);
		}
	}

	private batchDeleteFolderOrFile = batch<TAbstractFile>({ wait: 250 });

	async reconcileDeletedOnServer(args: {
		clientFileMetadata: FileSyncMetadata | undefined;
		remoteFileMetadata: RemoteFileData;
	}) {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		const sanitizedRemotePath = sanitizeRemotePath({
			vaultRoot: this.settings.cloudVaultPath,
			filePath: args.remoteFileMetadata.path_lower!,
		});
		const sanitizedClientPath = convertRemoteToClientPath({
			remotePath: sanitizedRemotePath,
		});

		let folderOrFile: TAbstractFile | null;
		if (args.clientFileMetadata) {
			folderOrFile =
				this.obsidianApp.vault.getFileByPath(sanitizedClientPath);
		} else {
			folderOrFile =
				this.obsidianApp.vault.getFolderByPath(sanitizedClientPath);
		}

		if (!folderOrFile) return;

		await this.obsidianApp.vault.delete(folderOrFile, true);
		this.fileMap.delete(sanitizedRemotePath);
	}

	reconcileClientAhead(args: { clientFile: TAbstractFile }): Promise<void>;
	reconcileClientAhead(args: {
		clientFileMetadata: FileSyncMetadata;
	}): Promise<void>;
	async reconcileClientAhead(args: {
		clientFile?: TAbstractFile;
		clientFileMetadata?: FileSyncMetadata;
	}): Promise<void> {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		let clientFileMetadata: FileSyncMetadata | undefined =
			args.clientFileMetadata;
		if (args.clientFile) {
			const sanitizedRemotePath = sanitizeRemotePath({
				vaultRoot: this.settings.cloudVaultPath!,
				filePath: args.clientFile.path,
			});
			clientFileMetadata = this.fileMap.get(sanitizedRemotePath);
		}
		if (clientFileMetadata == undefined) return;
		let clientFile = this.obsidianApp.vault.getFileByPath(
			clientFileMetadata.path,
		);

		let clientFileContents = await this.obsidianApp.vault.readBinary(
			clientFile!,
		);

		const res = await this.provider.updateFile({
			path: clientFileMetadata.remotePath,
			rev: clientFileMetadata.rev || "",
			contents: clientFileContents,
		});

		if (!res) return;
		clientFileMetadata.rev = res.result.rev;
		clientFileMetadata.fileHash = res.result.content_hash!;
	}

	async reconcileRemoteAhead(args: { clientFileMetadata: FileSyncMetadata }) {
		if (args.clientFileMetadata == undefined) return;

		const clientFile = this.obsidianApp.vault.getFileByPath(
			args.clientFileMetadata.path,
		);

		const remoteFileContents = await this.provider.downloadFile({
			path: args.clientFileMetadata.remotePath,
		});

		if (!clientFile || !remoteFileContents)
			throw new Error("Error: reconcileRemoteAhead Error");

		await this.obsidianApp.vault.modifyBinary(
			clientFile,
			await remoteFileContents.fileBlob!.arrayBuffer(),
			{ mtime: new Date(remoteFileContents.server_modified).valueOf() },
		);

		args.clientFileMetadata.rev = remoteFileContents.rev;
		args.clientFileMetadata.fileHash = remoteFileContents.content_hash!;
	}

	reconcileRemoteAheadFolder(args: { remoteFileMetadata: RemoteFileData }) {
		// TODO: sanitizedRemotePath should handle undefined path_lower
		const sanitizedRemotePath = sanitizeRemotePath({
			vaultRoot: this.settings.cloudVaultPath,
			filePath: args.remoteFileMetadata.path_lower!,
		});

		const sanitizedClientPath = convertRemoteToClientPath({
			remotePath: sanitizedRemotePath,
		});
		return this.obsidianApp.vault.createFolder(sanitizedClientPath);
	}

	async reconcileClientNotFound(args: {
		remoteFileMetadata: RemoteFileData;
	}) {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		const remoteFileContents = await this.provider.downloadFile({
			path: args.remoteFileMetadata.path_lower!,
		});

		const sanitizedRemotePath = sanitizeRemotePath({
			vaultRoot: this.settings.cloudVaultPath,
			filePath: remoteFileContents.path_lower!,
		});

		const sanitizedClientPath = convertRemoteToClientPath({
			remotePath: sanitizedRemotePath,
		});

		try {
			const clientFileMetadata =
				await this.obsidianApp.vault.createBinary(
					sanitizedClientPath,
					await remoteFileContents.fileBlob!.arrayBuffer(),
					{
						mtime: new Date(
							remoteFileContents.server_modified,
						).valueOf(),
					},
				);
			this.fileMap.set(sanitizedRemotePath, {
				...clientFileMetadata,
				remotePath: sanitizedRemotePath,
				fileHash: remoteFileContents.content_hash!,
				rev: remoteFileContents.rev,
			});
		} catch (e) {
			console.error("WHOOPS!", e);
		}
	}

	public set cursor(cursor: string | null) {
		this._cursor = cursor;
		if (cursor) {
			window.localStorage.setItem("cursor", cursor);
		} else {
			window.localStorage.removeItem("cursor");
		}
	}

	public get cursor() {
		if (this._cursor) {
			return this._cursor;
		}

		this._cursor = window.localStorage.getItem("cursor");
		return this._cursor;
	}
}
