import { App, Setting, PluginSettingTab } from "obsidian";
import { PubSub } from "../../lib/pubsub";
import VaultLink from "./main";
import { SelectVaultModal } from "./select-vault-modal";
import { getProvider, ProviderName } from "../providers/provider";

enum Status {
	"CONNECTED",
	"DISCONNECTED",
}

export interface PluginSettings {
	provider: ProviderName | undefined;
	cloudVaultPath: string | undefined;
}

export const DEFAULT_SETTINGS: Partial<PluginSettings> = {
	provider: undefined,
	cloudVaultPath: undefined,
};

export class SettingsTab extends PluginSettingTab {
	private plugin: VaultLink;
	private status: Status;
	private provider: ProviderName | undefined;

	constructor(app: App, plugin: VaultLink) {
		super(app, plugin);

		this.plugin = plugin;
		this.status = Status.DISCONNECTED;
		// This sets the value to the first item in the list. Must update if changing order.
		// TODO: Look into more dynamic way to do this.
		this.provider = this.plugin.settings.provider || ProviderName.DROPBOX;
		// Register pubsub subscriptions
		const pubsub = new PubSub();
		pubsub.subscribe("authorization-success", () => {
			this.status = Status.CONNECTED;
			this.provider = "dropbox" as ProviderName;
			this.plugin.settings.provider = "dropbox" as ProviderName;
			console.log("Provider:", this.plugin.settings.provider);
			console.log("recall display - status:", this.status);
			this.display();
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
		const { containerEl } = this;
		containerEl.empty();

		// const header = containerEl.createEl("header");
		//
		// const title = header.createEl("h1", {
		// 	text: "VaultLink",
		// });
		// title.style.marginBottom = "0";
		//
		// header.createEl("small", {
		// 	text: "Author: Justin Bird",
		// });
		//

		const disconnectedEl = containerEl.createEl("div");
		// TODO: This is duplicated to simplify styling as the first
		// settings item will not have a top border. When using the
		// sub divs for the different app states this ensures the
		// next setting will be formatted correctly. DRY
		new Setting(disconnectedEl)
			.setName("VaultLink")
			.setDesc("Author: Justin Bird")
			.addButton((button) => {
				button.setButtonText("github");
				button.onClick(() => {
					window.location.href =
						"https://www.github.com/thewordisbird/VaultLink";
				});
			})
			.setHeading();

		new Setting(disconnectedEl)
			.setName("Provider")
			.addDropdown((dropdown) => {
				dropdown.addOption(ProviderName.DROPBOX, ProviderName.DROPBOX);
				// This is the first options that is already populated
				dropdown.setValue(ProviderName.DROPBOX);
				dropdown.onChange((value) => {
					this.provider = value as ProviderName;
				});
			})
			.addButton((button) => {
				button.setButtonText("Connect");
				button.setClass("mod-cta");
				if (!this.plugin.settings.provider) {
					button.disabled;
				}

				button.onClick(async () => {
					// TODO: Extract Function
					//
					/* this should instantiate the correct provider
					 * something like:
					 * const provider = new Provider(this.provider);
					 * where the Provider class will return the correct specific provider
					 */

					console.log("provider:", this.provider);
					if (!this.provider) return;

					const provider = getProvider({
						providerName: this.provider,
					});
					if (!provider) return;

					const authUrl = await provider.getAuthenticationUrl();
					const codeVerifier = provider.getCodeVerifier();

					window.sessionStorage.clear();
					window.sessionStorage.setItem("codeVerifier", codeVerifier);
					window.location.href = authUrl as string;
				});
			});

		const connectedEl = containerEl.createEl("div");
		// TODO: This is duplicated to simplify styling as the first
		// settings item will not have a top border. When using the
		// sub divs for the different app states this ensures the
		// next setting will be formatted correctly. DRY
		new Setting(connectedEl)
			.setName("VaultLink")
			.setDesc("Author: Justin Bird")
			.addButton((button) => {
				button.setButtonText("github");
				button.onClick(() => {
					window.location.href =
						"https://www.github.com/thewordisbird/VaultLink";
				});
			})
			.setHeading();
		new Setting(connectedEl)
			.setName("Provider")
			.setDesc(
				`You are connected to ${this.plugin.settings.provider} with the account`,
			)

			.addButton((button) => {
				button.setButtonText("Disconnect");
				button.setClass("mod-cta");
				button.onClick(() => {
					if (!this.provider) return;

					const provider = getProvider({
						providerName: this.provider,
					});
					if (!provider) return;

					provider.revokeAuthorizationToken().then(() => {
						localStorage.removeItem("dropboxRefreshToken");
						this.status = Status.DISCONNECTED;
						this.display();
					});
				});
			});

		new Setting(connectedEl)
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

		console.log("Connection Status:", this.status);
		if (this.status == Status.CONNECTED) {
			connectedEl.show();
			disconnectedEl.hide();
		}
		if (this.status == Status.DISCONNECTED) {
			disconnectedEl.show();
			connectedEl.hide();
		}
	}
}
