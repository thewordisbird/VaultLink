import type { files, DropboxResponse } from "dropbox";
import type { RemoteFilePath } from "src/sync/sync";
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
	// batchCreateFolder: {
	// 	(args: string): Promise<{
	// 		items: string[];
	// 		results: void;
	// 	}>;
	// 	cancel: () => void;
	// };

	batchCreateFile: {
		(args: { path: string; contents: ArrayBuffer }): Promise<{
			items: {
				path: string;
				contents: ArrayBuffer;
			}[];
			results: Promise<
				DropboxResponse<files.UploadSessionFinishBatchResult>
			>;
		}>;
		cancel: () => void;
	};
	batchDeleteFolderOrFile: {
		(args: string): Promise<{
			items: string[];
			results: Promise<void>;
		}>;
		cancel: () => void;
	};
	processBatchRenameFolderOrFile(
		args: {
			from_path: RemoteFilePath;
			to_path: RemoteFilePath;
		}[],
	): Promise<files.RelocationBatchResultEntry[]>;

	batchCreateFileV2(
		args: {
			path: string;
			contents: ArrayBuffer;
		}[],
	): Promise<DropboxResponse<files.UploadSessionFinishBatchResult>>;

	processBatchCreateFolder(args: {
		paths: string[];
	}): Promise<files.CreateFolderBatchResultEntry[]>;
}
