import { App, TAbstractFile, TFile, TFolder } from "obsidian";
import { PluginSettings } from "src/obsidian/settings";
import { Provider } from "src/providers/types";

import type { files } from "dropbox";

declare const __brand: unique symbol;

type ClientFilePath = string & { [__brand]: "client path" };
type RemoteFilePath = string & { [__brand]: "remote path" };

type FileSyncMetadata = TFile & {
	clientPath: ClientFilePath;
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
}
export class Sync {
	provider: Provider;
	fileMap: Map<RemoteFilePath, FileSyncMetadata> | undefined;
	obsidianApp: App;
	settings: PluginSettings;

	constructor(args: {
		obsidianApp: App;
		settings: PluginSettings;
		provider: Provider;
	}) {
		this.obsidianApp = args.obsidianApp;
		this.settings = args.settings;
		this.provider = args.provider;
	}

	async initializeFileMap(args: {
		clientFoldersOrFiles: TAbstractFile[];
	}): Promise<void> {
		if (this.fileMap) return;
		this.fileMap = new Map();

		for (let clientFolderOrFile of args.clientFoldersOrFiles) {
			if (!(clientFolderOrFile instanceof TFile)) continue;

			let fileHash = this.provider.createFileHash({
				fileData:
					await this.obsidianApp.vault.readBinary(clientFolderOrFile),
			});

			let sanitizedRemotePath = this.sanitizeRemotePath({
				vaultRoot: this.settings.cloudVaultPath!,
				filePath: clientFolderOrFile.path,
			});

			let sanitizedClientPath = this.sanitizeClientPath({
				vaultRoot: this.settings.cloudVaultPath!,
				filePath: clientFolderOrFile.path,
			});

			this.fileMap.set(sanitizedRemotePath, {
				...clientFolderOrFile,
				clientPath: sanitizedClientPath,
				remotePath: sanitizedRemotePath,
				fileHash,
				rev: undefined,
			});
		}
	}

	async syncRemoteFiles(): Promise<string> {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		// TODO: This returns a dropbox specific path - will need to be generalized for additional providers
		let remoteFiles = await this.provider.listFiles({
			// TODO: the path should include the "/"
			vaultRoot: "/" + this.settings.cloudVaultPath,
		});

		for (let remoteFileMetadata of remoteFiles.files) {
			/* This taggins system is specific to dropbox. As additional Providers are added a plugin tagging system should be implemented. */
			if (remoteFileMetadata[".tag"] != "file") continue;

			let sanitizedRemotePath = this.sanitizeRemotePath({
				filePath: remoteFileMetadata.path_lower!,
			});
			let clientFileMetadata = this.fileMap.get(sanitizedRemotePath);

			this.syncRemoteFile({
				clientFileMetadata,
				remoteFileMetadata,
			});
		}
		return remoteFiles.cursor;
	}

	async syncRemoteFilesLongPoll(args: { cursor: string }): Promise<string> {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		let remoteFiles = await this.provider.listFilesContinue({
			// TODO: the path should include the "/"
			cursor: args.cursor,
		});

		// TODO: Refactor to include has_more
		for (let remoteFileMetadata of remoteFiles.files) {
			// This is copied from above. just a reminder if we need a tag check
			//if (remoteFileMetadata[".tag"] != "file") continue;

			let sanitizedRemotePath = this.sanitizeRemotePath({
				filePath: remoteFileMetadata.path_lower!,
			});
			let clientFileMetadata = this.fileMap.get(sanitizedRemotePath);

			this.syncRemoteFile({
				clientFileMetadata,
				remoteFileMetadata,
			});
		}

		return remoteFiles.cursor;
	}

