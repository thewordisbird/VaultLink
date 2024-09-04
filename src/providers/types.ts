import type { files, DropboxResponse } from "dropbox";
import { ProviderPath } from "src/types";
import { RemoteFilePath } from "src/utils";
import { FileMetadataExtended } from "./dropbox.provider";

// files: files.map((file) => ({
// 	name: file.name,
// 	path: file.path_lower as ProviderPath,
// 	rev: file.rev,
// 	fileHash: file.content_hash as FileHash,
// 	serverModified: file.server_modified,
// })),
// folders: folders.map((folder) => ({
// 	name: folder.name,
// 	path: folder.path_lower as ProviderPath,
// })),
// deleted: deleted.map((deletedResource) => ({
// 	name: deletedResource.name,
// 	path: deletedResource.path_lower as ProviderPath,
// })),
export type ProviderFile = {
	name: string;
	path: ProviderPath;
	rev: string;
	fileHash: FileHash;
	serverModified: string; // TODO: Should this be converted to a date?
};

export type ProviderFolder = {
	name: string;
	path: ProviderPath;
};

export type ProviderDeleted = {
	name: string;
	path: ProviderPath;
};

export interface ListFoldersAndFilesArgs {
	vaultRoot: ProviderPath;
}

export type ListFoldersAndFilesResult = {
	files: ProviderFile[];
	folders: ProviderFolder[];
	deleted: ProviderDeleted[];
	cursor: string;
};

export interface ListFolderAndFilesContinueArgs {
	cursor: string;
}

export type ListFoldersAndFilesContinueResult = ListFoldersAndFilesResult & {
	hasMore: boolean;
};

export interface LongpollArgs extends ListFolderAndFilesContinueArgs {}
export type LongopllResult = ListFoldersAndFilesResult;

export interface ProcessBatchMoveFolderOrFileArgs {
	fromPath: ProviderPath;
	toPath: ProviderPath;
}
export type ProcessBatchMoveFolderOrFileResult = {
	results: {
		name: string;
		path: ProviderPath;
		type: "folder" | "file" | "deleted";
	}[];
	hasFailure: boolean;
};
export interface Provider {
	email: string;

	createFileHash: (args: { fileData: ArrayBuffer }) => FileHash;

	listFoldersAndFiles(
		args: ListFoldersAndFilesArgs,
	): Promise<ListFoldersAndFilesResult>;

	listFoldersAndFilesContinue(
		args: ListFolderAndFilesContinueArgs,
	): Promise<ListFoldersAndFilesContinueResult>;

	longpoll(args: LongpollArgs): Promise<LongopllResult>;

	updateFile(args: {
		//TODO: paths should be FilePath
		path: string;
		rev: string | undefined;
		contents: ArrayBuffer;
	}): Promise<void | DropboxResponse<files.FileMetadata>>;

	downloadFile(args: { path: string }): Promise<FileMetadataExtended>;

	revokeAuthorizationToken(): Promise<void>;

	getAuthenticationUrl(): Promise<String>;

	getCodeVerifier(): string;

	processBatchMoveFolderOrFile(
		args: ProcessBatchMoveFolderOrFileArgs[],
	): Promise<ProcessBatchMoveFolderOrFileResult>;

	processBatchCreateFile(
		args: ProcessBatchCreateFileArgs[],
	): Promise<ProcessBatchCreateFileResult[]>;

	processBatchCreateFolder(args: ProcessBatchCreateFolderArgs): Promise<void>;

	processBatchDeleteFolderOfFile(args: {
		paths: string[];
	}): Promise<files.DeleteBatchResultEntry[]>;
}

declare const __brand: unique symbol;

export type FileHash = string & { [__brand]: "file hash" };

export interface ProcessBatchCreateFolderArgs {
	paths: string[];
}

export interface ProcessBatchCreateFileArgs {
	path: string;
	contents: ArrayBuffer;
}

export type ProcessBatchCreateFileResult = {
	path: ProviderPath;
	rev: string;
	fileHash: FileHash;
};
