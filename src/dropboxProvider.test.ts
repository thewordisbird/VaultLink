import { Dropbox, DropboxAuth } from "dropbox";
import {
	DropboxProvider,
	REDIRECT_URI,
	CLIENT_ID,
	DROPBOX_PROVIDER_ERRORS,
} from "./dropboxProvider";

// import type { DropboxResponse } from "dropbox";

const mockAuthTokenRevoke = jest.fn();
const mockGetAuthenticationUrl = jest.fn();
const mockGetCodeVerifier = jest.fn();
const mockSetCodeVerifier = jest.fn();
const mockGetAccessTokenFromCode = jest.fn();
const mockSetAccessToken = jest.fn();
const mockSetRefreshToken = jest.fn();
const mockRefreshAccessToken = jest.fn();
const mockFilesListFolder = jest.fn();
const mockFilesCreateFolderV2 = jest.fn();
jest.mock("dropbox", () => {
	return {
		Dropbox: jest.fn().mockImplementation(() => {
			return {
				authTokenRevoke: mockAuthTokenRevoke,
				filesListFolder: mockFilesListFolder,
				filesCreateFolderV2: mockFilesCreateFolderV2,
			};
		}),
		DropboxAuth: jest.fn().mockImplementation(() => {
			return {
				getAuthenticationUrl: mockGetAuthenticationUrl,
				getCodeVerifier: mockGetCodeVerifier,
				setCodeVerifier: mockSetCodeVerifier,
				getAccessTokenFromCode: mockGetAccessTokenFromCode,
				setAccessToken: mockSetAccessToken,
				setRefreshToken: mockSetRefreshToken,
				refreshAccessToken: mockRefreshAccessToken,
			};
		}),
	};
});
const mockDropbox = jest.mocked(Dropbox);
const mockDropboxAuth = jest.mocked(DropboxAuth);

beforeEach(() => {
	mockDropbox.mockClear();
	mockDropboxAuth.mockClear();
});

