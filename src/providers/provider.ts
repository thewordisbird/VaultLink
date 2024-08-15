import { DropboxProvider } from "./dropbox.provider";
export enum ProviderName {
	"DROPBOX" = "dropbox",
	// "GOOGLE_DRIVE" = "google drive",
	// "ONE_DRIVE" = "one drive",
}

export function getProvider(args: { providerName: ProviderName }) {
	if (args.providerName == ProviderName.DROPBOX) {
		return new DropboxProvider();
	}

	return undefined;
}
