/*
 * The Dropbox Hashing Algorithm is described here:
 * https://www.dropbox.com/developers/reference/content-hash
 */

import crypto from "crypto";

// Dropbox documentation specs a 4MB block
const BLOCK_SIZE = 4 * 1024 * 1024;

export function dropboxContentHasher(data: ArrayBuffer) {
	let hasher = crypto.createHash("sha256");

	let offset = 0;
	while (offset < data.byteLength) {
		let length = Math.min(data.byteLength - offset, BLOCK_SIZE);
		let blockHash = crypto
			.createHash("sha256")
			.update(new Uint8Array(data, offset, length))
			.digest();
		hasher.update(blockHash);
		offset += length;
	}

	return hasher.digest("hex");
}
