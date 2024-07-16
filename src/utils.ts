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

type ThrottleCallback = (args: unknown) => void;
export function throttleProcess(
	callback: ThrottleCallback,
	throttleTime: number,
) {
	const queue: unknown[] = [];
	let intervalId: NodeJS.Timer | null = null;

	const flushQueue = () => {
		intervalId = setInterval(() => {
			if (queue.length == 0) {
				clearInterval(intervalId!);
				intervalId = null;
			} else {
				const cbArgs = queue.shift();
				callback.call(null, cbArgs);
			}
		}, throttleTime);
	};

	const addToQueue = (args: unknown) => {
		console.log("args:", args);
		queue.push(args);
		if (!intervalId) flushQueue();
	};

	// Return an object with the addToQueue function
	return addToQueue;
}
