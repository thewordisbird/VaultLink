type Callback<T> = (args: T[]) => void;
export function batchProcess<A>(callback: Callback<A>, batchTime: number) {
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
