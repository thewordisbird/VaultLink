import { Dropbox, DropboxAuth, DropboxResponse, files } from "dropbox";
import { dropboxContentHasher } from "./dropbox.hasher";
import { exponentialBackoff } from "src/utils";
import type { Folder, ProviderPath } from "../types";
// TODO: simplify - doesn't need to be so specific
import type {
	FileHash,
	ListFoldersAndFilesArgs,
	ListFoldersAndFilesResults,
	Provider,
	ProviderDeleteResult,
	ProviderFileContentsResult,
	ProviderFileResult,
	ProviderFolderResult,
	ProviderMoveResult,
} from "./types";

type ProviderAccount = {
	accountId: string;
	email: string;
};

type DropboxState = {
	account: ProviderAccount;
};

export interface FileMetadataExtended extends files.FileMetadata {
	fileBlob?: Blob;
}
const BATCH_DELAY_TIME = 500;

export const REDIRECT_URI = "obsidian://connect-dropbox";
export const CLIENT_ID = "vofawt4jgywrgey";

export const DROPBOX_PROVIDER_ERRORS = {
	authenticationError: "Auth Error: Unable to authenticate with dropbox",
	revocationError: "Revokeation Error: Unable to revoke dropbox token",
	resourceAccessError:
		"Resource Access Error: Unable to access Drpobox resource",
};

let instance: DropboxProvider | undefined;

// @ts-ignore
export class DropboxProvider implements Provider {
	dropbox: Dropbox;
	dropboxAuth: DropboxAuth;
	// TODO: Flatten to 1d
	state = {} as DropboxState;

	static resetInstance() {
		instance = undefined;
	}

	constructor() {
		if (instance) return instance;

		this.dropboxAuth = new DropboxAuth({
			clientId: CLIENT_ID,
		});

		this.dropbox = new Dropbox({
			auth: this.dropboxAuth,
		});

		instance = this;
		return instance;
	}

	get email(): string {
		return this.state.account?.email;
	}

	/* Start Authentication and Authorization */
	public async getAuthenticationUrl(): Promise<string> {
		const authUrl = await this.dropboxAuth.getAuthenticationUrl(
			REDIRECT_URI, // redirectUri
			undefined, // state
			"code", // authType
			"offline", // tokenAccessType
			undefined, // scope
			undefined, // includeGrantedScopes
			true, // usePKCE
		);

		return authUrl.toString();
	}

	public getCodeVerifier(): string {
		return this.dropboxAuth.getCodeVerifier();
	}

	public setCodeVerifier(codeVerifier: string): void {
		return this.dropboxAuth.setCodeVerifier(codeVerifier);
	}

	public async setAccessAndRefreshToken(
		authorizationCode: string,
	): Promise<{ refreshToken: string }> {
		const {
			result: { access_token, refresh_token },
		} = (await this.dropboxAuth.getAccessTokenFromCode(
			REDIRECT_URI,
			authorizationCode,
		)) as DropboxResponse<{
			access_token: string;
			refresh_token: string;
		}>;

		this.dropboxAuth.setAccessToken(access_token);
		this.dropboxAuth.setRefreshToken(refresh_token);

		return { refreshToken: refresh_token };
	}

	public async revokeAuthorizationToken(): Promise<void> {
		await this.dropbox.authTokenRevoke();
		this.state = {} as DropboxState;
	}

	public authorizeWithRefreshToken(refreshToken: string): void {
		this.dropboxAuth.setRefreshToken(refreshToken);
		this.dropboxAuth.refreshAccessToken();
	}
	/* End Authentication and Authorization */

	/* Start Folder and File Access */
	public async longpoll(args: {
		cursor: string;
	}): Promise<ListFoldersAndFilesResults> {
		// Uses default `timeout` arg of 30 seconds
		const longPollResult = await this.dropbox.filesListFolderLongpoll({
			cursor: args.cursor,
		});

		if (!longPollResult.result.changes) {
			return { folders: [], files: [], deleted: [], cursor: args.cursor };
		}

		let folders: ProviderFolderResult[] = [];
		let files: ProviderFileResult[] = [];
		let deleted: ProviderDeleteResult[] = [];

		let hasMore: boolean;
		let cursor = args.cursor;
		do {
			const listFoldersAndFilesContinueResult =
				await this.listFoldersAndFilesContinue({ cursor });

			folders.push(...listFoldersAndFilesContinueResult.folders);
			files.push(...listFoldersAndFilesContinueResult.files);
			deleted.push(...listFoldersAndFilesContinueResult.deleted);
			cursor = listFoldersAndFilesContinueResult.cursor;
			hasMore = listFoldersAndFilesContinueResult.hasMore;
		} while (hasMore);

		return { folders, files, deleted, cursor };
	}

