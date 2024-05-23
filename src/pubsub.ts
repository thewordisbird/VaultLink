import { v4 as uuidv4 } from "uuid";

let instance: PubSub | undefined;

export class PubSub {
	subscribers: Map<string, [string, (args: unknown) => void][]> = new Map();

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
			this.subscribers.set(topic, [[id, callback]]);
		} else {
			topicSubscribers.push([id, callback]);
		}

		return () => {
			const updatedSubscribers = topicSubscribers?.filter(
				(subscriber) => subscriber[0] !== id,
			);
			if (updatedSubscribers?.length) {
				this.subscribers.set(topic, updatedSubscribers);
			} else {
				this.subscribers.delete(topic);
			}
		};
	}

	publish(topic: string, payload?: any): void {
		const topicSubscribers = this.subscribers.get(topic);

		topicSubscribers?.forEach((subscriber) => {
			subscriber[1](payload);
		});
	}

	unsubscribeAll() {}
}