describe("dropbox-provider", () => {
	describe("constructor", () => {
		it("should instantiate Dropbox and DropboxAuth from the dropbox sdk", () => {
			new DropboxProvider();

			expect(mockDropbox).toHaveBeenCalled();
			expect(mockDropboxAuth).toHaveBeenCalled();

			expect(mockDropbox).toEqual(Dropbox);
			// TODO: Figure out how to properly test mock instance
			// expect(db.dropbox).toBeInstanceOf(mockDropbox.mock.instances[0]);
			// expect(db.dropboxAuth).toBeInstanceOf(DropboxAuth);
		});
	});

	describe("getAuthenticationUrl", () => {
		const MOCK_GET_AUTHENTICATION_URL_RETURN = "mock.authentication.url";
		const getAutenticationUrlParams = [
			"obsidian://connect-dropbox",
			undefined,
			"code",
			"offline",
			undefined,
			undefined,
			true,
		];

		beforeEach(() => {
			mockGetAuthenticationUrl.mockClear();
		});
		it("should call the DropboxAuth getAuthenticationUrl method with the correct argruments", async () => {
			mockGetAuthenticationUrl.mockResolvedValue(
				MOCK_GET_AUTHENTICATION_URL_RETURN,
			);

			const db = new DropboxProvider();
			await db.getAuthenticationUrl();

			expect(mockGetAuthenticationUrl).toHaveBeenCalledWith(
				...getAutenticationUrlParams,
			);
		});

		it("should return a string url", async () => {
			mockGetAuthenticationUrl.mockResolvedValue(
				MOCK_GET_AUTHENTICATION_URL_RETURN,
			);

			const db = new DropboxProvider();
			const authUrl = await db.getAuthenticationUrl();

			expect(authUrl).toBe(MOCK_GET_AUTHENTICATION_URL_RETURN);
		});

		it("should catch the dropbox sdk error and throw an application specific error", async () => {
			mockGetAuthenticationUrl
				.mockResolvedValueOnce(MOCK_GET_AUTHENTICATION_URL_RETURN)
				.mockRejectedValueOnce(new Error("Dropbox SDK Error"));

			const db = new DropboxProvider();

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

		beforeEach(() => {
			mockGetCodeVerifier.mockClear();
		});

		it("should return the code verifier from the dropbox sdk", () => {
			mockGetCodeVerifier.mockReturnValue(
				MOCKED_GET_CODE_VERIFIER_RETURN,
			);

			const db = new DropboxProvider();

			expect(db.getCodeVerifier()).toBe(MOCKED_GET_CODE_VERIFIER_RETURN);
		});
	});

	describe("setCodeVerifier", () => {
		const CODE_VERIFIER = "test code verifier";

		beforeEach(() => {
			mockSetCodeVerifier.mockClear();
		});

		it("should make a call to the setCodeVerifier method on DropboxAuth with the passed in string argument", () => {
			const db = new DropboxProvider();
			db.setCodeVerifier(CODE_VERIFIER);

			expect(mockSetCodeVerifier).toHaveBeenCalledWith(CODE_VERIFIER);
		});
	});
	describe("setAccessAndRefreshToken", () => {
		const AUTHORIZATION_CODE = "test authorization code";
		const MOCK_ACCESS_TOKEN = "mock access token";
		const MOCK_REFRESH_TOKEN = "mock refress token";

		beforeEach(() => {
			mockGetAccessTokenFromCode.mockClear();
			mockSetAccessToken.mockClear();
			mockSetRefreshToken.mockClear();
		});

		it("should make a call to the getAccessTokenFromCode method on DropboxAuth", async () => {
			mockGetAccessTokenFromCode.mockResolvedValue({
				status: 200,
				headers: [],
				result: {
					access_token: MOCK_ACCESS_TOKEN,
					refresh_token: MOCK_REFRESH_TOKEN,
				},
			});

			const db = new DropboxProvider();
			await db.setAccessAndRefreshToken(AUTHORIZATION_CODE);

			expect(mockGetAccessTokenFromCode).toHaveBeenCalledWith(
				REDIRECT_URI,
				AUTHORIZATION_CODE,
			);
		});

		it("should make a call to the setAccessToken method on DropboxAuth", async () => {
			mockGetAccessTokenFromCode.mockResolvedValue({
				status: 200,
				headers: [],
				result: {
					access_token: MOCK_ACCESS_TOKEN,
					refresh_token: MOCK_REFRESH_TOKEN,
				},
			});

			const db = new DropboxProvider();
			await db.setAccessAndRefreshToken(AUTHORIZATION_CODE);

			expect(mockSetAccessToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
		});

		it("should make a call to the setRefreshToken method on DropboxAuth", async () => {
			mockGetAccessTokenFromCode.mockResolvedValue({
				status: 200,
				headers: [],
				result: {
					access_token: MOCK_ACCESS_TOKEN,
					refresh_token: MOCK_REFRESH_TOKEN,
				},
			});

			const db = new DropboxProvider();
			await db.setAccessAndRefreshToken(AUTHORIZATION_CODE);

			expect(mockSetRefreshToken).toHaveBeenCalledWith(
				MOCK_REFRESH_TOKEN,
			);
		});

		it("should return the refresh token", async () => {
			mockGetAccessTokenFromCode.mockResolvedValue({
				status: 200,
				headers: [],
				result: {
					access_token: MOCK_ACCESS_TOKEN,
					refresh_token: MOCK_REFRESH_TOKEN,
				},
			});

			const db = new DropboxProvider();

			expect(
				await db.setAccessAndRefreshToken(AUTHORIZATION_CODE),
			).toEqual({ refreshToken: MOCK_REFRESH_TOKEN });
		});

		it("should catch the dropbox sdk error and throw an application specific error", async () => {
			mockGetAccessTokenFromCode.mockRejectedValue({
				status: 400,
				headers: [],
				result: {},
			});

			const db = new DropboxProvider();

			let err = undefined;
			try {
				await db.setAccessAndRefreshToken(AUTHORIZATION_CODE);
			} catch (e) {
				err = e;
			}

			expect(err.message).toBe(
				DROPBOX_PROVIDER_ERRORS.authenticationError,
			);
		});
	});

	describe("revokeAuthorizationToken", () => {
		beforeEach(() => {
			mockAuthTokenRevoke.mockClear();
		});

		it("should make a call to the authTokenRevoke method on DropboxAuth", async () => {
			mockAuthTokenRevoke.mockResolvedValue({});

			const db = new DropboxProvider();
			await db.revokeAuthorizationToken();

			expect(mockAuthTokenRevoke).toHaveBeenCalled();
		});

		it("should reset the DropboxProvider state to an empty state", async () => {
			mockAuthTokenRevoke.mockResolvedValue({});

			const db = new DropboxProvider();
			db.state = {
				account: {
					accountId: "123456",
					email: "test@email.com",
				},
			};
			expect(db.state).not.toEqual({});

			await db.revokeAuthorizationToken();

			expect(db.state).toEqual({});
		});

		it("should thow an error if the DropboxAuth authTokenRevoke method fails", async () => {
			mockAuthTokenRevoke.mockRejectedValue({
				status: 400,
				headers: [],
			});

			const db = new DropboxProvider();

			let err = undefined;
			try {
				await db.revokeAuthorizationToken();
			} catch (e) {
				err = e;
			}
			expect(err.message).toBe(DROPBOX_PROVIDER_ERRORS.revocationError);
		});
	});

	describe("authorizeWithRefreshToken", () => {
		const REFRESH_TOKEN = "mock refresh token";
		beforeEach(() => {
			mockSetRefreshToken.mockClear();
			mockRefreshAccessToken.mockClear();
		});

		it("should make a call to the setRefreshToken on Dropbox", () => {
			const db = new DropboxProvider();
			db.authorizeWithRefreshToken(REFRESH_TOKEN);

			expect(mockSetRefreshToken).toHaveBeenCalledWith(REFRESH_TOKEN);
		});

		it("should make a call to the refreshAccessToken on Dropbox", () => {
			const db = new DropboxProvider();
			db.authorizeWithRefreshToken(REFRESH_TOKEN);

			expect(mockRefreshAccessToken).toHaveBeenCalledWith();
		});
	});

	describe("listFolders", () => {
		const FILES_LIST_FOLDERS_RESPONSE = require("./filesAndFolders.json");
		const FOLDER_PATH = "path/to/folder";

		beforeEach(() => {
			mockFilesListFolder.mockClear();
		});

		it("should return a list of folders from the Dropbox filesListFolder method", async () => {
			mockFilesListFolder.mockResolvedValue(FILES_LIST_FOLDERS_RESPONSE);

			const db = new DropboxProvider();
			await db.listFolders(FOLDER_PATH);

			expect(mockFilesListFolder).toHaveBeenCalledWith({
				path: FOLDER_PATH,
			});
		});
		it("should return a list of the folders coerced to the type Folder", async () => {
			mockFilesListFolder.mockResolvedValue(FILES_LIST_FOLDERS_RESPONSE);

			const db = new DropboxProvider();
			const folders = await db.listFolders(FOLDER_PATH);
			expect(folders.length).toBe(3);

			for (let folder of folders) {
				expect(Object.keys(folder).length).toBe(3);
				expect(Object.keys(folder)).toContain("path");
				expect(Object.keys(folder)).toContain("displayPath");
				expect(Object.keys(folder)).toContain("name");
			}
		});
		it("should throw an error if the Dropbox filesListFolder method fails", async () => {
			mockFilesListFolder.mockRejectedValue({
				status: 400,
				headers: [],
			});

			const db = new DropboxProvider();
			let err = undefined;
			try {
				await db.listFolders(FOLDER_PATH);
			} catch (e) {
				err = e;
			}
			expect(err.message).toBe(
				DROPBOX_PROVIDER_ERRORS.resourceAccessError,
			);
		});
	});

	describe("addFolder", () => {
		const PATH = "path/to/new/file";

		beforeEach(() => {
			mockFilesCreateFolderV2.mockClear();
		});

		it("should make a call to the authTokenRevoke method on DropboxAuth with the path argument", async () => {
			mockFilesCreateFolderV2.mockResolvedValue({
				status: 200,
				headers: [],
			});

			const db = new DropboxProvider();
			await db.addFolder(PATH);

			expect(mockFilesCreateFolderV2).toHaveBeenCalledWith({
				path: PATH,
			});
		});

		it("should throw an error if the Dopbox filesCreateFolderV2 method fails", async () => {
			mockFilesCreateFolderV2.mockRejectedValue({
				status: 400,
				headers: [],
			});

			const db = new DropboxProvider();

			let err = undefined;
			try {
				await db.addFolder(PATH);
			} catch (e) {
				err = e;
			}
			expect(err.message).toBe(
				DROPBOX_PROVIDER_ERRORS.resourceAccessError,
			);
		});
	});

	/*
	describe("getUserInfo", () => {});
	*/
});
