import { Dropbox, DropboxAuth, DropboxResponse } from "dropbox";
import { ObsidianProtocolData } from "obsidian";

const REDIRECT_URI = "obsidian://connect-dropbox";
const CLIENT_ID = "vofawt4jgywrgey";

export class DropboxProvider {
	dropboxAuth: DropboxAuth;

	constructor() {
		this.dropboxAuth = new DropboxAuth({
			clientId: CLIENT_ID,
		});
	}

	authorizeDropbox() {
		this.dropboxAuth
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

	getAccessToken(protocolData: ObsidianProtocolData) {
		const { code } = protocolData;

		if (!code) throw new Error("Authorization Error: Code Not Available");
		const codeVerifier = window.sessionStorage.getItem("codeVerifier");
		if (!codeVerifier) {
			throw new Error("Authorization Error: Code Verifier Not Available");
		}

		this.dropboxAuth.setCodeVerifier(codeVerifier);

		this.dropboxAuth
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
				},
			)
			.catch((error) => {
				throw new Error(`Authorization Error: ${error} `);
			});
	}

	fetchFileInfo() {
		const dropbox = new Dropbox({
			auth: this.dropboxAuth,
		});
		dropbox
			.filesListFolder({
				path: "",
			})
			.then((response) => {
				console.log("Access Response Data", response.result.entries);
			});
	}
}
