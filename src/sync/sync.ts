import { App, TAbstractFile, TFile, TFolder } from "obsidian";
import { PluginSettings } from "src/obsidian/settings";
import { Provider } from "src/providers/types";

import type { files } from "dropbox";
import {
	batch,
	convertRemoteToClientPath,
	RemoteFilePath,
	sanitizeRemotePath,
} from "src/utils";

type FileSyncMetadata = TFile & {
	//clientPath: ClientFilePath;
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

interface VFSNode extends TAbstractFile {
	rev: string | undefined;
	contentHash: string | undefined;
	fullPath: string;
}

function vfsNodeFactory(folderOrFile: TAbstractFile): VFSNode {
	return {
		...folderOrFile,
		rev: undefined,
		contentHash: undefined,
		fullPath: "",
	};
}

export class Sync {
	provider: Provider;
	fileMap: Map<RemoteFilePath, FileSyncMetadata> | undefined;
	obsidianApp: App;
	settings: PluginSettings;
	vfs: VFSNode;
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

	// async initializeVFS(){
	// 	const foldersOrFiles = this.obsidianApp.vault.getAllLoadedFiles();
	// 	for (let folderOrFile of foldersOrFiles){
	// 		let node = new VFS(folderOrFile);
	//
	// 	}
	// };

	async initializeFileMap(args: {
		clientFoldersOrFiles: TAbstractFile[];
	}): Promise<void> {
		console.log("start - initializedFileMap:", args);
		//if (this.fileMap) return;
		this.fileMap = new Map();

		for (let clientFolderOrFile of args.clientFoldersOrFiles) {
			if (!(clientFolderOrFile instanceof TFile)) continue;

			let fileHash = this.provider.createFileHash({
				fileData:
					await this.obsidianApp.vault.readBinary(clientFolderOrFile),
			});

			let sanitizedRemotePath = sanitizeRemotePath({
				vaultRoot: this.settings.cloudVaultPath!,
				filePath: clientFolderOrFile.path,
			});

			this.fileMap.set(sanitizedRemotePath, {
				...clientFolderOrFile,
				//clientPath: sanitizedClientPath,
				remotePath: sanitizedRemotePath,
				fileHash,
				rev: undefined,
			});
		}

		console.log("end - initializedFileMap:", this.fileMap);
	}

	async syncClientFiles(): Promise<void> {
		// Any File that does NOT have a rev will be uploaded to the provider
		// Run this after syncRemote
		console.log("start - syncClientFiles:");
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		for (const [remotePath, fileData] of this.fileMap) {
			if (fileData.rev) continue;

			const file = this.obsidianApp.vault.getFileByPath(fileData.path);
			if (!file) return;

			const sanitizedRemotePath = sanitizeRemotePath({
				vaultRoot: this.settings.cloudVaultPath,
				filePath: file.path,
			});

			this.obsidianApp.vault
				.readBinary(file)
				.then((contents) => {
					this.provider.batchCreateFile({
						path: sanitizedRemotePath,
						contents,
					});
				})
				// TODO: Error handling
				.catch((e) => {
					console.error(e);
				});
		}

		console.log("end - syncClientFiles:");
	}
	async syncRemoteFiles(): Promise<void> {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		// TODO: This returns a dropbox specific path - will need to be generalized for additional providers
		// TODO: Refactor to include has_more
		let remoteFiles = await this.provider.listFiles({
			// TODO: the path should include the "/"
			vaultRoot: "/" + this.settings.cloudVaultPath,
		});

		this.syncFiles({ remoteFiles });
		// Check for changes that occured while not using the app
		if (this.cursor) {
			await this.syncRemoteFilesLongPoll({ cursor: this.cursor });
		}

		this.cursor = remoteFiles.cursor;
	}

	async syncRemoteFilesLongPoll(args: { cursor: string }): Promise<void> {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		// TODO: Refactor to include has_more
		let remoteFiles = await this.provider.listFilesContinue({
			cursor: args.cursor,
		});

		await this.syncFiles({ remoteFiles }).catch((e) => {
			console.error("SyncFiles LP Error", e);
		});
		this.cursor = remoteFiles.cursor;
	}

	async syncFiles(args: {
		remoteFiles: {
			files: (
				| files.FileMetadataReference
				| files.FolderMetadataReference
				| files.DeletedMetadataReference
			)[];
			cursor: string;
		};
	}) {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}
		const toSync = [];
		for (let remoteFileMetadata of args.remoteFiles.files) {
			/* This taggins system is specific to dropbox. As additional Providers are added a plugin tagging system should be implemented. */
			// if (remoteFileMetadata[".tag"] != "file") continue;

			let sanitizedRemotePath = sanitizeRemotePath({
				filePath: remoteFileMetadata.path_lower!,
			});
			let clientFileMetadata = this.fileMap.get(sanitizedRemotePath);

			toSync.push(
				this.syncFile({
					clientFileMetadata,
					remoteFileMetadata,
				}),
			);
		}

		await Promise.allSettled(toSync);
	}

	async syncFile(args: {
		clientFileMetadata: FileSyncMetadata | undefined;
		remoteFileMetadata: RemoteFileData;
	}) {
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

	async reconcileCreateFileOnClient(args: { folderOrFile: TAbstractFile }) {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}
		const sanitizedRemotePath = sanitizeRemotePath({
			vaultRoot: this.settings.cloudVaultPath,
			filePath: args.folderOrFile.path,
		});

		if (args.folderOrFile instanceof TFolder) {
			this.provider.batchCreateFolder(sanitizedRemotePath);
			return;
		}

		if (args.folderOrFile instanceof TFile) {
			const binaryFileContents = await this.obsidianApp.vault.readBinary(
				args.folderOrFile,
			);

			const entries = await this.provider.batchCreateFile({
				path: sanitizedRemotePath,
				contents: binaryFileContents,
			});

			for (let entry of entries.result.entries) {
				// TODO: This shouldn't bee needed. improve typing on createFile
				if (entry[".tag"] == "failure") continue;

				this.fileMap.set(sanitizedRemotePath, {
					...(args.folderOrFile as TFile),
					remotePath: sanitizedRemotePath,
					rev: entry.rev,
					fileHash: entry.content_hash!,
				});
			}

			console.log("fileMap after create:", this.fileMap);
		}
	}

	async reconcileMoveFileOnClient(args: {
		folderOrFile: TAbstractFile;
		ctx: string;
	}) {
		console.log("reconcileMoveFileOnClient - start:", args);
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		try {
			const { results, items } =
				await this.batchRenameFolderOrFileV2(args);

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

			console.log("ENTRIES:", entries);
			// Update filemap
		} catch (e) {}
	}

	batchRenameFolderOrFileV2 = batch<{
		folderOrFile: TAbstractFile;
		ctx: string;
	}>(this._processBatchReanemFolderOrFileV2.bind(this), 250);

	_processBatchReanemFolderOrFileV2(
		args: { folderOrFile: TAbstractFile; ctx: string }[],
	) {
		console.log("foldersOrFiles:", args);
		const foldersToProcess = args.filter(
			({ folderOrFile }) => folderOrFile instanceof TFolder,
		);

		console.log("foldersToProcess:", foldersToProcess);

		const folders = new Set(
			foldersToProcess.map(({ folderOrFile }) => folderOrFile.name),
		);
		console.log("folders:", folders);

		const filesToProcess = args.filter(({ folderOrFile }) => {
			return (
				folderOrFile instanceof TFile &&
				!folders.has(folderOrFile.parent?.name || "")
			);
		});

		console.log("filesToProcess:", filesToProcess);

		return [...foldersToProcess, ...filesToProcess];
	}

	reconcileDeletedOnClient(args: { folderOrFile: TAbstractFile }) {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		const sanitizedPath = sanitizeRemotePath({
			vaultRoot: this.settings.cloudVaultPath,
			filePath: args.folderOrFile.path,
		});

		this.provider.batchDeleteFolderOrFile(sanitizedPath);

		this.fileMap.delete(sanitizedPath);
	}

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
