type BatchCallback<T> = (args: T[]) => void;

// TODO: Confirm this works for callbacks that accept no params, parms that are arrays, objects,
// or induvidual comma dilimited.
export function batchProcess<A>(callback: BatchCallback<A>, batchTime: number) {
	const queue: A[] = [];
	let timeoutId: NodeJS.Timeout | null = null;

	const flushQueue = () => {
		if (queue.length > 0) {
			const params = queue.slice();
			queue.length = 0;
			callback(params);
		}
		timeoutId = null;
	};

	const addToQueue = (item: A) => {
		//queue.push([item]); // Wrap item in an array for consistency
		queue.push(item); // Wrap item in an array for consistency

		if (timeoutId) clearTimeout(timeoutId);
		timeoutId = setTimeout(flushQueue, batchTime); // Default batch time: 1 second
	};

	// Return an object with the addToQueue function
	return addToQueue;
}

export function batch<I>(
	func: (args: I[]) => void | Promise<void>,
	wait: number,
	options?: {},
) {
	let items: I[] = [];
	let timeoutId: string | number | NodeJS.Timeout | undefined;

	function batched(args: I) {
		if (timeoutId) clearTimeout(timeoutId);
		items.push(args);
		timeoutId = setTimeout(async () => {
			try {
				await func(items);
				items = [];
				clearTimeout(timeoutId);
				timeoutId = undefined;
			} catch (e) {
				console.error("Error processing batch:", e);
				items = [];
				clearTimeout(timeoutId);
				timeoutId = undefined;
			}
		}, wait);
	}

	function cancel() {
		items = [];
		clearTimeout(timeoutId);
		timeoutId = undefined;
	}
	batched.cancel = cancel;
	return batched;
}
