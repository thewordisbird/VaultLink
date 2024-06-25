// @vitest-environment jsdom

import {
	describe,
	it,
	expect,
	//vi,
	beforeAll,
	afterEach,
	afterAll,
} from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import SelectVault, { MockMe } from "./select-vault";
import { Dropbox, DropboxAuth } from "dropbox";

//declare which API requests to mock
const server = setupServer(
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

server.events.on("request:start", ({ request }) => {
	console.log("Outgoing:", request.method, request.url);
});

const redirectUri = "mock_redirect_uri";
const authCode = "mock_authorization_code";

const dropboxAuth = new DropboxAuth({
	clientId: "12345678",
});
const dropbox = new Dropbox({
	auth: dropboxAuth,
});

async function authorizeDropbox() {
	// setup dropboxAuth with PKCE code and code verifier
	await dropboxAuth
		.getAuthenticationUrl(
			redirectUri, // redirectUri
			undefined, // state
			"code", // authType
			"offline", // tokenAccessType
			undefined, // scope
			undefined, // includeGrantedScopes
			true, // usePKCE
		)
		// @ts-ignore
		.catch((e) => {
			console.error(`ERROR - dropboxAuth.getAuthenticationUrl: ${e}`);
		});

	await dropboxAuth
		.getAccessTokenFromCode(redirectUri, authCode)
		// @ts-ignore
		.then(({ result: { access_token, refresh_token } }) => {
			dropboxAuth.setAccessToken(access_token);
			dropboxAuth.setRefreshToken(refresh_token);
		})
		// @ts-ignore
		.catch((e) => {
			console.error(`ERROR - dropboxAuth.getAccessTokenFromCode ${e}`);
		});
}

beforeAll(async () => {
	server.listen();
	await authorizeDropbox();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("SelectVault", () => {
	// Initial load state
	it("should have a title of 'Select Vault'", async () => {
		render(<SelectVault currentPath="" />);

		await screen.findAllByRole("heading");

		expect(screen.getAllByRole("heading")[0]).toHaveTextContent(
			"Select vault",
		);
	});

	it("should have a primary button 'Add folder' and secondary button 'Select vault'", async () => {
		render(<SelectVault currentPath="" />);

		await screen.findAllByRole("heading");

		const buttons = screen.getAllByRole("button");
		expect(buttons[0]).toHaveTextContent("Add folder");
		expect(buttons[1]).toHaveTextContent("Select vault");
		expect(buttons[1]).toHaveClass("mod-cta");
	});

	it("should display 'All folders' as the location and have no breadcrumbs when loading with no pre-selected path", async () => {
		render(<SelectVault currentPath="" />);

		await screen.findAllByRole("heading");

		expect(screen.queryByRole("navigation")).toBeNull();
		expect(screen.queryByText("All folders")).toBeInTheDocument();
	});

	it("should display the current path and have breadcrumbs to the parent folder when loading a pre-selected path", async () => {
		render(<SelectVault currentPath="path/to/vault" />);

		await screen.findAllByRole("heading");

		const breadcrumbs = screen.getByRole("navigation");
		expect(breadcrumbs).toHaveAccessibleName("Breadcrumb");
		expect(
			breadcrumbs.getElementsByClassName("btn-text-link"),
		).toHaveLength(3);

		expect(
			breadcrumbs.getElementsByClassName("btn-text-link")[0],
		).toHaveTextContent("All folders");
		expect(
			breadcrumbs.getElementsByClassName("btn-text-link")[1],
		).toHaveTextContent("path");
		expect(
			breadcrumbs.getElementsByClassName("btn-text-link")[2],
		).toHaveTextContent("to");

		// Confirm  correct current table location
		expect(screen.getAllByRole("heading")[1]).toHaveTextContent("vault");
	});

	/*
	it("should display the 'Loading...' while it makes the initial request at the pre-selected path and then the query results when complete", async () => {
		render(<SelectVault currentPath="" />);

		expect(screen.getByText("Loading...")).toBeInTheDocument();
		await screen.findAllByRole("table");
		expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
		const res = await dropbox
			.filesListFolder({ path: "" })
			.catch((e: any) => {
				console.error("listFolders error:", e);
			});

		//@ts-ignore
		const entries = res.result.entries;
		expect(entries.length).toBe(3);

		// expect(screen.getByRole("table")).toBeInTheDocument();
		// expect(screen.getByText("Public")).toBeInTheDocument();
		// expect(screen.getByText("Vault1")).toBeInTheDocument();
		// expect(screen.getByText("Vault2")).toBeInTheDocument();

		//screen.debug();
	});

	it("should display the proper path breadcrumbs separated by a '/'", async () => {
		render(
			<SelectVault
				currentPath="path/to/vault"
			/>,
		);

		await screen.findAllByRole("heading");

		expect(screen.getAllByText("/")).toHaveLength(2);
	});

	it("should display the 'Add folder' form when the 'Add folder' button is clicked and disable the 'Add folder' and 'Select vault' buttons", async () => {
		render(
			<SelectVault
				currentPath=""
			/>,
		);

		await screen.findAllByRole("button");
		// The form should not be visibile
		expect(screen.queryByRole("textbox")).toBeNull();

		const addFolderButton = screen.getByText("Add folder");
		fireEvent.click(addFolderButton);

		expect(screen.getByRole("textbox")).toBeInTheDocument();

		expect(screen.getByText("Save")).toHaveRole("button");
		expect(screen.getByText("Save")).toHaveClass("mod-cta"); // 'Add folder' button is secondary

		expect(screen.getByText("Cancel")).toHaveRole("button");

		expect(screen.getAllByRole("button")[0]).toBeDisabled(); // 'Add folder' button;
		expect(screen.getAllByRole("button")[1]).toBeDisabled(); // 'Select vault' button;
	});

	it("should close the 'Add folder' form when the cancel button is clicked and the 'Add folder' and 'Select vault' buttons should be enabled", async () => {
		render(
			<SelectVault
				currentPath=""
			/>,
		);

		await screen.findAllByRole("button");

		expect(screen.queryByRole("textbox")).toBeNull();

		const addFolderButton = screen.getByText("Add folder");
		fireEvent.click(addFolderButton);

		expect(screen.queryByRole("textbox")).toBeInTheDocument();

		const cancelButton = screen.getByText("Cancel");
		fireEvent.click(cancelButton);

		expect(screen.queryByRole("textbox")).toBeNull();
	});

	it("should mock the request", async () => {
		render(<MockMe />);

		//await screen.findByRole("heading");
		await screen.findByRole("paragraph");
		screen.debug();
		expect(screen.getByRole("heading")).toHaveTextContent("hello there");
	});
	/*
	it("should add the new folder from the add folder form to the path and navigate to the new folder as the current directory", async () => {
		render(
			<SelectVault
				currentPath=""
				addFolder={mockAddFolder}
				listFolders={mockListFolders}
				setVaultInSettings={mockSetVaultInSettings}
			/>,
		);

		await screen.findAllByRole("button");

		expect(screen.queryByRole("textbox")).toBeNull();

		const addFolderButton = screen.getByText("Add folder");
		fireEvent.click(addFolderButton);

		const textbox = screen.getByRole("textbox");
		fireEvent.change(textbox, { target: { value: "test folder" } });

		const saveButton = screen.getByText("Save");
		fireEvent.click(saveButton);

		// Make and API Request (will be successful - test failure in a seprate test)
		// Close the Add folder form
		expect(screen.queryByRole("textbox")).toBeNull();

		// Update the breadcrumbs to include the previous current folder
		const breadcrumbs = screen.getByRole("navigation");
		expect(
			breadcrumbs.getElementsByClassName("btn-text-link"),
		).toHaveLength(1);

		expect(
			breadcrumbs.getElementsByClassName("btn-text-link")[0],
		).toHaveTextContent("All folders");

		// Update the current folder to be the new folder
		expect(screen.getAllByRole("heading")[1]).toHaveTextContent("vault");
	});
	 */
	/*

	it("should add the vault to the settings state when the 'Select vault' button is clicked", () => {});

	it("should open the add folder form in TableCurrentLocation component when the 'Add folder' button is clicked", async () => {
		render(
			<SelectVault
				currentPath=""
				addFolder={mockAddFolder}
				listFolders={mockListFolders}
				setVaultInSettings={mockSetVaultInSettings}
			/>,
		);

		await screen.findAllByRole("button");
		// The form should not be visibile
		expect(screen.queryByRole("textbox")).toBeNull();

		const addFolderButton = screen.getByText("Add folder");
		fireEvent.click(addFolderButton);

		expect(screen.getByRole("textbox")).toBeInTheDocument();
	});

	it("should disable the buttons in the TableControl when the add folder form is open", async () => {
		render(
			<SelectVault
				currentPath=""
				addFolder={mockAddFolder}
				listFolders={mockListFolders}
				setVaultInSettings={mockSetVaultInSettings}
			/>,
		);

		await screen.findAllByRole("button");
		const [addFolderButton, selectVaultButton] =
			screen.getAllByRole("button");

		expect(addFolderButton).not.toBeDisabled();
		expect(selectVaultButton).not.toBeDisabled();

		fireEvent.click(addFolderButton);

		expect(addFolderButton).toBeDisabled();
		expect(selectVaultButton).toBeDisabled();
	});

	it("should close the add folder form in the TableCurrentLocation component when the 'Cancel' button is clicked", async () => {
		render(
			<SelectVault
				currentPath=""
				addFolder={mockAddFolder}
				listFolders={mockListFolders}
				setVaultInSettings={mockSetVaultInSettings}
			/>,
		);

		await screen.findAllByRole("button");
		const addFolderButton = screen.getByText("Add folder");

		fireEvent.click(addFolderButton);

		const cancelButton = screen.getByText("Cancel");
		fireEvent.click(cancelButton);

		expect(screen.queryByRole("textbox")).toBeNull();
	});

	it("should make an api call", () => {
		// TODO: Implement MSW
	});

	it("should not display anything when at the root directory", () => {});
	it("should display 'All folders' as a link back to the root", () => {});
	it("should display the folder path to one above the current folder with links to each folder", () => {});
	it("should display a '/' after each folder except the last", () => {});
	it("should send a msw request", () => {});

	it("should display the current folder location as a h2 heading", () => {});
	// Should integration test for add folder be here
	// TODO: abstract add folder form?

	it("should display the message 'No sub-folders' if there are no folders -  empty array", async () => {
		mockListFolders.mockResolvedValue([]);
		render(
			<SelectVaultProvider
				currentPath=""
				addFolder={mockAddFolder}
				listFolders={mockListFolders}
				setVaultInSettings={mockSetVaultInSettings}
			>
				<TableBody />
			</SelectVaultProvider>,
		);

		expect(screen.queryByText("No sub-folders")).not.toBeInTheDocument();
		await screen.findByRole("heading");
		expect(screen.getByText("No sub-folders")).toBeInTheDocument();
	});

	it("should display a '...Loading' while loading", async () => {
		mockListFolders.mockResolvedValue([]);
		render(
			<SelectVaultProvider
				currentPath=""
				addFolder={mockAddFolder}
				listFolders={mockListFolders}
				setVaultInSettings={mockSetVaultInSettings}
			>
				<TableBody />
			</SelectVaultProvider>,
		);

		expect(screen.getByText("Loading...")).toBeInTheDocument();
		await screen.findByRole("heading");
		expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
	});

	it("should add secondary background styling to alternating rows", () => {
		// TODO: setup faker
	});
	it("should make msw request when clicked", () => {});
	*/
});

// Integration Tests:
// - clicking breadcrumbs
// - Add folder flow
// - Select vault flow
// - Table selection to current location and breadcrumb flow
// -
