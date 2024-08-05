import { Dropbox, DropboxAuth, DropboxResponse, files } from "dropbox";
import { dropboxContentHasher } from "./dropbox.hasher";
import { batchProcess, throttleProcess } from "src/utils";
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
const BATCH_DELAY_TIME = 1000;
const THROTTLE_DELAY_TIME = 500;

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
				const files = res.result.entries.filter(
					(entry) => entry[".tag"] === "file",
				);

				return {
					files,
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
				const files = res.result.entries.filter(
					(entry) => entry[".tag"] === "file",
				);

				return {
					files,
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
	getUserInfo(): Promise<void> {
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
	batchCreateFolder = batchProcess(
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

	batchRenameFolderOrFile = batchProcess(
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
	createFile = throttleProcess(
		this._createFile.bind(this),
		THROTTLE_DELAY_TIME,
	);

	private _createFile({
		path,
		contents,
		callback,
	}: {
		path: string;
		contents: string;
		callback: (args: files.FileMetadata) => void;
	}) {
		return this.dropbox
			.filesUpload({
				path: path,
				contents: contents,
			})
			.then((res) => callback(res.result))
			.catch((e: any) => {
				console.error("Dropbox filesUpload Error:", e);
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
