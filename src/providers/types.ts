import type { files, DropboxResponse } from "dropbox";
import { RemoteFilePath } from "src/utils";
import { FileMetadataExtended } from "./dropbox.provider";

export interface Provider {
	email: string;
	createFileHash: (args: { fileData: ArrayBuffer }) => string;
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
		rev: string;
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
		args: {
			path: string;
			contents: ArrayBuffer;
		}[],
	): Promise<DropboxResponse<files.UploadSessionFinishBatchResult>>;

	processBatchCreateFolder(args: {
		paths: string[];
	}): Promise<files.CreateFolderBatchResultEntry[]>;
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