	async syncRemoteFile(args: {
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

		const sanitizedRemotePath = this.sanitizeRemotePath({
			vaultRoot: this.settings.cloudVaultPath,
			filePath: args.folderOrFile.path,
		});

		if (args.folderOrFile instanceof TFolder) {
			this.provider.batchCreateFolder(sanitizedRemotePath);
			return;
		}

		if (args.folderOrFile instanceof TFile) {
			function callback(res: files.FileMetadata) {
				this.fileMap.set(sanitizedRemotePath, {
					...(args.folderOrFile as TFile),
					clientPath: this.convertRemoteToClientPath({
						remotePath: sanitizedRemotePath,
					}),
					remotePath: sanitizedRemotePath,
					rev: res.rev,
					fileHash: res.content_hash!,
				});
				console.log("createFile fileMap:", this.fileMap);
			}

			this.obsidianApp.vault
				.readBinary(args.folderOrFile)
				.then((contents) =>
					this.provider.createFile({
						path: sanitizedRemotePath,
						contents,
						callback: callback.bind(this),
					}),
				);
		}
	}

	reconcileMoveFileOnClient(args: {
		folderOrFile: TAbstractFile;
		ctx: string;
	}) {
		console.log("reconcileMoveFileOnCliend:", args);
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}
		const fromPath = this.sanitizeRemotePath({
			vaultRoot: this.settings.cloudVaultPath,
			filePath: args.ctx,
		});
		const toPath = this.sanitizeRemotePath({
			vaultRoot: this.settings.cloudVaultPath,
			filePath: args.folderOrFile.path,
		});

		this.provider.batchRenameFolderOrFile({
			from_path: fromPath,
			to_path: toPath,
		});

		// TODO: This should be queued until the batch transaction is verified as bening completed
		let syncData = this.fileMap.get(fromPath);
		// TODO: This should be an error state
		if (!syncData) return;

		this.fileMap.delete(fromPath);
		this.fileMap.set(toPath, {
			...syncData,
			...args.folderOrFile,
			clientPath: this.convertRemoteToClientPath({ remotePath: toPath }),
			remotePath: toPath,
		});

		console.log("fileMap - rename:", this.fileMap);
		console.log("syncData:", syncData);
		console.log("args.folderOrFile:", args.folderOrFile);
	}

	reconcileDeletedOnClient(args: { folderOrFile: TAbstractFile }) {
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		const sanitizedPath = this.sanitizeRemotePath({
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

		if (args.clientFileMetadata == undefined) return;
		const clientFile = this.obsidianApp.vault.getFileByPath(
			args.clientFileMetadata.clientPath,
		);

		if (!clientFile) return;
		this.obsidianApp.vault.delete(clientFile);
		this.fileMap.delete(args.clientFileMetadata.remotePath);
	}

	reconcileClientAhead(args: { clientFile: TAbstractFile }): Promise<void>;
	reconcileClientAhead(args: {
		clientFileMetadata: FileSyncMetadata;
	}): Promise<void>;
	async reconcileClientAhead(args: {
		clientFile?: TAbstractFile;
		clientFileMetadata?: FileSyncMetadata;
	}): Promise<void> {
		console.log(
			"reconcileClientAhead\nClientFile:",
			args.clientFile,
			"\nClientFileMetadata:",
			args.clientFileMetadata,
		);
		if (!this.fileMap) {
			throw new Error("Sync Error: fileMap not initialized");
		}

		let clientFileMetadata: FileSyncMetadata | undefined =
			args.clientFileMetadata;
		if (args.clientFile) {
			const sanitizedRemotePath = this.sanitizeRemotePath({
				vaultRoot: this.settings.cloudVaultPath!,
				filePath: args.clientFile.path,
			});
			console.log("sanitizedRemotePath:", sanitizedRemotePath);
			console.log("fileMap:", this.fileMap);
			clientFileMetadata = this.fileMap.get(sanitizedRemotePath);
			console.log("clientFileMetadata:", clientFileMetadata);
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
			args.clientFileMetadata.clientPath,
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

	sanitizeRemotePath(args: {
		vaultRoot?: string;
		filePath: string;
	}): RemoteFilePath {
		// TODO: Add validation & error handling
		if (args.vaultRoot == undefined) {
			return args.filePath.toLowerCase() as RemoteFilePath;
		}
		return `/${args.vaultRoot}/${args.filePath}`.toLowerCase() as RemoteFilePath;
	}

	sanitizeClientPath(args: {
		vaultRoot?: string;
		filePath: string;
	}): ClientFilePath {
		if (args.vaultRoot == undefined) {
			return args.filePath.toLowerCase() as ClientFilePath;
		}
		return `${args.vaultRoot}/${args.filePath}`.toLowerCase() as ClientFilePath;
	}

	convertClientToRemotePath(args: {
		clientPath: ClientFilePath;
	}): RemoteFilePath {
		return ("/" + args.clientPath) as RemoteFilePath;
	}

	convertRemoteToClientPath(args: {
		remotePath: RemoteFilePath;
	}): ClientFilePath {
		return args.remotePath.slice(1) as ClientFilePath;
	}
}
