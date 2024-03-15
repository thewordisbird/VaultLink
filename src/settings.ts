import { App, Setting, PluginSettingTab } from "obsidian";
import ObsidianDropboxConnect from "./main";
import { PubSub } from "./pubsub";

export interface PluginSettings {}

export const DEFAULT_SETTINGS: PluginSettings = {};

export class SettingsTab extends PluginSettingTab {
	plugin: ObsidianDropboxConnect;

	constructor(app: App, plugin: ObsidianDropboxConnect) {
		super(app, plugin);
		this.plugin = plugin;

		// Register pubsub subscriptions
		const pubsub = new PubSub();
		pubsub.subscribe("authorization-success", () => {
			console.log("pubsub works!");
			document.getElementById("connect-container")!.hide();
			document.getElementById("disconnect-container")!.show();
		});
	}

	display() {
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

		const connectContainer = containerEl.createEl("section");
		connectContainer.className = "connect_container";
		connectContainer.id = "connect_container";

		const connectDropboxButton = connectContainer.createEl("button");
		connectDropboxButton.innerText = "Connect To Dropbox";
		connectDropboxButton.className = "dropbox_button";
		connectDropboxButton.onClickEvent(() =>
			this.plugin.dropboxProvider.authorizeDropbox(),
		);

		const disconnectContainer = containerEl.createEl("section");
		disconnectContainer.className = "disconnect_container";
		disconnectContainer.id = "disconnect_container";

		const connectionInfo = disconnectContainer.createEl("div");
		connectionInfo.innerHTML = `<p>Connected to dropbox as <span class="dropbox_user_label"> justin.h.bird@gmail.com</p>`;

		const disconnectButton = disconnectContainer.createEl("button");
		disconnectButton.setText("Disconnect From Dropbox");
		disconnectButton.className = "dropbox_button";
		disconnectButton.id = "dbx-btn";
		disconnectButton.onClickEvent(() =>
			this.plugin.dropboxProvider.authorizeDropbox(),
		);

		disconnectContainer.show();
	}
}
