import { v4 as uuidv4 } from "uuid";

let instance: PubSub | undefined;

export class PubSub {
	subscribers: Map<string, Map<string, (args: unknown) => void>> = new Map();

	static resetInstance() {
		instance = undefined;
	}

	constructor() {
		if (instance) return instance;

		instance = this;
		return instance;
	}

	subscribe(topic: string, callback: (args: unknown) => void) {
		const topicSubscribers = this.subscribers.get(topic);
		const id = uuidv4();

		if (!topicSubscribers) {
			this.subscribers.set(topic, new Map([[id, callback]]));
		} else {
			topicSubscribers.set(id, callback);
		}

		return () => {
			const subscribers = this.subscribers.get(topic);
			if (!subscribers) return;

			subscribers.delete(id);

			if (subscribers.size == 0) {
				this.subscribers.delete(topic);
			}
		};
	}

	publish(topic: string, payload?: any): void {
		const topicSubscribers = this.subscribers.get(topic);
		if (!topicSubscribers) return;

		for (let [_, cb] of topicSubscribers) {
			cb(payload);
		}
	}

	unsubscribeAll() {}
}
