import { StrictMode, useState, useEffect } from "react";
import { Folder, PubsubTopic } from "src/types";
import { PubSub } from "../../lib/pubsub";
import { DropboxProvider } from "../providers/dropbox.provider";
import { useSelectVault } from "./useSelectVault";

const pubsub = new PubSub();
const dropboxProvider = new DropboxProvider();

interface SelectVaultProps {
	currentPath: string | undefined;
	closeModal: () => void;
}

const SelectVault: React.FC<SelectVaultProps> = ({
	currentPath,
	closeModal,
}) => {
	const [state, dispatch] = useSelectVault(currentPath);

	return (
		<StrictMode>
			<Header
				isAddFolderDisplayed={state.isAddFolderDisplayed}
				handleAddFolder={() => dispatch({ type: "TOGGLE_ADD_FOLDER" })}
				handleSelectVault={() => {
					pubsub.publish(PubsubTopic.SET_VAULT_PATH, {
						payload: state.path.join("/"),
					});
					closeModal();
				}}
			/>
			<Breadcrumb
				path={state.path}
				handleGoToRoot={() => dispatch({ type: "RESET_VAULT_PATH" })}
				handleGoToFolder={(path) =>
					dispatch({
						type: "SET_VAULT_PATH",
						payload: { path },
					})
				}
			/>
			<CurrentLocation
				path={state.path}
				isAddFolderDisplayed={state.isAddFolderDisplayed}
				handleSave={(folderName) => {
					const folderPath = state.path.length
						? `/${state.path.join("/")}/${folderName}`
						: `/${folderName}`;

					dropboxProvider.addFolder(folderPath).then((_res) => {
						dispatch({
							type: "ADD_FOLDER",
							payload: {
								folderName: folderPath.split("/").pop() || "",
							},
						});
					});
				}}
				handleCancel={() => {
					dispatch({ type: "TOGGLE_ADD_FOLDER" });
				}}
			/>
			<FolderList
				isLoading={state.isLoading}
				folders={state.folders}
				handleSelectFolder={(folderName) => {
					dispatch({
						type: "SET_VAULT_PATH",
						payload: {
							path: [...state.path, folderName],
						},
					});
				}}
			/>
		</StrictMode>
	);
};

interface HeaderProps {
	isAddFolderDisplayed: boolean;
	handleAddFolder: () => void;
	handleSelectVault: () => void;
}

export const Header: React.FC<HeaderProps> = ({
	isAddFolderDisplayed,
	handleAddFolder,
	handleSelectVault,
}) => (
	<div className="control-container">
		<h1>Select vault</h1>
		<div className="control-btn-container">
			<button disabled={isAddFolderDisplayed} onClick={handleAddFolder}>
				Add folder
			</button>
			<button
				className="mod-cta"
				disabled={isAddFolderDisplayed}
				onClick={handleSelectVault}
			>
				Select vault
			</button>
		</div>
	</div>
);

interface BreadcrumbProps {
	path: string[];
	handleGoToRoot: () => void;
	handleGoToFolder: (path: string[]) => void;
}
export const Breadcrumb: React.FC<BreadcrumbProps> = ({
	path,
	handleGoToRoot,
	handleGoToFolder,
}) => {
	if (!path.length) return null;

	return (
		<nav aria-label="Breadcrumb">
			<TextLink onClick={handleGoToRoot}>All folders</TextLink>
			{path.slice(0, path.length - 1).map((dir, idx, arr) => {
				if (dir === "") return null;
				return (
					<>
						<span className="display-slash">/</span>
						<TextLink
							key={arr.slice(0, idx + 1).join("")}
							onClick={() =>
								handleGoToFolder(arr.slice(0, idx + 1))
							}
						>
							{dir}
						</TextLink>
					</>
				);
			})}
		</nav>
	);
};

interface CurrentLocationProps {
	path: string[];
	isAddFolderDisplayed: boolean;
	handleSave: (folderName: string) => void;
	handleCancel: () => void;
}

const CurrentLocation: React.FC<CurrentLocationProps> = ({
	path,
	isAddFolderDisplayed,
	handleSave,
	handleCancel,
}) => {
	const [folderName, setFolderName] = useState("");

	return (
		<div className="folder-current-location">
			<h2>
				{!path.length ? "All folders" : path[path.length - 1]}

				{isAddFolderDisplayed && (
					<span className="display-slash"> &#47; </span>
				)}
			</h2>
			{isAddFolderDisplayed && (
				<div className="add-folder-form">
					<input
						type="text"
						onChange={(e) => setFolderName(e.target.value)}
					/>
					<div className="add-folder-form-control">
						<button
							className="mod-cta"
							onClick={() => handleSave(folderName)}
						>
							Save
						</button>
						<button onClick={handleCancel}>Cancel</button>
					</div>
				</div>
			)}
		</div>
	);
};

interface TextLinkProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	children: string;
}

export const TextLink: React.FC<TextLinkProps> = ({ children, ...props }) => {
	return (
		<button type="button" className="btn-text-link" onClick={props.onClick}>
			{children}
		</button>
	);
};

interface FolderListProps {
	isLoading: boolean;
	folders: Folder[];
	handleSelectFolder: (folderName: string) => void;
}

const FolderList: React.FC<FolderListProps> = ({
	isLoading,
	folders,
	handleSelectFolder,
}) => {
	if (isLoading) return <h3>Loading...</h3>;
	if (!folders.length) return <h3>No sub-folders</h3>;

	return (
		<div style={{ overflowY: "auto", height: "225px" }}>
			<table className="folder-select-table">
				<tbody>
					{folders.map((folder, idx) => (
						<tr
							className={`table-row ${idx % 2 == 0 ? "table-alt-row" : ""}`}
							key={folder.path}
						>
							<td
								onClick={() => handleSelectFolder(folder.name!)}
							>
								{folder.name!}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};

export default SelectVault;
