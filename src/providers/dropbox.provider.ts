import { Dropbox, DropboxAuth, DropboxResponse, files } from "dropbox";
import { dropboxContentHasher } from "./dropbox.hasher";
import { batchProcess, exponentialBackoff, RemoteFilePath } from "src/utils";
import type { Folder } from "../types";
import { Provider } from "./types";

// TODO: All listfolder, listFiles, listFilesContinue need to consider has_more

type DropboxAccount = {
	accountId: string;
	email: string;
};

type DropboxState = {
	account: DropboxAccount;
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
	state = {} as DropboxState;
	revMap = new Map<string, string>();

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

	/* Start Authentication and Authorization */
	getAuthenticationUrl(): Promise<String> {
		return this.dropboxAuth
			.getAuthenticationUrl(
				REDIRECT_URI, // redirectUri
				undefined, // state
				"code", // authType
				"offline", // tokenAccessType
				undefined, // scope
				undefined, // includeGrantedScopes
				true, // usePKCE
			)
			.catch((_e) => {
				throw new Error(DROPBOX_PROVIDER_ERRORS.authenticationError);
			});
	}

	get email() {
		return this.state.account?.email;
	}

	getCodeVerifier(): string {
		return this.dropboxAuth.getCodeVerifier();
	}

	setCodeVerifier(codeVerifier: string): void {
		return this.dropboxAuth.setCodeVerifier(codeVerifier);
	}

	async setAccessAndRefreshToken(
		authorizationCode: string,
	): Promise<{ refreshToken: string }> {
		try {
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
		} catch (_e) {
			throw new Error(DROPBOX_PROVIDER_ERRORS.authenticationError);
		}
	}

	revokeAuthorizationToken(): Promise<void> {
		return this.dropbox
			.authTokenRevoke()
			.then(() => {
				this.state = {} as DropboxState;
			})
			.catch((_e: any) => {
				throw new Error(DROPBOX_PROVIDER_ERRORS.revocationError);
			});
	}

	authorizeWithRefreshToken(refreshToken: string): void {
		this.dropboxAuth.setRefreshToken(refreshToken);
		this.dropboxAuth.refreshAccessToken();
	}

	getAuthorizationState(): Promise<boolean> {
		return this.dropbox
			.checkUser({})
			.then(() => true)
			.catch(() => false);
	}
	/* End Authentication and Authorization */

	listFolders(root = ""): Promise<Folder[]> {
		return this.dropbox
			.filesListFolder({ path: root })
			.then((res) => {
				return res.result.entries
					.filter((entry) => entry[".tag"] === "folder")
					.map((folder) => {
						return {
							name: folder.name,
							path: folder.path_lower,
							displayPath: folder.path_display,
						} as Folder;
					});
			})
			.catch((e: any) => {
				console.error("listFolders error:", e);
				throw new Error(DROPBOX_PROVIDER_ERRORS.resourceAccessError);
			});
	}

	// TODO: change this to 'createFolder' to be consistent with the rest of the api.
	addFolder(path: string) {
		return new Promise<void>((resolve, reject) => {
			this.dropbox
				.filesCreateFolderV2({ path })
				.then(function () {
					resolve();
				})
				.catch(function () {
					reject(
						new Error(DROPBOX_PROVIDER_ERRORS.resourceAccessError),
					);
				});
		});
	}

	listFiles(args: { vaultRoot: string }) {
		return this.dropbox
			.filesListFolder({ path: args.vaultRoot, recursive: true })
			.then((res) => {
				return {
					files: res.result.entries,
					cursor: res.result.cursor,
				};
			})
			.catch((e: any) => {
				console.error("listFolders error:", e);
				throw new Error(DROPBOX_PROVIDER_ERRORS.resourceAccessError);
			});
	}

	listFilesContinue(args: { cursor: string }) {
		return this.dropbox
			.filesListFolderContinue({
				cursor: args.cursor,
			})
			.then((res) => {
				return {
					files: res.result.entries,
					cursor: res.result.cursor,
				};
			})
			.catch((e: any) => {
				console.error("listFoldersContinue error:", e);
				throw new Error(DROPBOX_PROVIDER_ERRORS.resourceAccessError);
			});
	}

	public async longpoll(args: { cursor: string }) {
		// Uses default `timeout` arg of 30 seconds
		const longPollResult = await this.dropbox.filesListFolderLongpoll({
			cursor: args.cursor,
		});
		if (!longPollResult.result.changes) {
			return { cursor: args.cursor, files: [] };
		}
		// TODO: Refactor to include has_more
		let remoteFiles = await this.listFilesContinue({
			cursor: args.cursor,
		});
		return remoteFiles;
	}

	downloadFile(args: { path: string }): Promise<FileMetadataExtended> {
		const { path } = args;
		return this.dropbox.filesDownload({ path }).then((res) => res.result);
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

	/* File and Folder Controls */
	public processBatchCreateFolder(args: { paths: string[] }) {
		return this.dropbox
			.filesCreateFolderBatch({ paths: args.paths })
			.then((res) => {
				if (res.result[".tag"] == "complete") return res.result.entries;
				else if (res.result[".tag"] == "async_job_id") {
					return this.batchCreateFolderCheck({
						asyncJobId: res.result.async_job_id,
					}).then((res) => {
						return res.result.entries;
					});
				} else {
					throw new Error(
						`Unknown ".tag" property: ${res.result[".tag"]}`,
					);
				}
			});
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

	private _batchCreateFolderCheck(args: { asyncJobId: string }) {
		return this.dropbox.filesCreateFolderBatchCheck({
			async_job_id: args.asyncJobId,
		});
	}

	private _batchCreateFolderCheckIsSuccess(
		args: DropboxResponse<files.CreateFolderBatchJobStatus>,
	) {
		return args.result[".tag"] == "complete";
	}

	public processBatchRenameFolderOrFile(
		args: { from_path: RemoteFilePath; to_path: RemoteFilePath }[],
	) {
		return this.dropbox
			.filesMoveBatchV2({ entries: args })
			.then(async (res) => {
				if (res.result[".tag"] == "complete") return res.result.entries;
				else if (res.result[".tag"] == "async_job_id") {
					return this.batchRenameFolderOrFileCheck({
						asyncJobId: res.result.async_job_id,
					}).then((res) => {
						return res.result.entries;
					});
				} else {
					throw new Error(
						`Unknown ".tag" property: ${res.result[".tag"]}`,
					);
				}
			});
	}

	private batchRenameFolderOrFileCheck = exponentialBackoff<
		{ asyncJobId: string },
		DropboxResponse<files.RelocationBatchV2JobStatus>,
		DropboxResponse<files.RelocationBatchV2JobStatusComplete>
	>({
		func: this._batchRenameFolderOrFileCheck.bind(this),
		checkFunc: this._batchRenameFolderOrFileCheckIsSuccess.bind(this),
		interval: 250,
		maxRetry: 10,
		growthFactor: 2,
	});

	private _batchRenameFolderOrFileCheck(args: { asyncJobId: string }) {
		return this.dropbox.filesMoveBatchCheckV2({
			async_job_id: args.asyncJobId,
		});
	}

	private _batchRenameFolderOrFileCheckIsSuccess(
		args: DropboxResponse<files.RelocationBatchV2JobStatus>,
	) {
		return args.result[".tag"] == "complete";
	}

	public processBatchDeleteFolderOfFile(args: { paths: string[] }) {
		return this.dropbox
			.filesDeleteBatch({ entries: args.paths.map((path) => ({ path })) })
			.then(async (res) => {
				if (res.result[".tag"] == "complete") return res.result.entries;
				else if (res.result[".tag"] == "async_job_id") {
					return this.batchDeleteFolderOrFileCheck({
						asyncJobId: res.result.async_job_id,
					}).then((res) => res.result.entries);
				} else {
					throw new Error(
						`Unknown ".tag" property: ${res.result[".tag"]}`,
					);
				}
			});
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

	private _batchDeleteFolderOrFileCheck(args: { asyncJobId: string }) {
		return this.dropbox.filesDeleteBatchCheck({
			async_job_id: args.asyncJobId,
		});
	}

	private _batchDeleteFolderOrFileCheckIsSuccess(
		args: DropboxResponse<files.RelocationBatchV2JobStatus>,
	) {
		return args.result[".tag"] == "complete";
	}

	public async processBatchCreateFile(
		args: { path: string; contents: ArrayBuffer }[],
	) {
		console.log("_createFile start:", args);

		const sessionIds = await this._batchCreateFileStart(args.length);
		// If an error happens here, we still need to fire Finally to close the batch
		const { fulfilled, rejected } = await this._batchCreateFileAppend({
			files: args,
			sessionIds,
		});

		// TODO: Should this be returned to the caller??
		const finishResults = await this._batchCreateFileFinish(fulfilled);
		console.log("finishResults:", finishResults);

		// TODO: Handle rejected
		if (rejected.length) {
			console.log("REJECTED UPDATES:", rejected);
		}

		console.log("_createFile return:", finishResults);
		return finishResults;
	}

	private _batchCreateFileStart(numSessions: number) {
		return this.dropbox
			.filesUploadSessionStartBatch({
				num_sessions: numSessions,
			})
			.then((res) => res.result.session_ids);
	}

	private _batchCreateFileAppend(args: {
		files: { path: string; contents: ArrayBuffer }[];
		sessionIds: string[];
	}) {
		const { files, sessionIds } = args;
		const entries = [];
		for (let i = 0; i < files.length; i++) {
			console.log("bytesize:", files[i].contents.byteLength);

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

	private async _batchCreateFileFinish(
		entries: PromiseFulfilledResult<{
			path: string;
			cursor: { offset: number; session_id: string };
			response: DropboxResponse<void>;
		}>[],
	) {
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

	public updateFile(args: {
		path: string;
		rev: string;
		contents: ArrayBuffer;
	}) {
		return this.dropbox
			.filesUpload({
				mode: {
					".tag": "update",
					update: args.rev,
				},
				path: args.path,
				contents: new Blob([args.contents]),
			})
			.catch((e: any) => {
				console.error("Dropbox filesUpload Error:", e);
			});
	}

	public createFileHash(args: { fileData: ArrayBuffer }) {
		return dropboxContentHasher(args.fileData);
	}
}
