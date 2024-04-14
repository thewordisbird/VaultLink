import { App, Modal } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import { StrictMode, useState } from "react";

import type ObsidianDropboxConnect from "../main";
import { PubSub } from "../pubsub";
import { SelectVaultProvider, useSelectVault } from "./context-provider";

export class VaultSelectModal extends Modal {
	plugin: ObsidianDropboxConnect;
	root: Root | null = null;
	pubsub: PubSub;

	constructor(app: App, plugin: ObsidianDropboxConnect) {
		super(app);
		this.plugin = plugin;
		this.pubsub = new PubSub();
	}

	async onOpen() {
		/* TODO: The dropbox provider should be a singleton so these can be called where needed */
		const listFolders = this.plugin.dropboxProvider.listFolders.bind(
			this.plugin.dropboxProvider,
		) as typeof this.plugin.dropboxProvider.listFolders;

		const addFolder = this.plugin.dropboxProvider.addFolder.bind(
			this.plugin.dropboxProvider,
		) as typeof this.plugin.dropboxProvider.addFolder;

		const setVaultInSettings = (path: string) => {
			this.pubsub.publish("set-vault-path", { payload: path });
			this.close();
		};
		/* END TODO */

		const rootElm = this.contentEl.createEl("div");
		rootElm.id = "react-root";

		this.root = createRoot(rootElm);
		this.root.render(
			<StrictMode>
				<SelectVaultProvider
					currentPath={this.plugin.settings.cloudVaultPath}
					listFolders={listFolders}
					addFolder={addFolder}
					setVaultInSettings={setVaultInSettings}
				>
					<TableControl />
					<TableBreadcrumb />
					<TableCurrentLocation />
					<TableBody />
				</SelectVaultProvider>
			</StrictMode>,
		);
	}

	async onClose() {
		this.root?.unmount();
	}
}

const TableControl: React.FC = () => {
	const { state, dispatch, setVaultInSettings } = useSelectVault();

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "row",
				justifyContent: "space-between",
			}}
		>
			<h1>Select Vault</h1>
			<div>
				<button
					disabled={state.isAddFolderDisplayed}
					onClick={() => dispatch({ type: "TOGGLE_ADD_FOLDER" })}
				>
					Add folder
				</button>
				<button
					disabled={state.isAddFolderDisplayed}
					onClick={() => setVaultInSettings(state.path.join("/"))}
				>
					Select vault
				</button>
			</div>
		</div>
	);
};

const TableBreadcrumb: React.FC = () => {
	const { state, dispatch } = useSelectVault();
	console.log("breadcrumbs", state.path);
	if (!state.path.length) return null;

	return (
		<div>
			<TextLink onClick={() => dispatch({ type: "RESET_VAULT_PATH" })}>
				All folders
			</TextLink>
			{state.path.slice(0, state.path.length - 1).map((dir, idx, arr) => {
				if (dir === "") return null;
				return (
					<TextLink
						key={arr.slice(0, idx + 1).join("/")}
						onClick={() =>
							dispatch({
								type: "SET_VAULT_PATH",
								payload: { path: arr.slice(0, idx + 1) },
							})
						}
					>
						{dir}
					</TextLink>
				);
			})}
		</div>
	);
};

const TableCurrentLocation: React.FC = () => {
	const [folderName, setFolderName] = useState("");
	const { state, dispatch, addFolder } = useSelectVault();

	function handleAddFolder(_e: React.MouseEvent<HTMLButtonElement>): void {
		console.log("handleAddFolder, path, name:", state.path, folderName);
		const folderPath = state.path.length
			? `/${state.path.join("/")}/${folderName}`
			: `/${folderName}`;
		addFolder(folderPath).then((_res) => {
			dispatch({ type: "ADD_FOLDER", payload: { folderName } });
		});
	}

	return (
		<div style={{ display: "flex", flexDirection: "row" }}>
			<h2>
				{`${
					!state.path.length
						? "All folders"
						: state.path[state.path.length - 1]
				}${state.isAddFolderDisplayed ? "/" : ""}`}
			</h2>

			{state.isAddFolderDisplayed ? (
				<div>
					<input
						type="text"
						onChange={(e) => setFolderName(e.target.value)}
					/>
					<button onClick={handleAddFolder}>Save</button>
					<button
						onClick={() => dispatch({ type: "TOGGLE_ADD_FOLDER" })}
					>
						Cancel
					</button>
				</div>
			) : null}
		</div>
	);
};

interface TextLinkProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	children: string;
}

const TextLink: React.FC<TextLinkProps> = ({ children, ...props }) => {
	return <button onClick={props.onClick}>{children}</button>;
};

const TableBody: React.FC = () => {
	const { state, dispatch } = useSelectVault();

	if (!state.folders) return null;

	return (
		<table>
			<thead>
				<tr>
					<th>name</th>
					<th>count: {state.folders.length}</th>
				</tr>
			</thead>
			<tbody>
				{state.folders.map((folder) => (
					<tr key={(folder as any).id}>
						<td
							onClick={() =>
								dispatch({
									type: "SET_VAULT_PATH",
									payload: {
										path: [...state.path, folder.name],
									},
								})
							}
						>
							{folder.name}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
};