	public async listFoldersAndFiles(
		args: ListFoldersAndFilesArgs,
	): Promise<ListFoldersAndFilesResults> {
		let filesListFolderResult = await this.dropbox.filesListFolder({
			path: args.vaultRoot,
			recursive: args.recursive,
		});
		let files = filesListFolderResult.result.entries
			.filter(
				(entry): entry is files.FileMetadataReference =>
					entry[".tag"] == "file",
			)
			.map((file) => ({
				name: file.name,
				path: file.path_lower as ProviderPath,
				rev: file.rev,
				fileHash: file.content_hash as FileHash,
				serverModified: file.server_modified,
			}));

		let folders = filesListFolderResult.result.entries
			.filter(
				(entry): entry is files.FolderMetadataReference =>
					entry[".tag"] == "folder",
			)
			.map((folder) => ({
				name: folder.name,
				path: folder.path_lower as ProviderPath,
			}));

		let deleted = filesListFolderResult.result.entries
			.filter(
				(entry): entry is files.DeletedMetadataReference =>
					entry[".tag"] == "deleted",
			)
			.map((deletedResource) => ({
				name: deletedResource.name,
				path: deletedResource.path_lower as ProviderPath,
			}));

		let cursor = filesListFolderResult.result.cursor;
		let hasMore = filesListFolderResult.result.has_more;

		while (hasMore) {
			const listFolderAndFilesContinueResilt =
				await this.listFoldersAndFilesContinue({ cursor });
			files.push(...listFolderAndFilesContinueResilt.files);
			folders.push(...listFolderAndFilesContinueResilt.folders);
			deleted.push(...listFolderAndFilesContinueResilt.deleted);

			cursor = listFolderAndFilesContinueResilt.cursor;
			hasMore = listFolderAndFilesContinueResilt.hasMore;
		}

		return {
			files,
			folders,
			deleted,
			cursor,
		};
	}

	private async listFoldersAndFilesContinue(args: { cursor: string }) {
		const filesListFolderContinueResult =
			await this.dropbox.filesListFolderContinue({ cursor: args.cursor });

		const files = filesListFolderContinueResult.result.entries
			.filter(
				(entry): entry is files.FileMetadataReference =>
					entry[".tag"] == "file",
			)
			.map((file) => ({
				name: file.name,
				path: file.path_lower as ProviderPath,
				rev: file.rev,
				fileHash: file.content_hash as FileHash,
				serverModified: file.server_modified,
			}));

		const folders = filesListFolderContinueResult.result.entries
			.filter(
				(entry): entry is files.FolderMetadataReference =>
					entry[".tag"] == "folder",
			)
			.map((folder) => ({
				name: folder.name,
				path: folder.path_lower as ProviderPath,
			}));

		const deleted = filesListFolderContinueResult.result.entries
			.filter(
				(entry): entry is files.DeletedMetadataReference =>
					entry[".tag"] == "deleted",
			)
			.map((deletedResource) => ({
				name: deletedResource.name,
				path: deletedResource.path_lower as ProviderPath,
			}));

		const cursor = filesListFolderContinueResult.result.cursor;
		const hasMore = filesListFolderContinueResult.result.has_more;

		return {
			files,
			folders,
			deleted,
			hasMore,
			cursor,
		};
	}

