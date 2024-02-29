export function writeToLocalStorage(key: string, value: string): void {
	localStorage.setItem(key, value);
}

export function readFromLocalStorage(key: string): string | null {
	return localStorage.getItem(key);
}

export function removeFromLocalStorage(key: string): void {}
