// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import {
	render,
	screen,
	fireEvent,
	waitForElementToBeRemoved,
} from "@testing-library/react";
import SelectVault from "./select-vault";

// modules to be mocked
import { PubSub } from "../../lib/pubsub";
import { DropboxProvider } from "../providers/dropbox.provider";

const mockCloseModal = vi.fn();

const pubsub = new PubSub();
vi.spyOn(pubsub, "publish");

const dropboxProvider = new DropboxProvider();

const mockListFolders = vi.spyOn(dropboxProvider, "listFolders");
const mockAddFolder = vi.spyOn(dropboxProvider, "addFolder").mockImplementation(
	() =>
		new Promise((res, _rej) => {
			res();
		}),
);

afterEach(() => {
	vi.clearAllMocks();
});

describe("SelectVault", () => {
	describe("Initial Load UI", () => {
		// Initial load state
		it("should have a title of 'Select Vault'", async () => {
			render(<SelectVault currentPath="" closeModal={mockCloseModal} />);

			await screen.findAllByRole("heading");

			expect(screen.getAllByRole("heading")[0]).toHaveTextContent(
				"Select vault",
			);
		});
		it("should have a primary button 'Add folder' and secondary button 'Select vault'", async () => {
			render(<SelectVault currentPath="" closeModal={mockCloseModal} />);

			await screen.findAllByRole("heading");

			const buttons = screen.getAllByRole("button");
			expect(buttons[0]).toHaveTextContent("Add folder");
			expect(buttons[1]).toHaveTextContent("Select vault");
			expect(buttons[1]).toHaveClass("mod-cta");
		});

		it("should display 'All folders' as the location and have no breadcrumbs when loading with no pre-selected path", async () => {
			render(<SelectVault currentPath="" closeModal={mockCloseModal} />);

			await screen.findAllByRole("heading");

			expect(screen.queryByRole("navigation")).toBeNull();
			expect(screen.queryByText("All folders")).toBeInTheDocument();
		});

		it("should display the current path and have breadcrumbs to the parent folder when loading a pre-selected path", async () => {
			render(
				<SelectVault
					currentPath="path/to/vault"
					closeModal={mockCloseModal}
				/>,
			);

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
			expect(screen.getAllByRole("heading")[1]).toHaveTextContent(
				"vault",
			);
		});
	});

	describe("Add Folder Flow", () => {
		it("should display the 'Add folder' form when the 'Add folder' button is clicked and disable the 'Add folder' and 'Select vault' buttons", async () => {
			render(<SelectVault currentPath="" closeModal={mockCloseModal} />);

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
			render(<SelectVault currentPath="" closeModal={mockCloseModal} />);

			await screen.findAllByRole("button");

			expect(screen.queryByRole("textbox")).toBeNull();

			const addFolderButton = screen.getByText("Add folder");
			fireEvent.click(addFolderButton);

			expect(screen.queryByRole("textbox")).toBeInTheDocument();

			const cancelButton = screen.getByText("Cancel");
			fireEvent.click(cancelButton);

			expect(screen.queryByRole("textbox")).toBeNull();
		});

		it("should navigate to and display the new folder in the modal", async () => {
			// TODO: The ideal solution is to mock the network layer with MSW. Acceptable solution
			// is to mock the dropbox sdk and work on the application layer
			mockListFolders.mockResolvedValue([]);
			render(<SelectVault currentPath="" closeModal={mockCloseModal} />);
			await screen.findAllByRole("button");

			expect(screen.queryByRole("textbox")).toBeNull();

			const addFolderButton = screen.getByText("Add folder");
			fireEvent.click(addFolderButton);

			const textbox = screen.getByRole("textbox");
			fireEvent.change(textbox, { target: { value: "test_folder" } });

			const saveButton = screen.getByText("Save");
			fireEvent.click(saveButton);

			expect(mockAddFolder).toHaveBeenCalledWith("/test_folder");

			await waitForElementToBeRemoved(() =>
				screen.queryByRole("textbox"),
			);

			expect(mockListFolders).toHaveBeenCalledWith("/test_folder");

			expect(screen.getByText("No sub-folders")).toBeInTheDocument();
		});

		it("should set the vault in the obsidian settings state when the 'Select vault' button is clicked", async () => {
			// This conirms that the pubsub message is sent. This is not as complete as mocking the
			// plugin context and making sure the setting state is updated, but much easier to accomplish
			render(<SelectVault currentPath="" closeModal={mockCloseModal} />);

			await screen.findAllByRole("heading");

			const buttons = screen.getAllByRole("button");
			const selectButton = buttons[1];

			fireEvent.click(selectButton);

			expect(pubsub.publish).toHaveBeenCalledOnce();
		});

		it("should make a call to the obsidian close modal method when the 'Select vault' button is clicked", async () => {
			// This is just a contractual test to make sure that the closeModal prop doesn't get removed.
			// it does not confirm that the modal actaully closes.
			render(<SelectVault currentPath="" closeModal={mockCloseModal} />);

			await screen.findAllByRole("heading");

			const buttons = screen.getAllByRole("button");
			const selectButton = buttons[1];

			fireEvent.click(selectButton);

			expect(mockCloseModal).toHaveBeenCalledOnce();
		});
	});

	describe("Folder List", () => {
		it("should display the 'Loading...' while it makes the initial request at the pre-selected path and then the query results when complete", async () => {
			mockListFolders.mockResolvedValue([
				{
					path: "/folder1",
					displayPath: "/folder1",
					name: "folder1",
				},
				{
					path: "/folder2",
					displayPath: "/folder2",
					name: "folder2",
				},
				{
					path: "/folder3",
					displayPath: "/folder3",
					name: "folder3",
				},
			]);
			render(<SelectVault currentPath="" closeModal={mockCloseModal} />);

			expect(screen.getByText("Loading...")).toBeInTheDocument();
			expect(mockListFolders).toHaveBeenCalledOnce();
			await screen.findByRole("table");

			expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
			expect(screen.getByText("folder1")).toBeInTheDocument();
			expect(screen.getByText("folder2")).toBeInTheDocument();
			expect(screen.getByText("folder3")).toBeInTheDocument();
		});
	});
	/*



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