	public async processBatchCreateFolder(args: {
		paths: ProviderPath[];
	}): Promise<{ results: ProviderFolderResult[]; hasFailure: boolean }> {
		const batchResults = await this.dropbox.filesCreateFolderBatch({
			paths: args.paths,
		});

		if (batchResults.result[".tag"] == "complete") {
			const success = batchResults.result.entries
				.filter(
					(
						entry,
					): entry is files.CreateFolderBatchResultEntrySuccess =>
						entry[".tag"] == "success",
				)
				.map((successEntry) => ({
					name: successEntry.metadata.name,
					path: successEntry.metadata.path_lower as ProviderPath,
				}));

			return {
				results: success,
				hasFailure:
					success.length != batchResults.result.entries.length,
			};
		} else if (batchResults.result[".tag"] == "async_job_id") {
			const batchCheckResults = await this.batchCreateFolderCheck({
				asyncJobId: batchResults.result.async_job_id,
			});

			const success = batchCheckResults.result.entries
				.filter(
					(
						entry,
					): entry is files.CreateFolderBatchResultEntrySuccess =>
						entry[".tag"] == "success",
				)
				.map((successEntry) => ({
					name: successEntry.metadata.name,
					path: successEntry.metadata.path_lower as ProviderPath,
				}));

			return {
				results: success,
				hasFailure:
					success.length != batchCheckResults.result.entries.length,
			};
		} else {
			throw new Error(
				`Unknown ".tag" property: ${batchResults.result[".tag"]}`,
			);
		}
	}

	private batchCreateFolderCheck = exponentialBackoff<
		{ asyncJobId: string },
		DropboxResponse<files.CreateFolderBatchJobStatus>,
		DropboxResponse<files.CreateFolderBatchJobStatusComplete>
	>({
		func: this._batchCreateFolderCheck.bind(this),
		checkFunc: this._batchCreateFolderCheckIsSuccess.bind(this),
		interval: 250,
		maxRetry: 10,
		growthFactor: 2,
	});

	private _batchCreateFolderCheck(args: {
		asyncJobId: string;
	}): Promise<DropboxResponse<files.CreateFolderBatchJobStatus>> {
		return this.dropbox.filesCreateFolderBatchCheck({
			async_job_id: args.asyncJobId,
		});
	}

	private _batchCreateFolderCheckIsSuccess(
		args: DropboxResponse<files.CreateFolderBatchJobStatus>,
	): boolean {
		return args.result[".tag"] == "complete";
	}

	public async processBatchMoveFolderOrFile(
		args: { fromPath: ProviderPath; toPath: ProviderPath }[],
	): Promise<{ results: ProviderMoveResult[]; hasFailure: boolean }> {
		const batchResults = await this.dropbox.filesMoveBatchV2({
			entries: args.map((arg) => ({
				from_path: arg.fromPath,
				to_path: arg.toPath,
			})),
		});
		if (batchResults.result[".tag"] == "complete") {
			const success = batchResults.result.entries
				.filter(
					(entry): entry is files.RelocationBatchResultEntrySuccess =>
						entry[".tag"] == "success",
				)
				.map((successEntry) => ({
					name: successEntry.success.name,
					path: successEntry.success.path_lower as ProviderPath,
					type: successEntry.success[".tag"],
				}));

			return {
				results: success,
				hasFailure:
					success.length != batchResults.result.entries.length,
			};
		} else if (batchResults.result[".tag"] == "async_job_id") {
			const batchCheckResults = await this.batchMoveFolderOrFileCheck({
				asyncJobId: batchResults.result.async_job_id,
			});

			const success = batchCheckResults.result.entries
				.filter(
					(entry): entry is files.RelocationBatchResultEntrySuccess =>
						entry[".tag"] == "success",
				)
				.map((successEntry) => ({
					name: successEntry.success.name,
					path: successEntry.success.path_lower as ProviderPath,
					type: successEntry.success[".tag"],
				}));

			return {
				results: success,
				hasFailure:
					success.length != batchCheckResults.result.entries.length,
			};
		} else {
			throw new Error(
				`Unknown ".tag" property: ${batchResults.result[".tag"]}`,
			);
		}
	}

	private batchMoveFolderOrFileCheck = exponentialBackoff<
		{ asyncJobId: string },
		DropboxResponse<files.RelocationBatchV2JobStatus>,
		DropboxResponse<files.RelocationBatchV2JobStatusComplete>
	>({
		func: this._batchMoveFolderOrFileCheck.bind(this),
		checkFunc: this._batchMoveFolderOrFileCheckIsSuccess.bind(this),
		interval: 250,
		maxRetry: 10,
		growthFactor: 2,
	});

	private _batchMoveFolderOrFileCheck(args: {
		asyncJobId: string;
	}): Promise<DropboxResponse<files.RelocationBatchV2JobStatus>> {
		return this.dropbox.filesMoveBatchCheckV2({
			async_job_id: args.asyncJobId,
		});
	}

