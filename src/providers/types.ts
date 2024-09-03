import type { files, DropboxResponse } from "dropbox";
import { RemoteFilePath } from "src/utils";
import { FileMetadataExtended } from "./dropbox.provider";

export interface Provider {
	email: string;
	createFileHash: (args: { fileData: ArrayBuffer }) => FileHash;
	listFiles(args: { vaultRoot: string }): Promise<{
		files: (
			| files.FileMetadataReference
			| files.FolderMetadataReference
			| files.DeletedMetadataReference
		)[];
		cursor: string;
	}>;
	listFilesContinue(args: { cursor: string }): Promise<{
		files: (
			| files.FileMetadataReference
			| files.FolderMetadataReference
			| files.DeletedMetadataReference
		)[];
		cursor: string;
	}>;
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
	processBatchRenameFolderOrFile(
		args: {
			from_path: RemoteFilePath;
			to_path: RemoteFilePath;
		}[],
	): Promise<files.RelocationBatchResultEntry[]>;

	processBatchCreateFile(
		args: ProcessBatchCreateFileArgs[],
	): Promise<ProcessBatchCreateFileResult[]>;

	processBatchCreateFolder(args: ProcessBatchCreateFolderArgs): Promise<void>;

	processBatchDeleteFolderOfFile(args: {
		paths: string[];
	}): Promise<files.DeleteBatchResultEntry[]>;
	longpoll(args: { cursor: string }): Promise<{
		files: (
			| files.FileMetadataReference
			| files.FolderMetadataReference
			| files.DeletedMetadataReference
		)[];
		cursor: string;
	}>;
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
	path: string;
	rev: string;
	fileHash: FileHash;
};
