import { App, Modal } from "obsidian";
import VaultLink from "./main";
import { PubSub } from "../../lib/pubsub";
import { Provider, ProviderFolderResult } from "../providers/types";
import { getProvider } from "../providers/provider";
import { ProviderPath, PubsubTopic } from "src/types";

export class SelectVaultModal extends Modal {
	plugin: VaultLink;
	pubsub: PubSub;
	provider: Provider;
	providerVaultPath: ProviderPath;

	constructor(app: App, plugin: VaultLink) {
		super(app);
		this.plugin = plugin;
		this.pubsub = new PubSub();
		this.provider = getProvider({
			providerName: this.plugin.settings.providerName!,
		});
		console.log("constructor path:", this.plugin.settings.providerPath);
		this.providerVaultPath =
			this.plugin.settings.providerPath || ("/" as ProviderPath);
	}

	async onOpen() {
		const { contentEl } = this;
		this.setTitle("Select vault");

		const breadCrumbsEl = contentEl.createEl("div");
		const addFolderEl = contentEl.createEl("div");
		const resultsEl = contentEl.createEl("div");
		const controlsEl = contentEl.createEl("div");

		this.renderBreadCrumbs(breadCrumbsEl, resultsEl);
		const folders = await this.getResults();

		this.renderResults(folders, breadCrumbsEl, resultsEl);

		this.renderControls(controlsEl, addFolderEl, breadCrumbsEl, resultsEl);
	}
	async getResults(): Promise<ProviderFolderResult[]> {
		const queryPath =
			this.providerVaultPath == "/"
				? ("" as ProviderPath)
				: this.providerVaultPath;
		return this.provider
			.listFoldersAndFiles({ vaultRoot: queryPath, recursive: false })
			.then(({ folders }) => folders);
	}

	async onSelectResult(
		path: ProviderPath,
		breadcrumbEl: HTMLElement,
		resultsEl: HTMLElement,
	) {
		console.log("onSelectResult - path:", path);
		this.providerVaultPath = path;
		const folders = await this.getResults();
		this.renderBreadCrumbs(breadcrumbEl, resultsEl);
		this.renderResults(folders, breadcrumbEl, resultsEl);
	}

	renderResults(
		folders: ProviderFolderResult[],
		breadcrumbsEl: HTMLElement,
		resultsEl: HTMLElement,
	) {
		resultsEl.empty();
		for (let folder of folders) {
			let resultEl = resultsEl.createEl("div");
			resultEl.setText(folder.name);
			resultEl.onClickEvent(async () => {
				this.onSelectResult(folder.path, breadcrumbsEl, resultsEl);
			});
		}
	}

	renderBreadCrumbs(breadcumbsEl: HTMLElement, resultsEl: HTMLElement) {
		breadcumbsEl.empty();

		let span = breadcumbsEl.createEl("span");
		span.setText("All folders");
		span.onClickEvent(async () => {
			this.onSelectResult("/" as ProviderPath, breadcumbsEl, resultsEl);
		});

		if (this.providerVaultPath.length > 1) {
			console.log("path:", this.providerVaultPath);
			const clientPath = this.providerVaultPath.slice(0);
			console.log("clientPath:", clientPath);
			this.providerVaultPath
				.slice(1)
				.split("/")
				.map((cur, idx, arr) => {
					console.log("arr:", arr);
					breadcumbsEl.createEl("span").setText(" / ");
					let span = breadcumbsEl.createEl("span");

					span.setText(cur);
					if (idx < arr.length - 1) {
						span.onClickEvent(async () => {
							this.onSelectResult(
								arr.slice(0, idx + 1).join("/") as ProviderPath,
								breadcumbsEl,
								resultsEl,
							);
						});
					}
				});
		}
	}

	renderControls(
		controlsEl: HTMLElement,
		addFolderEl: HTMLElement,
		breadcrumbsEl: HTMLElement,
		resultsEl: HTMLElement,
	) {
		const selectVaultBtn = controlsEl.createEl("button");
		selectVaultBtn.setText("Select vault");
		selectVaultBtn.onClickEvent(() => {
			this.pubsub.publish(PubsubTopic.SET_VAULT_PATH, {
				payload: this.providerVaultPath,
			});
			this.close();
		});

		const addFolderBtn = controlsEl.createEl("button");
		addFolderBtn.setText("Add folder");
		addFolderBtn.onClickEvent(() => {
			this.renderAddFolderInput(addFolderEl, breadcrumbsEl, resultsEl);
			selectVaultBtn.disabled = true;
			addFolderBtn.disabled = true;
		});
	}

	renderAddFolderInput(
		addFolderEl: HTMLElement,
		breadcrumbEl: HTMLElement,
		resultsEl: HTMLElement,
	) {
		const input = addFolderEl.createEl("input", "type=text");

		const saveBtn = addFolderEl.createEl("button");
		saveBtn.setText("Save");
		saveBtn.onClickEvent(async () => {
			const newPath = (this.providerVaultPath +
				"/" +
				input.value) as ProviderPath;
			await this.provider.processBatchCreateFolder({ paths: [newPath] });
			this.onSelectResult(newPath, breadcrumbEl, resultsEl);
		});

		const cancelBtn = addFolderEl.createEl("button");
		cancelBtn.setText("Cancel");
		cancelBtn.onClickEvent(() => {
			addFolderEl.empty();

			// TODO: enable buttons when addFolder is closed
		});
	}

	async onClose() {}
}
