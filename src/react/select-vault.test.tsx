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
});
