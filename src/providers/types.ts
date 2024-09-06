import { ProviderPath } from "src/types";
import { FileMetadataExtended } from "./dropbox.provider";
declare const __brand: unique symbol;

export type FileHash = string & { [__brand]: "file hash" };

export type ProviderFileResult = {
	name: string;
	path: ProviderPath;
	rev: string;
	fileHash: FileHash;
	serverModified: string; // TODO: Should this be converted to a date?
};

export type ProviderFileContentsResult = ProviderFileResult & {
	contents: ArrayBuffer;
};

export type ProviderFolderResult = {
	name: string;
	path: ProviderPath;
};

export type ProviderDeleteResult = {
	name: string;
	path: ProviderPath;
};

export type ProviderMoveResult = {
	name: string;
	path: ProviderPath;
	type: "file" | "folder" | "deleted";
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

export type ProcessBatchCreateFileResult = {
	path: ProviderPath;
	rev: string;
	fileHash: FileHash;
};

export interface ListFoldersAndFilesArgs {
	vaultRoot: ProviderPath;
	recursive: boolean;
}

export type ListFoldersAndFilesResults = {
	files: ProviderFileResult[];
	folders: ProviderFolderResult[];
	deleted: ProviderDeleteResult[];
	cursor: string;
};

export interface ListFolderAndFilesContinueArgs {
	cursor: string;
}

export type ListFoldersAndFilesContinueResult = ListFoldersAndFilesResults & {
	hasMore: boolean;
};

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

	longpoll(args: { cursor: string }): Promise<ListFoldersAndFilesResults>;

	listFoldersAndFiles(
		args: ListFoldersAndFilesArgs,
	): Promise<ListFoldersAndFilesResults>;

	processBatchCreateFolder(args: {
		paths: ProviderPath[];
	}): Promise<{ results: ProviderFolderResult[]; hasFailure: boolean }>;

	processBatchMoveFolderOrFile(
		args: { fromPath: ProviderPath; toPath: ProviderPath }[],
	): Promise<{ results: ProviderMoveResult[]; hasFailure: boolean }>;

	processBatchDeleteFolderOrFile(args: {
		paths: ProviderPath[];
	}): Promise<{ results: ProviderDeleteResult[]; hasFailure: boolean }>;

	processBatchCreateFile(
		args: { path: ProviderPath; contents: ArrayBuffer }[],
	): Promise<{ results: ProviderFileResult[]; hasFailure: boolean }>;

	createFileHash: (args: { contents: ArrayBuffer }) => FileHash;

	downloadFile(args: { path: string }): Promise<ProviderFileContentsResult>;

	setUserInfo(): Promise<void>;

	updateFile(args: {
		path: ProviderPath;
		rev: string | undefined;
		contents: ArrayBuffer;
	}): Promise<ProviderFileResult>;
}
