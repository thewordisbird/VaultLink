import type { files, DropboxResponse } from "dropbox";
import { FileMetadataExtended } from "./dropbox.provider";

export interface Provider {
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
	batchCreateFolder(item: unknown): void;
	createFile: (args: unknown) => void;
	batchRenameFolderOrFile: (item: unknown) => void;
	batchDeleteFolderOrFile: (item: unknown) => void;
}
