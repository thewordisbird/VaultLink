import { App, TAbstractFile, TFile, TFolder } from "obsidian";
import {
	batch,
	convertRemoteToClientPath,
	sanitizeRemotePath,
} from "src/utils";
import {
	obsidianFileRetrievalError,
	providerSyncError,
} from "src/obsidian/notice";
import type { PluginSettings } from "src/obsidian/settings";
import type {
	FileHash,
	Provider,
	ProviderDeleted,
	ProviderFile,
	ProviderFolder,
} from "src/providers/types";
import { ProviderPath } from "src/types";

type FileSyncMetadata = TFile & {
	remotePath: ProviderPath;
	rev: string | undefined;
	fileHash: FileHash | undefined;
};

enum SyncStatus {
	synced = "SYNCED",
	clientAhead = "CLIENT_AHEAD",
	remoteAhead = "REMOTE_AHEAD",
	clientNotFound = "CLIENT_NOT_FOUND",
}

export class FileSync {
	provider: Provider;
	fileMap: Map<ProviderPath, FileSyncMetadata> | undefined;
	obsidianApp: App;
	settings: PluginSettings;
	cursor: string | null;

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
		console.log("start - initializeFileMap");
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
				vaultRoot: this.settings.providerPath!,
				filePath: clientFiles[i].path,
			});

			this.fileMap.set(sanitizedRemotePath, {
				...clientFiles[i],
				remotePath: sanitizedRemotePath,
				fileHash,
				rev: undefined,
			});
		}
		console.log("end - initializeFileMap");
	}

	public async syncClientFiles(): Promise<void> {
		console.log("start - syncClientFiles");
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

		console.log("pre process batch - syncClientFiles");
		await this.provider.processBatchCreateFile(
			fileContents.reduce<{ path: string; contents: ArrayBuffer }[]>(
				(acc, cur, idx) => {
					if (cur.status == "rejected") {
						obsidianFileRetrievalError(files[idx].name);
					} else {
						const sanitizedRemotePath = sanitizeRemotePath({
							vaultRoot: this.settings.providerPath,
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

		console.log("end - syncClientFiles");
	}

	public async syncRemoteFiles(): Promise<void> {
		console.log("start - syncRemoteFiles");
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		let { folders, files, deleted, cursor } =
			await this.provider.listFoldersAndFiles({
				vaultRoot: this.settings.providerPath!,
			});

		await this.syncFiles({ folders, files, deleted });
		this.cursor = cursor;
		console.log("end - syncRemoteFiles");
	}

	public async syncRemoteFilesLongPoll(): Promise<void> {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}
		if (!this.cursor) return;

		const { folders, files, deleted, cursor } =
			await this.provider.longpoll({
				cursor: this.cursor,
			});

		await this.syncFiles({ folders, files, deleted });
		this.cursor = cursor;
	}

	private syncFiles(args: {
		folders: ProviderFolder[];
		files: ProviderFile[];
		deleted: ProviderDeleted[];
	}) {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		const sync = [];

		sync.push(
			Promise.allSettled(
				args.deleted.map((providerDeleted) =>
					this.syncFile({
						providerDeleted,
						clientFileMetadata: this.fileMap?.get(
							providerDeleted.path,
						),
					}),
				),
			),
		);
		sync.push(
			Promise.allSettled(
				args.files.map((providerFile) =>
					this.syncFile({
						providerFile,
						clientFileMetadata: this.fileMap?.get(
							providerFile.path,
						),
					}),
				),
			),
		);
		sync.push(
			Promise.allSettled(
				args.folders.map((providerFolder) =>
					this.syncFile({ providerFolder }),
				),
			),
		);

		return Promise.allSettled(sync);
	}

	private async syncFile(args: {
		providerFolder: ProviderFolder;
	}): Promise<void>;
	private async syncFile(args: {
		providerDeleted: ProviderDeleted;
		clientFileMetadata: FileSyncMetadata | undefined;
	}): Promise<void>;
	private async syncFile(args: {
		providerFile: ProviderFile;
		clientFileMetadata: FileSyncMetadata | undefined;
	}): Promise<void>;
	private async syncFile(args: {
		providerDeleted?: ProviderDeleted;
		providerFile?: ProviderFile;
		providerFolder?: ProviderFolder;
		clientFileMetadata?: FileSyncMetadata | undefined;
	}): Promise<void> {
		if (args.providerDeleted) {
			return this.reconcileDeletedOnServer({
				clientFileMetadata: args.clientFileMetadata,
				providerDeleted: args.providerDeleted,
			});
		}

		if (args.providerFolder) {
			return this.reconcileRemoteAheadFolder({
				providerFolder: args.providerFolder,
			});
		}

		if (args.providerFile) {
			let syncStatus = this.getSyncStatus({
				clientFileMetadata: args.clientFileMetadata,
				providerFile: args.providerFile,
			});

			switch (syncStatus) {
				case SyncStatus.synced:
					args.clientFileMetadata!.rev = args.providerFile.rev;
					break;
				case SyncStatus.clientAhead:
					this.reconcileClientAhead({
						clientFileMetadata: args.clientFileMetadata!,
					});
					break;
				case SyncStatus.remoteAhead:
					this.reconcileRemoteAhead({
						clientFileMetadata: args.clientFileMetadata!,
					});
					break;
				case SyncStatus.clientNotFound:
					await this.reconcileClientNotFound({
						providerFile: args.providerFile,
					});
					break;
				default:
					throw new Error(`Invalid Sync Status: ${syncStatus}`);
			}
		}
	}

	private getSyncStatus(args: {
		clientFileMetadata: FileSyncMetadata | undefined;
		providerFile: ProviderFile;
	}): SyncStatus {
		if (args.clientFileMetadata == undefined) {
			return SyncStatus.clientNotFound;
		}

		if (args.clientFileMetadata.fileHash == args.providerFile.fileHash) {
			return SyncStatus.synced;
		}

		if (
			new Date(args.clientFileMetadata.stat.mtime) >
			new Date(args.providerFile.serverModified)
		) {
			return SyncStatus.clientAhead;
		}

		if (
			new Date(args.clientFileMetadata.stat.mtime) <
			new Date(args.providerFile.serverModified)
		) {
			return SyncStatus.remoteAhead;
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
			const folders = await this.batchCreateFolder(
				args.folderOrFile,
			).then((folders) => {
				return folders.map((folder) => {
					const sanitizedRemotePath = sanitizeRemotePath({
						vaultRoot: this.settings.providerPath,
						filePath: folder.path,
					});

					return sanitizedRemotePath;
				});
			});

			await this.provider.processBatchCreateFolder({
				paths: folders,
			});
		}

		if (args.folderOrFile instanceof TFile) {
			const files = await this.batchCreateFile(args.folderOrFile);
			const binaryFileContents = await Promise.allSettled(
				files.map((file) => this.obsidianApp.vault.readBinary(file)),
			);

			const toProcess: {
				path: ProviderPath;
				contents: ArrayBuffer;
			}[] = [];
			for (let i = 0; i < files.length; i++) {
				const bFileContents = binaryFileContents[i];
				if (bFileContents.status == "rejected") {
					obsidianFileRetrievalError(files[i].name);
					continue;
				}
				const sanitizedRemotePath = sanitizeRemotePath({
					vaultRoot: this.settings.providerPath,
					filePath: files[i].path,
				});
				toProcess.push({
					path: sanitizedRemotePath,
					contents: bFileContents.value,
				});
			}

			const entries =
				await this.provider.processBatchCreateFile(toProcess);

			for (let entry of entries) {
				this.fileMap.set(entry.path as ProviderPath, {
					...(args.folderOrFile as TFile),
					remotePath: entry.path,
					rev: entry.rev,
					fileHash: entry.fileHash,
				});
			}
		}
	}

	private batchCreateFolder = batch<TFolder>({ wait: 250 });
	private batchCreateFile = batch<TFile>({ wait: 250 });

	public async reconcileMoveFolderOrFileOnClient(args: {
		folderOrFile: TAbstractFile;
		ctx: string;
	}) {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		const { results, items } = await this.batchMoveFolderOrFile(args);

		const batchMoveFolderOrFileResults =
			await this.provider.processBatchMoveFolderOrFile(
				results.map((result) => {
					const fromPath = sanitizeRemotePath({
						vaultRoot: this.settings.providerPath,
						filePath: result.ctx,
					});
					const toPath = sanitizeRemotePath({
						vaultRoot: this.settings.providerPath,
						filePath: result.folderOrFile.path,
					});

					return {
						fromPath,
						toPath,
					};
				}),
			);

		if (batchMoveFolderOrFileResults.hasFailure) {
			// TODO: Improve Error Messaging
			providerSyncError();
		}
		for (let result of batchMoveFolderOrFileResults.results) {
			if (result.type == "folder") {
				const subFiles = items.filter((item) => {
					return (
						item.folderOrFile instanceof TFile &&
						item.folderOrFile.parent?.name == result.name
					);
				});

				subFiles.forEach((subFile) => {
					const sanitizedFromPath = sanitizeRemotePath({
						vaultRoot: this.settings.providerPath,
						filePath: subFile.ctx,
					});
					const sanitizedToPath = sanitizeRemotePath({
						vaultRoot: this.settings.providerPath,
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

			if (result.type == "file") {
				const clientFile = items.find(
					(item) => item.folderOrFile.path == result.path,
				);
				if (!clientFile) continue;

				const sanitizedFromPath = sanitizeRemotePath({
					vaultRoot: this.settings.providerPath,
					filePath: clientFile.ctx,
				});
				const sanitizedToPath = sanitizeRemotePath({
					vaultRoot: this.settings.providerPath,
					filePath: clientFile.folderOrFile.path,
				});

				const clientFileMetadata = this.fileMap?.get(sanitizedFromPath);
				if (clientFileMetadata) this.fileMap?.delete(sanitizedFromPath);

				this.fileMap?.set(sanitizedToPath, {
					...(clientFile.folderOrFile as TFile),
					remotePath: sanitizedToPath,
					rev: clientFileMetadata?.rev,
					fileHash: clientFileMetadata?.fileHash,
				});
			}
		}
	}

	private batchMoveFolderOrFile = batch<{
		folderOrFile: TAbstractFile;
		ctx: string;
	}>({ func: this._batchMoveFolderOrFile.bind(this), wait: 250 });

	private _batchMoveFolderOrFile(
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

		const deleted = await this.batchDeleteFolderOrFile(args.folderOrFile);

		const toProcess = deleted.map((folderOrFile) => {
			const sanitizedPath = sanitizeRemotePath({
				vaultRoot: this.settings.providerPath,
				filePath: folderOrFile.path,
			});

			return sanitizedPath;
		});

		// TODO: Type fix
		const entries = await this.provider.processBatchDeleteFolderOfFile({
			paths: toProcess,
		});

		for (let entry of entries) {
			if (entry[".tag"] == "failure") {
				providerSyncError();
				continue;
			}

			if (entry[".tag"] == "success") {
				this.fileMap.delete(entry.metadata.path_lower as ProviderPath);
			}
		}
	}

	private batchDeleteFolderOrFile = batch<TAbstractFile>({ wait: 250 });

	private async reconcileDeletedOnServer(args: {
		clientFileMetadata: FileSyncMetadata | undefined;
		providerDeleted: ProviderDeleted;
	}) {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		const sanitizedClientPath = convertRemoteToClientPath({
			remotePath: args.providerDeleted.path,
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
		this.fileMap.delete(args.providerDeleted.path);
	}

	public async reconcileClientAhead(args: {
		clientFile: TAbstractFile;
	}): Promise<void>;
	public async reconcileClientAhead(args: {
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
				vaultRoot: this.settings.providerPath!,
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

		// TODO: type fix
		const res = await this.provider.updateFile({
			path: clientFileMetadata.remotePath,
			rev: clientFileMetadata.rev || undefined,
			contents: clientFileContents,
		});

		if (!res) return;
		clientFileMetadata.rev = res.result.rev;
		clientFileMetadata.fileHash = res.result.content_hash! as FileHash;
	}

	private async reconcileRemoteAhead(args: {
		clientFileMetadata: FileSyncMetadata;
	}) {
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
		args.clientFileMetadata.fileHash =
			remoteFileContents.content_hash! as FileHash;
	}

	private async reconcileRemoteAheadFolder(args: {
		providerFolder: ProviderFolder;
	}): Promise<void> {
		const sanitizedClientPath = convertRemoteToClientPath({
			remotePath: args.providerFolder.path,
		});

		try {
			await this.obsidianApp.vault.createFolder(sanitizedClientPath);
		} catch (e) {
			// error indicates folder exists. That is ok
		}
	}

	private async reconcileClientNotFound(args: {
		providerFile: ProviderFile;
	}) {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		// TODO: Update typing for provider.downloadFile
		const providerFileContents = await this.provider.downloadFile({
			path: args.providerFile.path,
		});

		const sanitizedClientPath = convertRemoteToClientPath({
			remotePath: args.providerFile.path,
		});

		const clientFileMetadata = await this.obsidianApp.vault.createBinary(
			sanitizedClientPath,
			await providerFileContents.fileBlob!.arrayBuffer(),
			{
				mtime: new Date(providerFileContents.server_modified).valueOf(),
			},
		);
		this.fileMap.set(args.providerFile.path, {
			...clientFileMetadata,
			remotePath: args.providerFile.path,
			fileHash: providerFileContents.content_hash as FileHash,
			rev: providerFileContents.rev,
		});
	}
}
