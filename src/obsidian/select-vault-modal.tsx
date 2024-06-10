import { App, Modal } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import ObsidianDropboxConnect from "./main";
import { PubSub } from "../../lib/pubsub";
import SelectVault from "../react/select-vault";

export class SelectVaultModal extends Modal {
	plugin: ObsidianDropboxConnect;
	root: Root | null = null;
	pubsub: PubSub;

	constructor(app: App, plugin: ObsidianDropboxConnect) {
		super(app);
		this.plugin = plugin;
		this.pubsub = new PubSub();
	}

	async onOpen() {
		/* TODO: The dropbox provider should be a singleton so these can be called where needed */
		const listFolders = this.plugin.dropboxProvider.listFolders.bind(
			this.plugin.dropboxProvider,
		) as typeof this.plugin.dropboxProvider.listFolders;

		const addFolder = this.plugin.dropboxProvider.addFolder.bind(
			this.plugin.dropboxProvider,
		) as typeof this.plugin.dropboxProvider.addFolder;

		const setVaultInSettings = (path: string) => {
			this.pubsub.publish("set-vault-path", { payload: path });
			this.close();
		};
		/* END TODO */

		this.contentEl.style.height = "35vh";
		const rootElm = this.contentEl.createEl("div");
		rootElm.id = "react-root";

		this.root = createRoot(rootElm);
		this.root.render(
			<SelectVault
				currentPath={this.plugin.settings.cloudVaultPath}
				listFolders={listFolders}
				addFolder={addFolder}
				setVaultInSettings={setVaultInSettings}
			/>,
		);
	}

	async onClose() {
		this.root?.unmount();
	}
}
