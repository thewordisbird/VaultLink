export function batchProcess<I, R>(
	func: (args: I[]) => Promise<R>,
	wait: number,
) {
	let items: I[] = [];
	let timeoutId: string | number | NodeJS.Timeout | undefined;

	function batched(args: I) {
		return new Promise<{ items: I[]; results: R }>((res, rej) => {
			if (timeoutId) clearTimeout(timeoutId);
			items.push(args);
			timeoutId = setTimeout(async () => {
				try {
					const results = await func(items);
					const batchItems = [...items];

					res({ items: batchItems, results });
				} catch (e) {
					rej(e);
				} finally {
					items = [];
					clearTimeout(timeoutId);
					timeoutId = undefined;
				}
			}, wait);
		});
	}

	function cancel() {
		items = [];
		clearTimeout(timeoutId);
		timeoutId = undefined;
	}
	batched.cancel = cancel;
	return batched;
}

export function batch<I>(args: {
	func: (ags: I[]) => Promise<I[]>;
	wait: number;
}): (args: I) => Promise<{ items: I[]; results: I[] }>;
export function batch<I>(args: { wait: number }): (args: I) => Promise<I[]>;
export function batch<I>(args: {
	func?: (args: I[]) => Promise<I[]>;
	wait: number;
}): (args: I) => Promise<{ items: I[]; results: I[] }> | Promise<I[]> {
	const { func, wait } = args;
	let items: I[] = [];
	let timeoutId: string | number | NodeJS.Timeout | undefined;

	function batched(args: I) {
		return new Promise<{ items: I[]; results: I[] } | I[]>((res, rej) => {
			if (timeoutId) clearTimeout(timeoutId);
			items.push(args);
			timeoutId = setTimeout(async () => {
				try {
					if (func === undefined) {
						res(items);
					} else {
						res({ items: [...items], results: await func(items) });
					}
				} catch (e) {
					rej(e);
				} finally {
					items = [];
					clearTimeout(timeoutId);
					timeoutId = undefined;
				}
			}, wait);
		});
	}

	function cancel() {
		items = [];
		clearTimeout(timeoutId);
		timeoutId = undefined;
	}
	batched.cancel = cancel;
	return batched;
}

function wait(delay: number): Promise<void> {
	return new Promise((res, _rej) => {
		setTimeout(() => {
			res();
		}, delay);
	});
}

export function exponentialBackoff<I, R, S>(args: {
	func: (args: I) => Promise<R | S>;
	checkFunc: (args: R | S) => boolean;
	interval: number;
	maxRetry: number;
	growthFactor: number;
}) {
	const { func, checkFunc, interval, maxRetry, growthFactor } = args;

	return async function (args: I) {
		let attempts = 0;
		let delay = interval * Math.pow(growthFactor, attempts);

		while (attempts <= maxRetry) {
			try {
				let result = await func(args);
				if (checkFunc(result)) {
					console.log("Exponential Backoff Result:", result);
					return result as S;
				}
			} catch (e) {
				// TODO: Error handling
				console.error(e);
			} finally {
				attempts++;
				delay = interval * Math.pow(growthFactor, attempts);
				await wait(delay);
			}
		}

		throw new Error(`Exponential Backoff Error: Maximum retries exceeded`);
	};
}

declare const __brand: unique symbol;

export type ClientFilePath = string & { [__brand]: "client path" };
export type RemoteFilePath = string & { [__brand]: "remote path" };

export function sanitizeRemotePath(args: {
	vaultRoot?: string;
	filePath: string;
}): RemoteFilePath {
	// TODO: Add validation & error handling
	if (args.vaultRoot == undefined) {
		return args.filePath.toLowerCase() as RemoteFilePath;
	}
	return `/${args.vaultRoot}/${args.filePath}`.toLowerCase() as RemoteFilePath;
}

export function sanitizeClientPath(args: { filePath: string }): ClientFilePath {
	return args.filePath.toLowerCase() as ClientFilePath;
}

export function convertClientToRemotePath(args: {
	clientPath: ClientFilePath;
}): RemoteFilePath {
	return ("/" + args.clientPath) as RemoteFilePath;
}

export function convertRemoteToClientPath(args: {
	remotePath: RemoteFilePath;
}): ClientFilePath {
	return args.remotePath.split("/").slice(4).join("/") as ClientFilePath;
	//return args.remotePath.slice(1) as ClientFilePath;
}
