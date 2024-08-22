import { Dropbox, DropboxAuth, DropboxResponse, files } from "dropbox";
import { dropboxContentHasher } from "./dropbox.hasher";
import { batch, batchProcess } from "src/utils";
import type { Folder } from "../types";
import { Provider } from "./types";
import { TFile } from "obsidian";

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
const BATCH_DELAY_TIME = 1000;
const THROTTLE_DELAY_TIME = 100;

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
	batchCreateFolder = batch<string>(
		this._batchCreateFolder.bind(this),
		BATCH_DELAY_TIME,
	);

	private _batchCreateFolder(paths: string[]) {
		console.log("_batchDeleteFolderOrFile:", paths);
		this.dropbox
			.filesCreateFolderBatch({ paths })
			.then((res) => {
				// This returns a job id that needs to be checked to confirm
				// if the process was successful. this will require a quing process
				// for the plugin to continue to check if there are sync issues
				console.log("filesCreateFolderBatch Res:", res);
			})
			.catch((e: any) => {
				console.error("Dropbox filesCreateFolderBatch Error:", e);
			});
	}

	batchRenameFolderOrFile = batch<{ from_path: string; to_path: string }>(
		this._batchRenameFolderOrFile.bind(this),
		BATCH_DELAY_TIME,
	);

	private _batchRenameFolderOrFile(
		args: { from_path: string; to_path: string }[],
	) {
		console.log("_batchRenameFolderOrFile:", args);
		this.dropbox
			.filesMoveBatchV2({ entries: args })
			.then((res) => {
				// This returns a job id that needs to be checked to confirm
				// if the process was successful. this will require a quing process
				// for the plugin to continue to check if there are sync issues
				console.log("filesCreateFolderBatch Res:", res);
				// @ts-ignore
				this.watchForBatchToComplete(res.result.async_job_id);
			})
			.catch((e: any) => {
				console.error("Dropbox filesCreateFolderBatch Error:", e);
			});
	}

	async watchForBatchToComplete(
		batchId: string,
		//callback: (args: files.RelocationBatchResultEntry) => void
	) {
		let intervalId = setInterval(() => {
			console.log("Ping...");
			this._watchForBatchToComplete(batchId).then((res) => {
				if (res.result[".tag"] == "complete") {
					clearInterval(intervalId);
					// iterate over entries to make sure everything was successful
					// for (let entry of res.result.entries){
					// 	callback(entry);
					// }
				}
			});
		}, 2000);
	}

	private _watchForBatchToComplete(batchId: string) {
		return this.dropbox.filesMoveBatchCheckV2({ async_job_id: batchId });
	}

	batchDeleteFolderOrFile = batchProcess(
		this._batchDeleteFolderOfFile.bind(this),
		BATCH_DELAY_TIME,
	);

	private _batchDeleteFolderOfFile(paths: string[]) {
		console.log("_batchDeleteFolderOrFile:", paths);
		this.dropbox
			.filesDeleteBatch({ entries: paths.map((path) => ({ path })) })
			.then((res) => {
				// This returns a job id that needs to be checked to confirm
				// if the process was successful. this will require a quing process
				// for the plugin to continue to check if there are sync issues
				console.log("filesDeleteBatch Res:", res);
			})
			.catch((e: any) => {
				console.error("Dropbox filesDeleteBatch Error:", e);
			});
	}
	// TODO: Throttle is the wrong name for this. it should be batch or delay
	batchCreateFile = batch<{ path: string; contents: ArrayBuffer }>(
		this._createFile.bind(this),
		500,
	);
	async _createFile(args: { path: string; contents: ArrayBuffer }[]) {
		console.log("_createFile args:", args);

		const sessionIds = await this._batchCreateFileStart(args.length);
		// If an error happens here, we still need to fire Finally to close the batch
		const { fulfilled, rejected } = await this._batchCreateFileAppend({
			files: args,
			sessionIds,
		});

		await this._batchCreateFileFinish(fulfilled);

		// TODO: Handle rejected
		if (rejected.length) {
			console.log("REJECTED UPDATES:", rejected);
		}
	}

	_batchCreateFileStart(numSessions: number) {
		return this.dropbox
			.filesUploadSessionStartBatch({
				num_sessions: numSessions,
			})
			.then((res) => res.result.session_ids);
	}

	_batchCreateFileAppend(args: {
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
	async _batchCreateFileFinish(
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

	/*
	modifyFile({
		path,
		contents,
		rev,
	}: {
		path: string;
		contents: ArrayBuffer;
		rev: string;
	}) {
		console.log("modifyFile:", path, contents, rev);
		return this.dropbox
			.filesUpload({
				mode: {
					".tag": "update",
					update: rev,
				},
				path: path,
				contents: new Blob([contents]),
			})
			.catch((e: any) => {
				console.error("Dropbox filesUpload Error:", e);
			});
	}

	// TODO: rename to updateFile
	overwriteFile(args: { path: string; contents: ArrayBuffer }) {
		console.log("overwriteFile:", args.path, args.contents);
		return this.dropbox
			.filesUpload({
				mode: {
					".tag": "overwrite",
				},
				path: args.path,
				contents: new Blob([args.contents]),
			})
			.catch((e: any) => {
				console.error("Dropbox filesUpload Error:", e);
			});
	}
	*/
	updateFile(args: { path: string; rev: string; contents: ArrayBuffer }) {
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

	async sync(path: string) {
		// call listfolders and populate revMap
		let res = await this.dropbox.filesListFolder({ path, recursive: true });
		do {
			for (let entry of res.result.entries) {
				console.log(entry);
			}
			res = await this.dropbox.filesListFolderContinue({
				cursor: res.result.cursor,
			});
		} while (res.result.has_more);
	}

	getFileMetadata(args: {
		path: string;
	}): Promise<files.FileMetadataReference> {
		return this.dropbox
			.filesGetMetadata({
				path: args.path,
			})
			.then((res) => {
				if (res.result[".tag"] != "file") {
					throw new Error("Error: file metadata does not exist");
				}
				return res.result;
			});
	}

	// DEPRECIATED
	createDropboxContentHash(args: { fileData: ArrayBuffer }) {
		return dropboxContentHasher(args.fileData);
	}

	createFileHash(args: { fileData: ArrayBuffer }) {
		return dropboxContentHasher(args.fileData);
	}
}
