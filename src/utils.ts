export function batch<I, R>(func: (args: I[]) => Promise<R>, wait: number) {
	let items: I[] = [];
	let timeoutId: string | number | NodeJS.Timeout | undefined;

	function batched(args: I) {
		return new Promise<R>((res, rej) => {
			if (timeoutId) clearTimeout(timeoutId);
			items.push(args);
			timeoutId = setTimeout(async () => {
				try {
					res(func(items));
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
