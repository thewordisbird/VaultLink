import { Dropbox, DropboxAuth, DropboxResponse, files } from "dropbox";
import { ObsidianProtocolData } from "obsidian";

type DropboxAccount = {
	accountId: string;
	email: string;
};

type DropboxState = {
	account: DropboxAccount;
};

const REDIRECT_URI = "obsidian://connect-dropbox";
const CLIENT_ID = "vofawt4jgywrgey";

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
	getAuthorizationToken(): Promise<void> {
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
			.then((authUrl) => {
				window.sessionStorage.clear();
				window.sessionStorage.setItem(
					"codeVerifier",
					this.dropboxAuth.getCodeVerifier(),
				);
				window.location.href = authUrl as string;
			})
			.catch((error) => console.error(error));
	}

	getAccessToken(protocolData: ObsidianProtocolData): Promise<void> {
		const { code } = protocolData;

		if (!code) throw new Error("Authorization Error: Code Not Available");

		const codeVerifier = window.sessionStorage.getItem("codeVerifier");
		if (!codeVerifier) {
			throw new Error("Authorization Error: Code Verifier Not Available");
		}

		this.dropboxAuth.setCodeVerifier(codeVerifier);

		return this.dropboxAuth
			.getAccessTokenFromCode(REDIRECT_URI, code)
			.then(
				(
					response: DropboxResponse<{
						access_token: string;
						refresh_token: string;
					}>,
				) => {
					this.dropboxAuth.setAccessToken(
						response.result.access_token,
					);

					this.dropboxAuth.setRefreshToken(
						response.result.refresh_token,
					);

					// Store Refresh token in local storage for persistant authorization
					localStorage.setItem(
						"dropboxRefreshToken",
						response.result.refresh_token,
					);
				},
			)
			.catch((error) => console.error(error));
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

	fetchFileInfo(): Promise<void | DropboxResponse<files.ListFolderResult>> {
		return this.dropbox
			.filesListFolder({
				path: "",
			})
			.catch((error) => console.error(error));
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
