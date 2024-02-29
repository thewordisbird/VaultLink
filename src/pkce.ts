// Valid Characters Per RFC 7636: Oauth PKCE 4:1
const CHAR_SET =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_~.";

export function generateCodeVerifier(): string {
	const randomValArr = Array.from(crypto.getRandomValues(new Uint8Array(32)));
	const randomString = randomValArr.reduce(
		(arr, cur) => arr + CHAR_SET[cur % CHAR_SET.length],
		"",
	);
	return stringToBase64UrlEncoded(randomString);
}

export function generateCodeChallenge(codeVerifier: string): Promise<string> {
	return crypto.subtle
		.digest({ name: "SHA-256" }, new TextEncoder().encode(codeVerifier))
		.then((hash) => bufferToBase64UrlEncoded(hash));
}

function stringToBase64UrlEncoded(data: string): string {
	// Todo: Confirm this properly Base64 URL Encodes the string
	return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function bufferToBase64UrlEncoded(input: ArrayBuffer): string {
	return stringToBase64UrlEncoded(
		String.fromCharCode(...Array.from(new Uint8Array(input))),
	);
}
