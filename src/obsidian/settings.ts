import { App, Setting, PluginSettingTab } from "obsidian";
import ObsidianDropboxConnect from "./main";
import { PubSub } from "../../lib/pubsub";
import { SelectVaultModal } from "./select-vault-modal";

export interface PluginSettings {
	provider?: "dropbox";
	cloudVaultPath?: string;
}

export const DEFAULT_SETTINGS: Partial<PluginSettings> = {};

export class SettingsTab extends PluginSettingTab {
	plugin: ObsidianDropboxConnect;

	constructor(app: App, plugin: ObsidianDropboxConnect) {
		super(app, plugin);
		this.plugin = plugin;

		// Register pubsub subscriptions
		const pubsub = new PubSub();
		pubsub.subscribe("authorization-success", () => {
			document.getElementById("connect_container")!.hide();
			document.getElementById("disconnect_container")!.show();
		});

		pubsub.subscribe(
			"set-vault-path",
			async (args: { payload: string }) => {
				const { payload } = args;
				this.plugin.settings.cloudVaultPath = payload;
				await this.plugin.saveSettings();
				const vaultPathInput = document.getElementById(
					"vault_path_input",
				) as HTMLInputElement;
				vaultPathInput.value = payload;
			},
		);
	}

	async display() {
		/* Everytime the setting tab is loaded check for auth? */
		const authState =
			await this.plugin.dropboxProvider.getAuthorizationState();

		const { containerEl } = this;

		containerEl.empty();

		const header = containerEl.createEl("header");
		const title = header.createEl("h1", {
			text: "Dropbox Connect (Unofficial)",
		});
		title.style.marginBottom = "0";
		const author = header.createEl("small", {
			text: "Author: Justin Bird",
		});

		const cloudConnectSection = containerEl.createEl("section");
		cloudConnectSection.className = "settings_section";
		cloudConnectSection.id = "connect_container";

		const connectDropboxButton = cloudConnectSection.createEl("button");
		connectDropboxButton.innerText = "Connect To Dropbox";
		connectDropboxButton.className = "dropbox_button";
		connectDropboxButton.onClickEvent(async () => {
			const authUrl =
				await this.plugin.dropboxProvider.getAuthenticationUrl();
			const codeVerifier = this.plugin.dropboxProvider.getCodeVerifier();

			window.sessionStorage.clear();
			window.sessionStorage.setItem("codeVerifier", codeVerifier);
			window.location.href = authUrl as string;
		});

		const cloudDisconnectSection = containerEl.createEl("section");
		cloudDisconnectSection.className = "settings_section";
		cloudDisconnectSection.id = "disconnect_container";

		const connectionInfo = cloudDisconnectSection.createEl("div");
		connectionInfo.innerHTML = `<p>Connected to dropbox as <span class="dropbox_user_label"> justin.h.bird@gmail.com</p>`;

		const disconnectButton = cloudDisconnectSection.createEl("button");
		disconnectButton.setText("Disconnect From Dropbox");
		disconnectButton.className = "dropbox_button";
		disconnectButton.id = "dbx-btn";
		disconnectButton.onClickEvent(() =>
			this.plugin.dropboxProvider.revokeAuthorizationToken().then(() => {
				localStorage.removeItem("dropboxRefreshToken");
				cloudDisconnectSection.hide();
				cloudConnectSection.show();
			}),
		);

		// Add dropboxVaultPath setting

		// Display path and a button to launch the selectVaultModal
		new Setting(cloudDisconnectSection)
			.setName("Dropbox Vault Path")
			.setDesc("Select a folder in your Dropbox to sync with Obsidian")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.cloudVaultPath || "")
					.setDisabled(true),
			)
			.addButton((button) =>
				button.setButtonText("Select Folder").onClick(() => {
					new SelectVaultModal(this.app, this.plugin).open();
				}),
			)
			.then((setting) => {
				setting.controlEl.children[0].id = "vault_path_input";
			});

		if (authState) {
			cloudConnectSection.hide();
			cloudDisconnectSection.show();
		} else {
			cloudConnectSection.show();
			cloudDisconnectSection.hide();
		}
	}
}
