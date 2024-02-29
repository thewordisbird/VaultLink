import { Plugin } from "obsidian";
import { Dropbox, DropboxAuth } from "dropbox";
import { DEFAULT_SETTINGS, SettingsTab } from "./settings";
import type { PluginSettings } from "./settings";

// TODO: create dropbox class

const REDIRECT_URI = "obsidian://connect-dropbox";
const CLIENT_ID = "vofawt4jgywrgey";

export default class ObsidianDropboxConnect extends Plugin {
	settings: PluginSettings;
	dropboxAuth: DropboxAuth;
	authorizeDropbox: () => void;
	fetchFileInfo: () => void;

	async onload() {
		await this.loadSettings();

		this.dropboxAuth = new DropboxAuth({
			clientId: CLIENT_ID,
		});

		this.authorizeDropbox = () => {
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
		};

		this.fetchFileInfo = () => {
			const dropbox = new Dropbox({
				auth: this.dropboxAuth,
			});
			dropbox
				.filesListFolder({
					path: "",
				})
				.then((response) => {
					console.log(
						"Access Response Data",
						response.result.entries,
					);
				});
		};

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SettingsTab(this.app, this));

		this.registerObsidianProtocolHandler("connect-dropbox", (response) => {
			const { code } = response;

			console.log("callback response", response);
			console.log("window location", window.location);

			if (code) {
				console.log("Code present");
				// showPageSection("authed-section");
				const codeVerifier =
					window.sessionStorage.getItem("codeVerifier");
				if (!codeVerifier)
					throw new Error(
						"Authorization Error: Code Verifier Not Available",
					);

				this.dropboxAuth.setCodeVerifier(codeVerifier);
				this.dropboxAuth
					.getAccessTokenFromCode(REDIRECT_URI, code)
					.then((response) => {
						this.dropboxAuth.setAccessToken(
							(response as any).result.access_token,
						);
						const dropbox = new Dropbox({
							auth: this.dropboxAuth,
						});
						return dropbox.filesListFolder({
							path: "",
						});
					})
					.then((response) => {
						// this should contain user data from DB
						console.log(
							"Access Response Data",
							response.result.entries,
						);
						//renderItems(response.result.entries);
					})
					.catch((error) => {
						console.error(error.error || error);
					});
			} else {
				//showPageSection("pre-auth-section");
			}
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
