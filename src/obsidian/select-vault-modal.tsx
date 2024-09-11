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
		this.providerVaultPath =
			this.plugin.settings.providerPath || ("/" as ProviderPath);
		this.contentEl.remove();
	}

	async onOpen() {
		const { modalEl } = this;
		this.setTitle("Select vault");

		const breadcrumbsContainerEl = modalEl.createEl("div");
		breadcrumbsContainerEl.addClass("modal-breadcrumbs-container");

		const resultsEl = modalEl.createEl("div");
		resultsEl.addClass("modal-results");

		const controlsEl = modalEl.createEl("div");
		controlsEl.addClass("modal-controls");

		resultsEl.setAttrs({
			style: "overflow-y: auto; height: 100% ",
		});

		this.renderBreadCrumbs(breadcrumbsContainerEl, resultsEl);
		const folders = await this.getResults();

		this.renderResults(folders, breadcrumbsContainerEl, resultsEl);

		this.renderControls(controlsEl);
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
		resultsEl.setAttribute("style", "overflow-y:auto");
		for (let folder of folders) {
			let resultEl = resultsEl.createEl("div");
			resultEl.setText(folder.name);
			resultEl.className = "suggestion-item mod-complex";
			resultEl.onmouseover = () => resultEl.addClass("is-selected");
			resultEl.onmouseout = () => resultEl.removeClass("is-selected");

			resultEl.onClickEvent(async () => {
				this.onSelectResult(folder.path, breadcrumbsEl, resultsEl);
			});
		}
	}

	renderBreadCrumbs(
		breadcrumbsContainerEl: HTMLElement,
		resultsEl: HTMLElement,
	) {
		breadcrumbsContainerEl.empty();

		const breadcrumbsControlContainer =
			breadcrumbsContainerEl.createEl("div");
		breadcrumbsControlContainer.addClass("breadcrumbs-control-container");

		const breadcrumbsEl = breadcrumbsControlContainer.createEl("div");
		breadcrumbsEl.addClass("modal-breadcrumbs");

		const addFolderBtn = breadcrumbsControlContainer.createEl("button");
		addFolderBtn.addClass("modal-add-folder-btn");
		addFolderBtn.setText("Add folder");
		addFolderBtn.onClickEvent(handleShowAddFolderForm);

		const addFolderFormContainer =
			breadcrumbsControlContainer.createEl("div");
		addFolderFormContainer.addClass("add-folder-form-container");
		addFolderFormContainer.hide();

		const addFolderFormInputLabel =
			addFolderFormContainer.createEl("label");
		addFolderFormInputLabel.addClass("add-folder-form-input-label");
		addFolderFormInputLabel.setText(" / ");
		const addFolderFormInput = addFolderFormInputLabel.createEl("input");
		addFolderFormInput.addClass("add-folder-form-input");

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
			const newPath = (this.providerVaultPath +
				"/" +
				addFolderFormInput.value) as ProviderPath;
			await this.provider.processBatchCreateFolder({ paths: [newPath] });
			this.onSelectResult(newPath, breadcrumbsContainerEl, resultsEl);
		});
		function handleShowAddFolderForm() {
			addFolderFormContainer.show();
			addFolderBtn.hide();
		}

		function handleShowAddFolderBtn() {
			addFolderFormContainer.hide();
			addFolderBtn.show();
		}

		let rootSpan = breadcrumbsEl.createEl("span");

		rootSpan.setText("All folders");
		rootSpan.onClickEvent(async () => {
			this.onSelectResult(
				"/" as ProviderPath,
				breadcrumbsContainerEl,
				resultsEl,
			);
		});

		if (this.providerVaultPath.length > 1) {
			rootSpan.addClass("breadcrumb-clickable");
			this.providerVaultPath
				.slice(1)
				.split("/")
				.map((cur, idx, arr) => {
					console.log("cur, idx,  arr:", cur, idx, arr);
					breadcrumbsEl.createEl("span").setText(" / ");
					let span = breadcrumbsEl.createEl("span");

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
								breadcrumbsContainerEl,
								resultsEl,
							);
						});
					}
				});
		}
	}

	renderControls(controlsEl: HTMLElement) {
		const selectVaultBtn = controlsEl.createEl("button");
		selectVaultBtn.setText("Select vault");
		selectVaultBtn.addClass("mod-cta");
		selectVaultBtn.onClickEvent(() => {
			this.pubsub.publish(PubsubTopic.SET_VAULT_PATH, {
				payload: this.providerVaultPath,
			});
			this.close();
		});
	}

	// renderAddFolderForm(addFolderFormContainerEl: HTMLElement) {
	// 	const input = addFolderEl.createEl("input", "type=text");
	//
	// 	const saveBtn = addFolderEl.createEl("button");
	// 	saveBtn.setText("Save");
	// 	saveBtn.onClickEvent(async () => {
	// 		const newPath = (this.providerVaultPath +
	// 			"/" +
	// 			input.value) as ProviderPath;
	// 		await this.provider.processBatchCreateFolder({ paths: [newPath] });
	// 		this.onSelectResult(newPath, breadcrumbEl, resultsEl);
	// 	});
	//
	// 	const cancelBtn = addFolderEl.createEl("button");
	// 	cancelBtn.setText("Cancel");
	// 	cancelBtn.onClickEvent(() => {
	// 		addFolderEl.empty();
	//
	// 		// TODO: enable buttons when addFolder is closed
	// 	});
	// }

	async onClose() {}
}
