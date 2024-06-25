// @vitest-environment jsdom
//declare which API requests to mock
import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
//import { Dropbox, DropboxAuth } from "dropbox";
import { DropboxProvider } from "./providers/dropbox.provider";

import SelectVault from "./react/select-vault";
import { render } from "@testing-library/react";

const redirectUri = "mock_redirect_uri";
const authCode = "mock_authorization_code";

/*
const dropboxAuth = new DropboxAuth({
	clientId: "12345678",
});
const dropbox = new Dropbox({
	auth: dropboxAuth,
});
*/

const dropboxProvider = new DropboxProvider();

const server = setupServer(
	/*
	http.options("https://api.dopboxapi.com/*", () => {}),
	http.post("https://api.dopboxapi.com/*", () => {}),
	http.get("https://api.dopboxapi.com/*", () => {}),
	*/
	http.options(
		"https://api.dropboxapi.com/2/users/get_current_account",
		() => {},
	),
	http.options(`https://api.dropboxapi.com/oauth2/token`, () => {}),
	http.post(`https://api.dropboxapi.com/oauth2/token`, () => {
		return HttpResponse.json({
			access_token: "mock_access_token",
			token_type: "bearer",
			expires_in: 14400,
			refresh_token: "mock_refresh_token",
			scope: "account_info.read files.content.read files.content.write files.metadata.read files.metadata.write",
			uid: "12345678",
			account_id: "dbid:mock_account_id",
		});
	}),

	http.post("https://api.dropboxapi.com/2/files/list_folder", () => {
		return HttpResponse.json({
			entries: [
				{
					".tag": "folder",
					name: "Public",
					path_lower: "/public",
					path_display: "/Public",
					id: "id:KxbZKPD9c0oAAAAAAAAAKQ",
				},
				{
					".tag": "folder",
					name: "Apps",
					path_lower: "/apps",
					path_display: "/Apps",
					id: "id:KxbZKPD9c0oAAAAAAAAABA",
				},
				{
					".tag": "folder",
					name: "Documents",
					path_lower: "/documents",
					path_display: "/Documents",
					id: "id:KxbZKPD9c0oAAAAAAAAcKA",
				},
			],
			cursor: "AAHQi9gtdxNn17FKD_7x4d0II06FD0_RSKkt5ZZxQCMWE4Q1bbxmcWp3nSJHFK4DxvXZBiT0JVL2p2n6d2B1kKPrMX20oW8cu4D2O76ly-6OcVusZrfuH2MaI7ESbtP4kdwEA4ThbcIXJ-p2vJL5uIZ1vbsPNW0Ep1SKOn0eUH5bHbUcfOAjaLaYKSdM9C8YEe8z0jM0jVUpWjIBewlLVTh_ksYr_GpeMUI-wdzB2WgNnZ5CASGXmTmXO2QaJvHW9RGanMly4hDyT78slem1WsIhESqWL4Nt0P5FSjSK3kXvFka1SQ3GQteAMksuCz_f47q9yz3yGnVkHJ_HdLXS5IAt7VGUreyCzMRxhBqPsc93iEvQc9JRySwC_kRc2tjVe7I",
			has_more: false,
		});
	}),
);

// Log intercepted requests
server.events.on("request:match", ({ request }) => {
	console.log("match:", request.method, request.url);
});
server.events.on("request:unhandled", ({ request }) => {
	console.log("unhandled:", request.method, request.url);
});

// establish API mocking before all tests
beforeAll(async () => {
	server.listen();
});

// reset any request handlers that are declared as a part of our tests
// (i.e. for testing one-time error scenarios)
afterEach(() => server.resetHandlers());

// clean up once the tests are done
afterAll(() => {
	server.close();
	//dropbox.authTokenRevoke();
});

describe("Make Dropbox Requests thru the sdk", () => {
	it("", async () => {
		const authUrl = await dropboxProvider.getAuthenticationUrl();
		const codeVerifier = dropboxProvider.getCodeVerifier();

		// window.sessionStorage.clear();
		// window.sessionStorage.setItem("codeVerifier", codeVerifier);
		// window.location.href = authUrl as string;

		//console.log("codeVerifier:", codeVerifier);
		dropboxProvider.setCodeVerifier(codeVerifier);
		const res = await dropboxProvider.dropboxAuth.getAccessTokenFromCode(
			redirectUri,
			authCode,
		);

		//console.log(res);
		/*
	const authTokens = await dropboxProvider
		.setAccessAndRefreshToken("mock_refesh_token")
		.catch((e) => {
			console.error(`MSW CATCH ERROR: ${e}`);
		});
	console.log("Auth Tokens:", authTokens);
	*/
		// await authorizeDropbox();
		expect(true).toBeTruthy();
	});
	/*
	it("should allow the listFiles from the dropobx sdk", async () => {
		const res = await dropbox
			.filesListFolder({ path: "" })
			.catch((e: any) => {
				console.error("listFolders error:", e);
			});

		//@ts-ignore
		const entries = res.result.entries;
		expect(entries.length).toBe(3);
	});
	*/

	it("should allow the listFolders from the dropboxProvider", async () => {
		const res = await dropboxProvider.listFolders();
		// @ts-ignore
		console.log(res);
	});

	it("should list the folders for the selected vault path", async () => {
		render(<SelectVault currentPath="" />);
	});
	/*
	 */
});