	private _batchMoveFolderOrFileCheckIsSuccess(
		args: DropboxResponse<files.RelocationBatchV2JobStatus>,
	) {
		return args.result[".tag"] == "complete";
	}

	public async processBatchDeleteFolderOrFile(args: {
		paths: ProviderPath[];
	}): Promise<{ results: ProviderDeleteResult[]; hasFailure: boolean }> {
		const batchResults = await this.dropbox.filesDeleteBatch({
			entries: args.paths.map((path) => ({ path })),
		});

		if (batchResults.result[".tag"] == "complete") {
			const success = batchResults.result.entries
				.filter(
					(entry): entry is files.DeleteBatchResultEntrySuccess =>
						entry[".tag"] == "success",
				)
				.map((successEntry) => ({
					name: successEntry.metadata.name,
					path: successEntry.metadata.path_lower as ProviderPath,
					type: successEntry.metadata[".tag"],
				}));

			return {
				results: success,
				hasFailure:
					success.length != batchResults.result.entries.length,
			};
		} else if (batchResults.result[".tag"] == "async_job_id") {
			const batchCheckResults = await this.batchDeleteFolderOrFileCheck({
				asyncJobId: batchResults.result.async_job_id,
			});

			const success = batchCheckResults.result.entries
				.filter(
					(entry): entry is files.DeleteBatchResultEntrySuccess =>
						entry[".tag"] == "success",
				)
				.map((successEntry) => ({
					name: successEntry.metadata.name,
					path: successEntry.metadata.path_lower as ProviderPath,
					type: successEntry.metadata[".tag"],
				}));

			return {
				results: success,
				hasFailure:
					success.length != batchCheckResults.result.entries.length,
			};
		} else {
			throw new Error(
				`Unknown ".tag" property: ${batchResults.result[".tag"]}`,
			);
		}
	}

	private batchDeleteFolderOrFileCheck = exponentialBackoff<
		{ asyncJobId: string },
		DropboxResponse<files.DeleteBatchJobStatus>,
		DropboxResponse<files.DeleteBatchJobStatusComplete>
	>({
		func: this._batchDeleteFolderOrFileCheck.bind(this),
		checkFunc: this._batchDeleteFolderOrFileCheckIsSuccess.bind(this),
		interval: 250,
		maxRetry: 10,
		growthFactor: 2,
	});

	private _batchDeleteFolderOrFileCheck(args: {
		asyncJobId: string;
	}): Promise<DropboxResponse<files.DeleteBatchJobStatus>> {
		return this.dropbox.filesDeleteBatchCheck({
			async_job_id: args.asyncJobId,
		});
	}

	private _batchDeleteFolderOrFileCheckIsSuccess(
		args: DropboxResponse<files.RelocationBatchV2JobStatus>,
	): boolean {
		return args.result[".tag"] == "complete";
	}

	public async processBatchCreateFile(
		args: { path: ProviderPath; contents: ArrayBuffer }[],
	): Promise<{ results: ProviderFileResult[]; hasFailure: boolean }> {
		const sessionIds = await this.batchCreateFileStart(args.length);
		// TODO: If an error happens here, we still need to fire Finally to close the batch
		const { fulfilled, rejected } = await this.batchCreateFileAppend({
			files: args,
			sessionIds,
		});

		const batchResults = await this.batchCreateFileFinish(fulfilled);

		const success = batchResults.result.entries
			.filter(
				(
					entry,
				): entry is files.UploadSessionFinishBatchResultEntrySuccess =>
					entry[".tag"] === "success",
			)
			.map((successEntry) => ({
				name: successEntry.name,
				path: successEntry.path_lower! as ProviderPath,
				rev: successEntry.rev,
				fileHash: successEntry.content_hash! as FileHash,
				serverModified: successEntry.server_modified,
			}));

		const failure = batchResults.result.entries.filter(
			(
				entry,
			): entry is files.UploadSessionFinishBatchResultEntryFailure =>
				entry[".tag"] === "failure",
		);

		return {
			results: success,
			hasFailure: failure.length > 0 || rejected.length > 0,
		};
	}

	private batchCreateFileStart(numSessions: number): Promise<string[]> {
		return this.dropbox
			.filesUploadSessionStartBatch({
				num_sessions: numSessions,
			})
			.then((res) => res.result.session_ids);
	}

