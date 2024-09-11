import { App, Modal } from "obsidian";
import VaultLink from "./main";
import { PubSub } from "../../lib/pubsub";
import { Provider, ProviderFolderResult } from "../providers/types";
import { getProvider } from "../providers/provider";
import { ProviderPath, PubsubTopic } from "src/types";
import { poroviderCreateFolderError, providerListFolderError } from "./notice";

export class SelectVaultModal extends Modal {
	plugin: VaultLink;
	pubsub: PubSub;
	provider: Provider;
	providerVaultPath: ProviderPath;

	breadcrumbsContainerEl: HTMLElement;
	resultsEl: HTMLElement;
	controlsEl: HTMLElement;

	constructor(app: App, plugin: VaultLink) {
		super(app);
		this.plugin = plugin;
		this.pubsub = new PubSub();
		this.provider = getProvider({
			providerName: this.plugin.settings.providerName!,
		});
		this.providerVaultPath =
			this.plugin.settings.providerPath || ("/" as ProviderPath);
		this.contentEl.remove();
	}

	async onOpen() {
		this.setTitle("Select vault");
		this.breadcrumbsContainerEl = this.modalEl.createEl("div");
		this.resultsEl = this.modalEl.createEl("div");
		this.controlsEl = this.modalEl.createEl("div");

		let folders: ProviderFolderResult[] = [];
		try {
			folders = await this.getResults();
		} catch (e) {
			providerListFolderError(e);
		} finally {
			this.renderBreadCrumbs();
			this.renderResults(folders);
			this.renderControls();
		}
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

	async onSelectResult(path: ProviderPath) {
		this.providerVaultPath = path;
		let folders: ProviderFolderResult[] = [];
		try {
			folders = await this.getResults();
		} catch (e) {
			providerListFolderError(e);
		} finally {
			this.renderBreadCrumbs();
			this.renderResults(folders);
		}
	}

	renderResults(folders: ProviderFolderResult[]) {
		this.resultsEl.empty();
		this.resultsEl.addClass("modal-results");

		if (folders.length == 0) {
			const emptyResultEl = this.resultsEl.createEl("div");
			emptyResultEl.addClass("empty-result");
			emptyResultEl.setText("This folder is empty");
		}
		for (let folder of folders) {
			const resultEl = this.resultsEl.createEl("div");
			resultEl.setText(folder.name);
			resultEl.className = "suggestion-item mod-complex";
			resultEl.onmouseover = () => resultEl.addClass("is-selected");
			resultEl.onmouseout = () => resultEl.removeClass("is-selected");
			resultEl.onClickEvent(async () => {
				this.onSelectResult(folder.path);
			});
		}
	}

	renderBreadCrumbs() {
		this.breadcrumbsContainerEl.empty();
		this.breadcrumbsContainerEl.addClass("modal-breadcrumbs-container");

		// const breadcrumbsControlContainer =
		// 	this.breadcrumbsContainerEl.createEl("div");
		// breadcrumbsControlContainer.addClass("breadcrumbs-control-container");

		const breadcrumbsEl = this.breadcrumbsContainerEl.createEl("div");

		const addFolderBtn = this.breadcrumbsContainerEl.createEl("button");
		addFolderBtn.setText("Add folder");
		addFolderBtn.onClickEvent(handleShowAddFolderForm);

		const addFolderFormContainer =
			this.breadcrumbsContainerEl.createEl("div");
		addFolderFormContainer.addClass("add-folder-form-container");
		addFolderFormContainer.hide();

		const addFolderFormInputLabel =
			addFolderFormContainer.createEl("label");
		addFolderFormInputLabel.setText(" / ");

		const addFolderFormInput = addFolderFormInputLabel.createEl("input");

		const addFolderFormControlContainer =
			addFolderFormContainer.createEl("div");
		addFolderFormControlContainer.addClass(
			"add-folder-form-control-container",
		);

		const addFolderFormCancelBtn =
			addFolderFormControlContainer.createEl("button");
		addFolderFormCancelBtn.setText("Cancel");
		addFolderFormCancelBtn.onClickEvent(handleShowAddFolderBtn);

		const addFolderFormSaveBtn =
			addFolderFormControlContainer.createEl("button");
		addFolderFormSaveBtn.setText("Save");
		addFolderFormSaveBtn.addClass("mod-cta");
		addFolderFormSaveBtn.onClickEvent(async () => {
			if (addFolderFormInput.value == "") return;
			const newPath = (this.providerVaultPath +
				"/" +
				addFolderFormInput.value) as ProviderPath;

			try {
				await this.provider.processBatchCreateFolder({
					paths: [newPath],
				});
				this.onSelectResult(newPath);
			} catch (e) {
				poroviderCreateFolderError(e);
			}
		});

		function handleShowAddFolderForm() {
			addFolderFormContainer.show();
			addFolderBtn.hide();
		}

		function handleShowAddFolderBtn() {
			addFolderFormContainer.hide();
			addFolderBtn.show();
		}

		const rootSpan = breadcrumbsEl.createEl("span");
		rootSpan.setText("All folders");
		rootSpan.onClickEvent(async () => {
			this.onSelectResult("/" as ProviderPath);
		});

		if (this.providerVaultPath.length > 1) {
			rootSpan.addClass("breadcrumb-clickable");
			this.providerVaultPath
				.slice(1)
				.split("/")
				.map((cur, idx, arr) => {
					breadcrumbsEl.createEl("span").setText(" / ");
					const span = breadcrumbsEl.createEl("span");
					span.setText(cur);

					if (idx < arr.length - 1) {
						console.log("Not Last Item");
						span.addClass("breadcrumb-clickable");
						span.onClickEvent(async () => {
							this.onSelectResult(
								("/" +
									arr
										.slice(0, idx + 1)
										.join("/")) as ProviderPath,
							);
						});
					}
				});
		}
	}

	renderControls() {
		this.contentEl.empty();
		this.controlsEl.addClass("modal-controls");

		const selectVaultBtn = this.controlsEl.createEl("button");
		selectVaultBtn.setText("Select vault");
		selectVaultBtn.addClass("mod-cta");
		selectVaultBtn.onClickEvent(() => {
			this.pubsub.publish(PubsubTopic.SET_VAULT_PATH, {
				payload: this.providerVaultPath,
			});
			this.close();
		});
	}

	async onClose() {
		this.breadcrumbsContainerEl.remove();
		this.resultsEl.remove();
		this.controlsEl.remove();
	}
}
