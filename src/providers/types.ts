import type { files, DropboxResponse } from "dropbox";
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
	batchCreateFolder: {
		(args: string): Promise<void>;
		cancel: () => void;
	};

	batchCreateFile: {
		(args: { path: string; contents: ArrayBuffer }): Promise<Promise<void>>;
		cancel: () => void;
	};
	batchRenameFolderOrFile: {
		(args: { from_path: string; to_path: string }): Promise<Promise<void>>;
		cancel: () => void;
	};
	batchDeleteFolderOrFile: {
		(args: string): Promise<Promise<void>>;
		cancel: () => void;
	};
}