	private batchCreateFileAppend(args: {
		files: { path: string; contents: ArrayBuffer }[];
		sessionIds: string[];
	}): Promise<{
		fulfilled: PromiseFulfilledResult<{
			path: string;
			cursor: {
				offset: number;
				session_id: string;
			};
			response: DropboxResponse<void>;
		}>[];
		rejected: PromiseRejectedResult[];
	}> {
		const { files, sessionIds } = args;
		const entries = [];
		for (let i = 0; i < files.length; i++) {
			//console.log("bytesize:", files[i].contents.byteLength);

			// NOTE: This assumes all files will be less than 150Mb
			// An improvement can be made to split the file into 150Mb
			// parts upto a max size of 350GB.
			// This doesn't seem neccessary at this point for a note syncing
			// app
			let startCursor = {
				offset: 0,
				session_id: sessionIds[i],
			};

			let endCursor = {
				offset: files[i].contents.byteLength,
				session_id: sessionIds[i],
			};
			entries.push(
				new Promise<{
					path: string;
					cursor: { offset: number; session_id: string };
					response: DropboxResponse<void>;
				}>((res, rej) => {
					this.dropbox
						.filesUploadSessionAppendV2({
							contents: files[i].contents,
							cursor: startCursor,
							close: true,
						})
						.then((response) => {
							res({
								cursor: endCursor,
								path: files[i].path,
								response,
							});
						})
						.catch((e) => {
							rej(e);
						});
				}),
			);
		}

		return Promise.allSettled(entries).then((settledEntreis) => {
			const fulfilled = settledEntreis.filter(
				(entry) => entry.status == "fulfilled",
			) as PromiseFulfilledResult<{
				path: string;
				cursor: { offset: number; session_id: string };
				response: DropboxResponse<void>;
			}>[];

			const rejected = settledEntreis.filter(
				(entry) => entry.status == "rejected",
			) as PromiseRejectedResult[];

			return {
				fulfilled,
				rejected,
			};
		});
	}

	private async batchCreateFileFinish(
		entries: PromiseFulfilledResult<{
			path: string;
			cursor: { offset: number; session_id: string };
			response: DropboxResponse<void>;
		}>[],
	): Promise<DropboxResponse<files.UploadSessionFinishBatchResult>> {
		return this.dropbox.filesUploadSessionFinishBatchV2({
			entries: entries.map((entry) => {
				return {
					commit: {
						path: entry.value.path,
					},
					cursor: entry.value.cursor,
				};
			}),
		});
	}

	public createFileHash(args: { contents: ArrayBuffer }): FileHash {
		return dropboxContentHasher(args.contents) as FileHash;
	}

	public async downloadFile(args: {
		path: string;
	}): Promise<ProviderFileContentsResult> {
		const { result } = await this.dropbox.filesDownload({
			path: args.path,
		});
		// @ts-ignore
		const contents = await result.fileBlob!.arrayBuffer();
		return {
			name: result.name,
			path: result.path_lower as ProviderPath,
			rev: result.rev,
			fileHash: result.content_hash as FileHash,
			serverModified: result.server_modified,
			contents,
		};
	}

	setUserInfo(): Promise<void> {
		return this.dropbox
			.usersGetCurrentAccount()
			.then((response) => {
				this.state.account = {
					accountId: response.result.account_id,
					email: response.result.email,
				};
			})
			.catch((_e: any) => {
				throw new Error(DROPBOX_PROVIDER_ERRORS.resourceAccessError);
			});
	}

	public async updateFile(args: {
		path: ProviderPath;
		rev: string | undefined;
		contents: ArrayBuffer;
	}): Promise<ProviderFileResult> {
		let mode: files.WriteModeUpdate | files.WriteModeOverwrite;
		if (args.rev) {
			mode = {
				".tag": "update",
				update: args.rev,
			};
		} else {
			mode = {
				".tag": "overwrite",
			};
		}
		const fileUploadResult = await this.dropbox.filesUpload({
			mode,
			path: args.path,
			contents: new Blob([args.contents]),
		});
		return {
			name: fileUploadResult.result.name,
			path: fileUploadResult.result.path_lower as ProviderPath,
			rev: fileUploadResult.result.rev,
			fileHash: fileUploadResult.result.content_hash as FileHash,
			serverModified: fileUploadResult.result.server_modified,
		};
	}
}
