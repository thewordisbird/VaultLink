import { DropboxProvider, DROPBOX_PROVIDER_ERRORS } from "./dropboxProvider";
import { Dropbox, DropboxAuth } from "dropbox";

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

	describe("getAcessToken", () => {
		it("should throw an error if no code is present in the protocolData", () => {});
		it("should throw an error if no codeVerifier is present in sessionStorage", () => {});
		// Ther remainder of the functionality of this function would be testing the
		// DropboxAuth sdk and is omitted for unit tests
	});

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
});
