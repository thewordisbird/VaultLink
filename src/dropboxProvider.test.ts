import {
	DropboxProvider,
	REDIRECT_URI,
	CLIENT_ID,
	DROPBOX_PROVIDER_ERRORS,
} from "./dropboxProvider";
import { Dropbox, DropboxAuth } from "dropbox";
import type { DropboxResponse } from "dropbox";

const MOCK_RETURN_URL = "www.mock.url";

jest.mock<{ Dropbox: typeof Dropbox; DropboxAuth: typeof DropboxAuth }>(
	"dropbox",
);

// const mockedDropbox = <jest.Mock<Dropbox>>Dropbox;
// const mockedDropboxAuth = <jest.Mock<DropboxAuth>>DropboxAuth;
const mockedDropbox = jest.mocked(Dropbox);
const mockedDropboxAuth = jest.mocked(DropboxAuth);

beforeEach(() => {
	jest.clearAllMocks();
});

afterAll(() => {});
describe("dropbox-provider", () => {
	describe("constructor", () => {
		it("should instantiate Dropbox and DropboxAuth from the dropbox sdk", () => {
			const db = new DropboxProvider();

			expect(mockedDropbox).toHaveBeenCalled();
			expect(mockedDropboxAuth).toHaveBeenCalled();

			expect(db.dropboxAuth).toBeInstanceOf(mockedDropboxAuth);
			expect(db.dropbox).toBeInstanceOf(mockedDropbox);
		});
	});

	describe("getAuthenticationUrl", () => {
		it("should call the DropboxAuth getAuthenticationUrl method with the correct argruments", async () => {
			const getAutenticationUrlParams = [
				"obsidian://connect-dropbox",
				undefined,
				"code",
				"offline",
				undefined,
				undefined,
				true,
			];

			const db = new DropboxProvider();
			const mockedGetAuthenticationUrl = jest
				.mocked(
					mockedDropboxAuth.mock.instances[0].getAuthenticationUrl,
				)
				.mockResolvedValue(MOCK_RETURN_URL);

			await db.getAuthenticationUrl();

			expect(mockedGetAuthenticationUrl).toHaveBeenCalledWith(
				...getAutenticationUrlParams,
			);
		});

		it("should return a string url", async () => {
			const db = new DropboxProvider();
			jest.mocked(
				mockedDropboxAuth.mock.instances[0].getAuthenticationUrl,
			).mockResolvedValue(MOCK_RETURN_URL);

			const authUrl = await db.getAuthenticationUrl();

			expect(authUrl).toBe(MOCK_RETURN_URL);
		});

		it("should catch the dropbox sdk error and throw an application specific error", async () => {
			const db = new DropboxProvider();

			jest.mocked(
				mockedDropboxAuth.mock.instances[0].getAuthenticationUrl,
			)
				.mockResolvedValueOnce(MOCK_RETURN_URL)
				.mockRejectedValueOnce(new Error("Dropbox SDK Error"));

			let err = undefined;
			try {
				await db.getAuthenticationUrl();
			} catch (e) {
				err = e;
			}
			expect(err).toBeUndefined();

			try {
				await db.getAuthenticationUrl();
			} catch (e) {
				err = e;
			}
			expect(err.message).toEqual(
				DROPBOX_PROVIDER_ERRORS.authenticationError,
			);
		});
	});

	describe("getCodeVerifier", () => {
		const MOCKED_GET_CODE_VERIFIER_RETURN = "mocked getCodeVerifier return";
		it("should return the code verifier from the dropbox sdk", () => {
			const db = new DropboxProvider();

			jest.mocked(
				mockedDropboxAuth.mock.instances[0].getCodeVerifier,
			).mockReturnValue(MOCKED_GET_CODE_VERIFIER_RETURN);

			expect(db.getCodeVerifier()).toBe(MOCKED_GET_CODE_VERIFIER_RETURN);
		});
	});

	describe("setCodeVerifier", () => {
		it("should make a call to the setCodeVerifier method on DropboxAuth with the passed in string argument", () => {
			const CODE_VERIFIER = "test code verifier";
			const db = new DropboxProvider();

			const mockedSetCodeVerifier = jest.mocked(
				mockedDropboxAuth.mock.instances[0].setCodeVerifier,
			);
			db.setCodeVerifier(CODE_VERIFIER);

			expect(mockedSetCodeVerifier).toHaveBeenCalledWith(CODE_VERIFIER);
		});
	});
	describe("setAccessAndRefreshToken", () => {
		const AUTHORIZATION_CODE = "test authorization code";
		const MOCK_ACCESS_TOKEN = "mock access token";
		const MOCK_REFRESH_TOKEN = "mock refress token";

		let db: DropboxProvider | undefined;
		let mockedGetAccessTokenFromCode:
			| jest.MockedFunctionDeep<
					(
						redirectUri: string,
						code: string,
					) => Promise<DropboxResponse<object>>
			  >
			| undefined;
		let mockedSetAccessToken:
			| jest.MockedFunctionDeep<(accessToken: string) => void>
			| undefined;
		let mockedSetRefreshToken:
			| jest.MockedFunctionDeep<(refreshToken: string) => void>
			| undefined;

		beforeEach(() => {
			db = new DropboxProvider();

			mockedGetAccessTokenFromCode = jest.mocked(
				mockedDropboxAuth.mock.instances[0].getAccessTokenFromCode,
			);
			mockedSetAccessToken = jest.mocked(
				mockedDropboxAuth.mock.instances[0].setAccessToken,
			);
			mockedSetRefreshToken = jest.mocked(
				mockedDropboxAuth.mock.instances[0].setRefreshToken,
			);
		});

		afterEach(() => {
			jest.clearAllMocks();
		});

		it("should make a call to the getAccessTokenFromCode method on DropboxAuth", async () => {
			mockedGetAccessTokenFromCode!.mockResolvedValue({
				status: 200,
				headers: [],
				result: {
					access_token: MOCK_ACCESS_TOKEN,
					refresh_token: MOCK_REFRESH_TOKEN,
				},
			});

			await db!.setAccessAndRefreshToken(AUTHORIZATION_CODE);

			expect(mockedGetAccessTokenFromCode).toHaveBeenCalledWith(
				REDIRECT_URI,
				AUTHORIZATION_CODE,
			);
		});
		it("should make a call to the setAccessToken method on DropboxAuth", async () => {
			mockedGetAccessTokenFromCode!.mockResolvedValue({
				status: 200,
				headers: [],
				result: {
					access_token: MOCK_ACCESS_TOKEN,
					refresh_token: MOCK_REFRESH_TOKEN,
				},
			});

			await db!.setAccessAndRefreshToken(AUTHORIZATION_CODE);

			expect(mockedSetAccessToken).toHaveBeenCalledWith(
				MOCK_ACCESS_TOKEN,
			);
		});
		it("should make a call to the setRefreshToken method on DropboxAuth", async () => {
			mockedGetAccessTokenFromCode!.mockResolvedValue({
				status: 200,
				headers: [],
				result: {
					access_token: MOCK_ACCESS_TOKEN,
					refresh_token: MOCK_REFRESH_TOKEN,
				},
			});

			await db!.setAccessAndRefreshToken(AUTHORIZATION_CODE);

			expect(mockedSetRefreshToken).toHaveBeenCalledWith(
				MOCK_REFRESH_TOKEN,
			);
		});
		it("should return the refresh token", async () => {
			mockedGetAccessTokenFromCode!.mockResolvedValue({
				status: 200,
				headers: [],
				result: {
					access_token: MOCK_ACCESS_TOKEN,
					refresh_token: MOCK_REFRESH_TOKEN,
				},
			});

			expect(
				await db!.setAccessAndRefreshToken(AUTHORIZATION_CODE),
			).toEqual({ refreshToken: MOCK_REFRESH_TOKEN });
		});
		it("should catch the dropbox sdk error and throw an application specific error", async () => {
			mockedGetAccessTokenFromCode!.mockRejectedValue({
				status: 400,
				headers: [],
				result: {},
			});

			try {
				await db!.setAccessAndRefreshToken(AUTHORIZATION_CODE);
			} catch (e) {
				expect(e.message).toBe(
					DROPBOX_PROVIDER_ERRORS.authenticationError,
				);
			}
		});
	});

	/*
	describe("revokeAuthorizationToken", () => {
		it("should thow an error if the DropboxAuth authTokenRevoke method fails", () => {});
		// The success case is handled by the DrobboxAuth sdk.
	});

	describe("authorizeWithRefreshToken", () => {
		// TODO: determine how to handle failing
		it("should ", () => {});
	});

	describe("listFolders", () => {
		it("should return a list of folders from the Dropbox filesListFolder method", () => {});
		it("should throw an error if the Dropbox filesListFolder method fails", () => {});
	});

	describe("addFolder", () => {});

	describe("getUserInfo", () => {});
	*/
});
