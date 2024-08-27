import { App, Setting, PluginSettingTab, Notice } from "obsidian";
import { PubSub } from "../../lib/pubsub";
import VaultLink from "./main";
import { SelectVaultModal } from "./select-vault-modal";
import { getProvider, ProviderName } from "../providers/provider";
import { Provider } from "src/providers/types";
import { PubsubTopic } from "src/types";

enum Status {
	"CONNECTED",
	"DISCONNECTED",
}

export interface PluginSettings {
	providerName: ProviderName | undefined;
	cloudVaultPath: string | undefined;
}

export const DEFAULT_SETTINGS: Partial<PluginSettings> = {
	providerName: undefined,
	cloudVaultPath: undefined,
};

export class SettingsTab extends PluginSettingTab {
	private plugin: VaultLink;
	private status: Status;
	private providerName: ProviderName | undefined;
	// TODO: Can this be typed as the general Provider that all provider
	// instances will satisfy?
	private provider: Provider | undefined;

	constructor(app: App, plugin: VaultLink) {
		super(app, plugin);

		this.plugin = plugin;
		this.status = Status.DISCONNECTED;
		// This sets the value to the first item in the list. Must update if changing order.
		// TODO: Look into more dynamic way to do this.
		this.providerName =
			this.plugin.settings.providerName || ProviderName.DROPBOX;
		this.provider = getProvider({ providerName: this.providerName });

		// Register pubsub subscriptions
		const pubsub = new PubSub();
		pubsub.subscribe(PubsubTopic.AUTHORIZATION_SUCCESS, () => {
			this.status = Status.CONNECTED;
			this.plugin.settings.providerName = "dropbox" as ProviderName;
			this.providerName = "dropbox" as ProviderName;
			this.provider = getProvider({ providerName: this.providerName });
			this.display();
		});

		pubsub.subscribe(PubsubTopic.AUTHORIZATION_FAILURE, () => {
			new Notice(
				`Provider Authorization Error: Unable to authorize ${this.providerName?.toUpperCase()}`,
				0,
			);
			this.display();
		});

		pubsub.subscribe(
			PubsubTopic.SET_VAULT_PATH,
			(args: { payload: string }) => {
				const { payload } = args;

				const vaultPathInput = document.getElementById(
					"vault_path_input",
				) as HTMLInputElement;
				vaultPathInput.value = payload;
			},
		);

		pubsub.subscribe(
			PubsubTopic.SYNC_ERROR,
			(args: { payload: string }) => {
				new Notice(args.payload, 0);
			},
		);
	}

	async display() {
		const { containerEl } = this;
		containerEl.empty();

		const disconnectedEl = containerEl.createEl("div");
		// TODO: This is duplicated to simplify styling as the first
		// settings item will not have a top border. When using the
		// sub divs for the different app states this ensures the
		// next setting will be formatted correctly. DRY
		new Setting(disconnectedEl)
			.setName("VaultLink")
			.setDesc("Author: Justin Bird")
			.addButton((button) => {
				button.setButtonText("VaultLink on github");
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
					this.providerName = value as ProviderName;
				});
			})
			.addButton((button) => {
				button.setButtonText("Connect");
				button.setClass("mod-cta");
				if (!this.plugin.settings.providerName) {
					button.disabled;
				}

				button.onClick(async () => {
					if (!this.providerName) return;

					this.provider = getProvider({
						providerName: this.providerName,
					});
					if (!this.provider) return;

					const authUrl = await this.provider.getAuthenticationUrl();
					const codeVerifier = this.provider.getCodeVerifier();

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
				button.setButtonText("VaultLink on github");
				button.onClick(() => {
					window.location.href =
						"https://www.github.com/thewordisbird/VaultLink";
				});
			})
			.setHeading();
		new Setting(connectedEl)
			.setName(
				`Provider: ${this.plugin.settings.providerName?.toUpperCase()}`,
			)
			.setDesc(
				`You are connected to ${this.plugin.settings.providerName?.toUpperCase()} with the account ${this.provider?.email?.toUpperCase()}`,
			)

			.addButton((button) => {
				button.setButtonText("Disconnect");
				button.setClass("mod-cta");
				button.onClick(() => {
					if (!this.provider) return;

					this.provider.revokeAuthorizationToken().then(() => {
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
