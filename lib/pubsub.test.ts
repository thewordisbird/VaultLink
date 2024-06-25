import { describe, it, afterEach, expect } from "vitest";
import { PubSub } from "./pubsub";

afterEach(() => {
	PubSub.resetInstance();
});

describe("pubsub", () => {
	describe("constructor", () => {
		it("should be a singleton", () => {
			const pubsub1 = new PubSub();
			const pubsub2 = new PubSub();

			expect(pubsub1).toBe(pubsub2);
		});
	});
	describe("subscribe", () => {
		it("should create a new topic if it doesn't already exist", () => {
			const pubsub = new PubSub();
			expect(pubsub.subscribers.has("test")).toBeFalsy();
			pubsub.subscribe("test", () => {
				console.log("hello, world!");
			});
			expect(pubsub.subscribers.has("test")).toBeTruthy();
		});
		it("should add a callback to a topic that already exists", () => {
			const pubsub = new PubSub();
			expect(pubsub.subscribers.has("test")).toBeFalsy();
			pubsub.subscribe("test", () => {
				console.log("hello, world!");
			});
			expect(pubsub.subscribers.has("test")).toBeTruthy();
			expect(pubsub.subscribers.get("test")!.size).toBe(1);
			pubsub.subscribe("test", () => {
				console.log("hello, pubsub!");
			});

			expect(pubsub.subscribers.get("test")!.size).toBe(2);
		});
		it("should return an unsubscribe method to unsubscribe from a topic", () => {
			const pubsub = new PubSub();

			expect(pubsub.subscribers.has("test")).toBeFalsy();
			const unsubscribe = pubsub.subscribe("test", () => {
				console.log("hello, world!");
			});
			expect(pubsub.subscribers.has("test")).toBeTruthy();

			unsubscribe();
			expect(pubsub.subscribers.has("test")).toBeFalsy();
		});
		it("should only unsubscribe the specific subscription", () => {
			const pubsub = new PubSub();

			expect(pubsub.subscribers.has("test")).toBeFalsy();
			const unsubscribe1 = pubsub.subscribe("test1", () => {
				console.log("hello, world!");
			});
			const unsubscribe2 = pubsub.subscribe("test2", () => {
				console.log("hello, world!");
			});
			expect(pubsub.subscribers.has("test1")).toBeTruthy();
			expect(pubsub.subscribers.has("test2")).toBeTruthy();

			unsubscribe1();
			expect(pubsub.subscribers.has("test1")).toBeFalsy();
			expect(pubsub.subscribers.has("test2")).toBeTruthy();

			unsubscribe2();
			expect(pubsub.subscribers.has("test2")).toBeFalsy();
		});
	});
	describe("publish", () => {
		it("should run all subscriptions to the topic", () => {
			const pubsub = new PubSub();

			let count1 = 0;
			let count2 = 5;

			expect(pubsub.subscribers.has("test")).toBeFalsy();

			pubsub.subscribe("increment", (amt: number) => {
				count1 += amt;
			});

			pubsub.subscribe("increment", (amt: number) => {
				count2 += amt;
			});

			pubsub.publish("increment", 2);

			expect(count1).toEqual(2);
			expect(count2).toEqual(7);
		});

		it("should only run subscriptions to the topic", () => {
			const pubsub = new PubSub();

			let count1 = 0;
			let count2 = 0;

			expect(pubsub.subscribers.has("test")).toBeFalsy();

			pubsub.subscribe("increment1", (amt: number) => {
				count1 += amt;
			});

			pubsub.subscribe("increment2", (amt: number) => {
				count2 += amt;
			});

			pubsub.publish("increment1", 2);

			expect(count1).toEqual(2);
			expect(count2).toEqual(0);

			pubsub.publish("increment2", 3);

			expect(count1).toEqual(2);
			expect(count2).toEqual(3);
		});
	});
});
