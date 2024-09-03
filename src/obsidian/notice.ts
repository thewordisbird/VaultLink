import { Notice } from "obsidian";

export function providerSyncError(details = "") {
	new Notice(
		`Provider Sync Error: ${details}\n\nPlease manual sync to attempt to resolve issue.`,
		0,
	);
}

export function providerLongpollError(details = "") {
	new Notice(
		`Provider Longpoll Error: ${details}\n\nPlease manual sync to attempt to resolve issue.`,
		0,
	);
}
export function providerAuthError(details = "") {
	new Notice(`Provider Auth Error: ${details}\n\nPlease try again.`, 0);
}

export function obsidianFileRetrievalError(fileName: string) {
	new Notice(
		`Obsidian File Access Error: Unable retrieve contents of ${fileName}`,
	);
}