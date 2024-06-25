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
		this.contentEl.style.height = "35vh";
		const rootElm = this.contentEl.createEl("div");
		rootElm.id = "react-root";

		this.root = createRoot(rootElm);
		this.root.render(
			<SelectVault currentPath={this.plugin.settings.cloudVaultPath} />,
		);
	}

	async onClose() {
		this.root?.unmount();
	}
}
