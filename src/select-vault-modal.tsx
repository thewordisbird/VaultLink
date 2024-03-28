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
	const [path, setPath] = useState<string>(initialPath || "");
	const [folders, setFolders] =
		useState<
			(
				| files.FileMetadataReference
				| files.FolderMetadataReference
				| files.DeletedMetadataReference
			)[]
		>();

	useEffect(() => {
		console.log("calling listFolders");
		listFolders({ path }).then((res) => {
			if (res) {
				const entries = res.result.entries;
				const folders = entries.filter(
					(entry) => entry[".tag"] === "folder",
				);
				setFolders(folders);
			}
		});
	}, [path]);

	return (
		<div>
			<TableControl path={path} />
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
			<VaultPath path={path} />
			<div>
				<button>Add folder</button>
				<button>Select vault</button>
			</div>
		</div>
	);
};

interface VaultPathProps {
	path: string;
}

const VaultPath: React.FC<VaultPathProps> = ({ path }) => {
	return <h4>Vault Path: {path}</h4>;
};

interface TableBodyProps {
	folders:
		| (
				| files.FileMetadataReference
				| files.FolderMetadataReference
				| files.DeletedMetadataReference
		  )[]
		| undefined;
	setPath: React.Dispatch<React.SetStateAction<string>>;
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
					<td onClick={() => setPath(folder.path_lower!)}>
						{folder.name}
					</td>
				</tr>
			))}
		</table>
	);
};
