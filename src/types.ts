export enum PubsubTopic {
	AUTHORIZATION_SUCCESS = "authorization_failure",
	AUTHORIZATION_FAILURE = "authorization_success",
	AUTHORIZATION_DISCONNECT = "authorization_disconnect",
	SET_VAULT_PATH = "set_vault_path",
	SYNC_ERROR = "sync_error",
}

declare const __brand: unique symbol;

// All provider paths start with a "/"
export type ProviderPath = string & { [__brand]: "provider path" };

// Obsidian paths are absolute to the vault and don't start with a "/"
export type ClientPath = string & { [__brand]: "client path" };
