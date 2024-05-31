import { Dropbox, DropboxAuth, DropboxResponse, files } from "dropbox";

type DropboxAccount = {
	accountId: string;
	email: string;
};

type DropboxState = {
	account: DropboxAccount;
};

export const REDIRECT_URI = "obsidian://connect-dropbox";
export const CLIENT_ID = "vofawt4jgywrgey";

export const DROPBOX_PROVIDER_ERRORS = {
	authenticationError: "Auth Error: Unable to authenticate with dropbox",
};

export class DropboxProvider {
	dropbox: Dropbox;
	dropboxAuth: DropboxAuth;
	state = {} as DropboxState;

	constructor() {
		this.dropboxAuth = new DropboxAuth({
			clientId: CLIENT_ID,
		});

		this.dropbox = new Dropbox({
			auth: this.dropboxAuth,
		});
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

		//return { refreshToken: res.result.refresh_token };
		/*
		return this.dropboxAuth
			.getAccessTokenFromCode(REDIRECT_URI, authorizationCode)
			.then(
				(
					res: DropboxResponse<{
						access_token: string;
						refresh_token: string;
					}>,
				) => {

				},
			)
			.catch((_e) => {
			});
	*/
	}

	revokeAuthorizationToken(): Promise<void> {
		return this.dropbox
			.authTokenRevoke()
			.then(() => {
				localStorage.removeItem("dropboxRefreshToken");
			})
			.catch((error) => console.error(error));
	}

	authorizeWithRefreshToken(): void {
		const refreshToken = localStorage.getItem("dropboxRefreshToken");
		if (!refreshToken) return;

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

	listFolders(
		args: files.ListFolderArg,
	): Promise<void | DropboxResponse<files.ListFolderResult>> {
		return this.dropbox
			.filesListFolder(args)
			.catch((error) => console.error(error));
	}

	addFolder(
		path: string,
	): Promise<DropboxResponse<files.CreateFolderResult>> {
		return this.dropbox.filesCreateFolderV2({ path });
	}

	getUserInfo(): Promise<void> {
		const dropbox = new Dropbox({
			auth: this.dropboxAuth,
		});
		return dropbox.usersGetCurrentAccount().then((response) => {
			this.state.account = {
				accountId: response.result.account_id,
				email: response.result.email,
			};
		});
	}
}
