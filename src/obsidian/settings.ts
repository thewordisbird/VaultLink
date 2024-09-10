import { App, Setting, PluginSettingTab } from "obsidian";
import { PubSub } from "../../lib/pubsub";
import VaultLink from "./main";
import { SelectVaultModal } from "./select-vault-modal";
import { getProvider, ProviderName } from "../providers/provider";
import { Provider } from "src/providers/types";
import { ClientPath, ProviderPath, PubsubTopic } from "src/types";
import { providerAuthError, providerSyncError } from "./notice";

enum Status {
	"CONNECTED",
	"DISCONNECTED",
}

export interface PluginSettings {
	providerName: ProviderName | undefined;
	providerPath: ProviderPath | undefined;
	providerPathDisplay: ClientPath | undefined;
}

export const DEFAULT_SETTINGS: Partial<PluginSettings> = {
	providerName: undefined,
	providerPath: undefined,
	providerPathDisplay: undefined,
};

export class SettingsTab extends PluginSettingTab {
	private plugin: VaultLink;
	private status: Status;
	private providerName: ProviderName | undefined;
	private pubsub: PubSub;

	// TODO: Can this be typed as the general Provider that all provider
	// instances will satisfy?
	private provider: Provider | undefined;

	constructor(app: App, plugin: VaultLink) {
		super(app, plugin);

		this.plugin = plugin;
		this.status = Status.DISCONNECTED;
		// This sets the value to the first item in the list. Must update if changing order.
		// TODO: Look into more dynamic way to do this.
		this.providerName = this.plugin.settings.providerName || "dropbox";
		this.provider = getProvider({ providerName: this.providerName });

		// Register pubsub subscriptions
		this.pubsub = new PubSub();
		this.pubsub.subscribe(PubsubTopic.AUTHORIZATION_SUCCESS, () => {
			this.status = Status.CONNECTED;
			this.plugin.settings.providerName = "dropbox" as ProviderName;
			this.providerName = "dropbox" as ProviderName;
			this.provider = getProvider({ providerName: this.providerName });
			this.display();
		});

		this.pubsub.subscribe(PubsubTopic.AUTHORIZATION_FAILURE, () => {
			providerAuthError();
			this.display();
		});

		this.pubsub.subscribe(PubsubTopic.AUTHORIZATION_DISCONNECT, () => {
			localStorage.removeItem("dropboxRefreshToken");
			this.status = Status.DISCONNECTED;
			this.plugin.settings.providerName = undefined;
			this.plugin.settings.providerPath = undefined;
			this.plugin.settings.providerPathDisplay = undefined;
			this.display();
		});

		this.pubsub.subscribe(
			PubsubTopic.SET_VAULT_PATH,
			(args: { payload: string }) => {
				const { payload } = args;

				console.log("SVP payload:", payload);
				const vaultPathInput = document.getElementById(
					"vault_path_input",
				) as HTMLInputElement;
				vaultPathInput.value = payload;
			},
		);

		this.pubsub.subscribe(
			PubsubTopic.SYNC_ERROR,
			(args: { payload: string }) => {
				providerSyncError(args.payload);
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
				dropdown.addOption("dropbox", "dropbox");
				// This is the first options that is already populated
				dropdown.setValue("dropbox");
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

					try {
						const authUrl =
							await this.provider.getAuthenticationUrl();
						const codeVerifier = this.provider.getCodeVerifier();

						window.sessionStorage.clear();
						window.sessionStorage.setItem(
							"codeVerifier",
							codeVerifier,
						);
						window.location.href = authUrl;
					} catch (e) {
						providerAuthError(e);
					}
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
						this.pubsub.publish(
							PubsubTopic.AUTHORIZATION_DISCONNECT,
						);
					});
				});
			});

		new Setting(connectedEl)
			.setName("Dropbox Vault Path")
			.setDesc("Select a folder in your Dropbox to sync with Obsidian")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.providerPathDisplay || "")
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
