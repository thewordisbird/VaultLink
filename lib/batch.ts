export function batch<I>(args: {
	func: (ags: I[]) => Promise<I[]>;
	wait: number;
}): (args: I) => Promise<{ items: I[]; results: I[] }>;
export function batch<I>(args: { wait: number }): (args: I) => Promise<I[]>;
export function batch<I>(args: {
	func?: (args: I[]) => Promise<I[]>;
	wait: number;
}): (args: I) => Promise<{ items: I[]; results: I[] } | I[]> {
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
