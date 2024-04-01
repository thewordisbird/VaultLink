import { StrictMode, useState, useEffect } from "react";
import { Root, createRoot } from "react-dom/client";
import { App, Modal } from "obsidian";
import { files } from "dropbox";
import type { DropboxResponse } from "dropbox";
import type ObsidianDropboxConnect from "./main";
import { PubSub } from "./pubsub";

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

		const rootElm = this.contentEl.createEl("div");
		rootElm.id = "react-root";

		this.root = createRoot(rootElm);
		this.root.render(
			<StrictMode>
				<FolderExplorer
					currentPath={this.plugin.settings.cloudVaultPath}
					listFolders={listFolders}
					setVaultInSettings={setVaultInSettings}
					addFolder={addFolder}
				/>
			</StrictMode>,
		);
	}

	async onClose() {
		this.root?.unmount();
	}
}

interface FolderExplorerProps {
	listFolders: (
		args: files.ListFolderArg,
	) => Promise<void | DropboxResponse<files.ListFolderResult>>;
	setVaultInSettings: (path: string) => void;
	currentPath: string | undefined;
	addFolder: (
		path: string,
	) => Promise<DropboxResponse<files.CreateFolderResult>>;
}

const FolderExplorer: React.FC<FolderExplorerProps> = ({
	listFolders,
	setVaultInSettings,
	currentPath,
	addFolder,
}) => {
	const [path, setPath] = useState<string[]>(() =>
		!currentPath ? [""] : currentPath.split("/"),
	);
	const [folders, setFolders] =
		useState<
			(
				| files.FileMetadataReference
				| files.FolderMetadataReference
				| files.DeletedMetadataReference
			)[]
		>();

	const [displayAddFolderInput, setDisplayAddFolderInput] = useState(false);

	useEffect(() => {
		listFolders({ path: path.join("/") }).then((res) => {
			if (res) {
				const folders = res.result.entries.filter(
					(entry) => entry[".tag"] === "folder",
				);
				setFolders(folders);
			}
		});
	}, [path]);

	function handleToggleAddFolderInput() {
		setDisplayAddFolderInput((cur) => !cur);
	}

	return (
		<div>
			<TableControl
				path={path.join("/")}
				setVaultInSettings={setVaultInSettings}
				handleToggleAddFolderInput={handleToggleAddFolderInput}
				disableControl={displayAddFolderInput}
			/>
			<TableBreadcrumb path={path} setPath={setPath} />
			<TableCurrentLocation
				path={path}
				setPath={setPath}
				addFolder={addFolder}
				dispalyAddFolderInput={displayAddFolderInput}
				setDisplayAddFolderInput={setDisplayAddFolderInput}
			/>
			<TableBody folders={folders} setPath={setPath} />
		</div>
	);
};

interface ModalHeaderProps {
	path: string;
	setVaultInSettings: (path: string) => void;
	handleToggleAddFolderInput: () => void;
	// addFolder: (
	// 	path: string,
	// ) => Promise<DropboxResponse<files.CreateFolderResult>>;
	disableControl: boolean;
}

const TableControl: React.FC<ModalHeaderProps> = ({
	path,
	setVaultInSettings,
	handleToggleAddFolderInput,
	disableControl,
}) => {
	function handleSelectVault(_e: React.MouseEvent<HTMLButtonElement>): void {
		setVaultInSettings(path);
	}

	// function handleAddFolder(_e: React.MouseEvent<HTMLButtonElement>): void {
	// 	addFolder(`${path}/obsidian_connect`).then((res) =>
	// 		console.log("addFolder res:", res),
	// 	);
	// }

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
					disabled={disableControl}
					onClick={handleToggleAddFolderInput}
				>
					Add folder
				</button>
				<button disabled={disableControl} onClick={handleSelectVault}>
					Select vault
				</button>
			</div>
		</div>
	);
};

interface TableBreadcrumbProps {
	path: string[];
	setPath: React.Dispatch<React.SetStateAction<string[]>>;
}

const TableBreadcrumb: React.FC<TableBreadcrumbProps> = ({ path, setPath }) => {
	if (path.length === 1) return null;
	return (
		<div>
			<TextLink onClick={() => setPath([""])}>All folders</TextLink>
			{path.slice(0, path.length - 1).map((dir, idx, arr) => {
				if (dir === "") return null;
				return (
					<TextLink
						key={arr.slice(0, idx + 1).join("/")}
						onClick={() => setPath(arr.slice(0, idx + 1))}
					>
						{dir}
					</TextLink>
				);
			})}
		</div>
	);
};

interface TableCurrentLocationProps {
	path: string[];
	setPath: React.Dispatch<React.SetStateAction<string[]>>;
	addFolder: (
		path: string,
	) => Promise<DropboxResponse<files.CreateFolderResult>>;
	dispalyAddFolderInput: boolean;
	setDisplayAddFolderInput: React.Dispatch<React.SetStateAction<boolean>>;
}

const TableCurrentLocation: React.FC<TableCurrentLocationProps> = ({
	path,
	setPath,
	addFolder,
	dispalyAddFolderInput,
	setDisplayAddFolderInput,
}) => {
	const [folderName, setFolderName] = useState("");

	function handleOnInput(e: React.ChangeEvent<HTMLInputElement>) {
		console.log("new Folder name:", e.target.value);
		setFolderName(e.target.value);
	}

	function handleAddFolder(_e: React.MouseEvent<HTMLButtonElement>): void {
		addFolder(`${path}/${folderName}`).then((res) => {
			setDisplayAddFolderInput(false);
			setPath([...path, folderName]);
			console.log("addFolder res:", res);
		});
	}

	return (
		<div style={{ display: "flex", flexDirection: "row" }}>
			<h2>
				{`${
					path[path.length - 1] === ""
						? "All folders"
						: path[path.length - 1]
				}${dispalyAddFolderInput ? "/" : ""}`}
			</h2>

			{dispalyAddFolderInput ? (
				<div>
					<input type="text" onChange={handleOnInput} />
					<button onClick={handleAddFolder}>Save</button>
					<button onClick={() => setDisplayAddFolderInput(false)}>
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

interface TableBodyProps {
	folders:
		| (
				| files.FileMetadataReference
				| files.FolderMetadataReference
				| files.DeletedMetadataReference
		  )[]
		| undefined;
	setPath: React.Dispatch<React.SetStateAction<string[]>>;
}
const TableBody: React.FC<TableBodyProps> = ({ folders, setPath }) => {
	if (!folders) return null;

	return (
		<table>
			<thead>
				<tr>
					<th>name</th>
					<th>count: {folders.length}</th>
				</tr>
			</thead>
			<tbody>
				{folders.map((folder) => (
					<tr key={(folder as any).id}>
						<td
							onClick={() =>
								setPath(folder.path_display!.split("/"))
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
