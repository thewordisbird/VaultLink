import { StrictMode, useState, useEffect } from "react";
import { Root, createRoot } from "react-dom/client";
import { App, Modal } from "obsidian";
import { files } from "dropbox";
import type { DropboxResponse } from "dropbox";
import type ObsidianDropboxConnect from "./main";

export class VaultSelectModal extends Modal {
	plugin: ObsidianDropboxConnect;
	root: Root | null = null;

	constructor(app: App, plugin: ObsidianDropboxConnect) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		const listFolders = this.plugin.dropboxProvider.listFolders.bind(
			this.plugin.dropboxProvider,
		);

		const rootElm = this.contentEl.createEl("div");
		rootElm.id = "react-root";

		this.root = createRoot(rootElm);
		this.root.render(
			<StrictMode>
				<FolderExplorer listFolders={listFolders} />
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
	initialPath?: string;
}

const FolderExplorer: React.FC<FolderExplorerProps> = ({
	listFolders,
	initialPath,
}) => {
	const [path, setPath] = useState<string[]>(() =>
		!initialPath ? [""] : initialPath.split("/"),
	);
	const [folders, setFolders] =
		useState<
			(
				| files.FileMetadataReference
				| files.FolderMetadataReference
				| files.DeletedMetadataReference
			)[]
		>();

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

	return (
		<div>
			<TableControl path={path.join("/")} />
			<TableBreadcrumb path={path} setPath={setPath} />
			<h2>
				{path[path.length - 1] === ""
					? "All folders"
					: path[path.length - 1]}
			</h2>
			<TableBody folders={folders} setPath={setPath} />
		</div>
	);
};

interface ModalHeaderProps {
	path: string;
}

const TableControl: React.FC<ModalHeaderProps> = ({ path }) => {
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
				<button>Add folder</button>
				<button>Select vault</button>
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
					<TextLink onClick={() => setPath(arr.slice(0, idx + 1))}>
						{dir}
					</TextLink>
				);
			})}
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
			<tr>
				<th>name</th>
				<th>count: {folders.length}</th>
			</tr>

			{folders.map((folder) => (
				<tr key={(folder as any).id}>
					<td
						onClick={() => setPath(folder.path_display!.split("/"))}
					>
						{folder.name}
					</td>
				</tr>
			))}
		</table>
	);
};
