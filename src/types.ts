export type Folder = {
	path: string;
	displayPath?: string;
	name?: string;
};

export enum PubsubTopic {
	AUTHORIZATION_SUCCESS = "authorization_failure",
	AUTHORIZATION_FAILURE = "authorization_success",
	SET_VAULT_PATH = "set_vault_path",
}
