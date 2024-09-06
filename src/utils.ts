import { ClientPath, ProviderPath } from "./types";

export function sanitizeRemotePath(args: {
	vaultRoot?: string;
	filePath: string;
}): ProviderPath {
	// TODO: Add validation & error handling
	if (args.vaultRoot == undefined) {
		return args.filePath.toLowerCase() as ProviderPath;
	}
	return `${args.vaultRoot}/${args.filePath}`.toLowerCase() as ProviderPath;
}

export function convertRemoteToClientPath(args: {
	vaultRoot: ProviderPath;
	remotePath: ProviderPath;
}): ClientPath {
	return args.remotePath.slice(args.vaultRoot.length + 1) as ClientPath;
}
