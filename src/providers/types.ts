//import type { files, DropboxResponse } from "dropbox";
import { ProviderPath } from "src/types";
import { FileMetadataExtended } from "./dropbox.provider";
declare const __brand: unique symbol;

export type FileHash = string & { [__brand]: "file hash" };

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

export type ProviderBatchResult = {
	results: {
		name: string;
		path: ProviderPath;
		type: "file" | "folder" | "deleted";
	}[];
	hasFailure: boolean;
};

export interface CreateFileHashArgs {
	contents: ArrayBuffer;
}

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

	getAuthenticationUrl(): Promise<string>;

	getCodeVerifier(): string;

	setCodeVerifier(codeVerifier: string): void;

	setAccessAndRefreshToken(
		authorizationCode: string,
	): Promise<{ refreshToken: string }>;

	revokeAuthorizationToken(): Promise<void>;

	authorizeWithRefreshToken(refreshToken: string): void;

	createFileHash: (args: CreateFileHashArgs) => FileHash;

	listFoldersAndFiles(
		args: ListFoldersAndFilesArgs,
	): Promise<ListFoldersAndFilesResult>;

	listFoldersAndFilesContinue(
		args: ListFolderAndFilesContinueArgs,
	): Promise<ListFoldersAndFilesContinueResult>;

	longpoll(args: LongpollArgs): Promise<LongopllResult>;

	updateFile(args: {
		path: ProviderPath;
		rev: string | undefined;
		contents: ArrayBuffer;
	}): Promise<ProviderFile>;

	downloadFile(args: { path: string }): Promise<FileMetadataExtended>;

	processBatchMoveFolderOrFile(
		args: ProcessBatchMoveFolderOrFileArgs[],
	): Promise<ProcessBatchMoveFolderOrFileResult>;

	processBatchCreateFile(
		args: ProcessBatchCreateFileArgs[],
	): Promise<ProcessBatchCreateFileResult[]>;

	processBatchCreateFolder(args: ProcessBatchCreateFolderArgs): Promise<void>;

	processBatchDeleteFolderOrFile(args: {
		paths: ProviderPath[];
	}): Promise<ProviderBatchResult>;
}
