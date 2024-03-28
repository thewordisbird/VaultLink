import { App, Setting, PluginSettingTab } from "obsidian";
import ObsidianDropboxConnect from "./main";
import { PubSub } from "./pubsub";
import { VaultSelectModal } from "./select-vault-modal";

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
	}

	async display() {
		/* Everytime the setting tab is loaded check for auth? */
		const authState =
			await this.plugin.dropboxProvider.getAuthorizationState();
		console.log("dropbox authorization state:", authState);

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
		connectDropboxButton.onClickEvent(() =>
			this.plugin.dropboxProvider.getAuthorizationToken(),
		);

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
				cloudDisconnectSection.hide();
				cloudConnectSection.show();
			}),
		);

		// Add dropboxVaultPath setting

		// Display path and a button to launch the selectVaultModal
		new Setting(cloudDisconnectSection)
			.setName("Dropbox Vault Path")
			.setDesc("Select a folder in your Dropbox to sync with Obsidian")
			.addButton((button) =>
				button.setButtonText("Select Folder").onClick(() => {
					new VaultSelectModal(this.app, this.plugin).open();
				}),
			);
		if (authState) {
			cloudConnectSection.hide();
			cloudDisconnectSection.show();
		} else {
			cloudConnectSection.show();
			cloudDisconnectSection.hide();
		}
	}
}
