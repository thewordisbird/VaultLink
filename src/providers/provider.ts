import { Provider } from "../providers/types";
import { DropboxProvider } from "./dropbox.provider";

export type ProviderName = "dropbox";

export function getProvider(args: { providerName: ProviderName }): Provider {
	if (args.providerName == "dropbox") {
		return new DropboxProvider();
	}

	throw new Error(`Invalid Provider: ${args.providerName} does not exist`);
}
