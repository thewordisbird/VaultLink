import { StrictMode, useState, useEffect } from "react";
import { Folder } from "src/types";
import { PubSub } from "../../lib/pubsub";
import { DropboxProvider } from "../providers/dropbox.provider";
import { useSelectVault } from "./useSelectVault";

const pubsub = new PubSub();
const dropboxProvider = new DropboxProvider();

interface SelectVaultProps {
	currentPath: string | undefined;
}

const SelectVault: React.FC<SelectVaultProps> = ({ currentPath }) => {
	const [state, dispatch] = useSelectVault(currentPath);

	useEffect(() => {
		//console.log("STATE PATH:", state.path);
	}, [state.path]);

	return (
		<StrictMode>
			<Header
				isAddFolderDisplayed={state.isAddFolderDisplayed}
				handleAddFolder={() => dispatch({ type: "TOGGLE_ADD_FOLDER" })}
				handleSelectVault={() =>
					pubsub.publish("set-vault-path", {
						payload: state.path.join("/"),
					})
				}
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
			{/*
			<TableCurrentLocation />
			<TableBody />
			*/}
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

/*
export const TableCurrentLocation: React.FC = () => {
	const [folderName, setFolderName] = useState("");
	//const [state, dispatch] = useSelectVault();

	function handleAddFolder(_e: React.MouseEvent<HTMLButtonElement>): void {
		console.log("handleAddFolder, path, name:", state.path, folderName);
		const folderPath = state.path.length
			? `/${state.path.join("/")}/${folderName}`
			: `/${folderName}`;
		dropboxProvider.addFolder(folderPath).then((_res) => {
			dispatch({ type: "ADD_FOLDER", payload: { folderName } });
		});
	}

	return (
		<div className="folder-current-location">
			<h2>
				{!state.path.length
					? "All folders"
					: state.path[state.path.length - 1]}
				{state.isAddFolderDisplayed && (
					<span className="display-slash"> &#47; </span>
				)}
			</h2>

			{state.isAddFolderDisplayed ? (
				<div className="add-folder-form">
					<input
						type="text"
						onChange={(e) => setFolderName(e.target.value)}
					/>
					<div className="add-folder-form-control">
						<button className="mod-cta" onClick={handleAddFolder}>
							Save
						</button>
						<button
							onClick={() =>
								dispatch({ type: "TOGGLE_ADD_FOLDER" })
							}
						>
							Cancel
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
};

*/
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

/*
 * note: The type for name on Folder is string | undefined as it comes form
 * Dropbox. It appears as there is no way to have an unamed folder so
 * using the non-null assertion should be ok
 */
/*
export const TableBody: React.FC = () => {
	// const [state, dispatch] = useSelectVault();

	// useEffect(() => {
	// 	// TODO: handle error state: should set folders to empty array and display error message
	// 	dispatch({ type: "SET_IS_LOADING" });
	// 	dropboxProvider
	// 		.listFolders(state.path.length ? "/" + state.path.join("/") : "")
	// 		.then((folders) => {
	// 			if (folders) {
	// 				dispatch({
	// 					type: "SET_FOLDERS",
	// 					payload: { folders: folders },
	// 				});
	// 			}
	// 		});
	// }, [state.path]);

	if (state.isLoading) return <h3>Loading...</h3>;
	if (!state.folders.length) return <h3>No sub-folders</h3>;
	return (
		<div style={{ overflowY: "auto", height: "225px" }}>
			<table className="folder-select-table">
				<tbody>
					{state.folders.map((folder, idx) => (
						<tr
							className={`table-row ${idx % 2 == 0 ? "table-alt-row" : ""}`}
							key={folder.path}
						>
							<td
								onClick={() =>
									dispatch({
										type: "SET_VAULT_PATH",
										payload: {
											path: [...state.path, folder.name!],
										},
									})
								}
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
*/
export const MockMe: React.FC = () => {
	//const [state, setState] = useState("");
	const [folders, setFolders] = useState<Folder[]>([]);
	const [error, setError] = useState<string | undefined>();

	useEffect(() => {
		//console.log("DropboxProvider:", dropboxProvider);
		dropboxProvider
			.listFolders("")
			.then((folders) => {
				setFolders(folders);
			})
			.catch((_e) => {
				setError("List folder error");
			});
		// dropboxProvider
		// 	.addFolder("/new_folder")
		// 	.then(() => setState("Folder Added"));

		// fetch("/greeting")
		// 	.then((res) => res.json())
		// 	.then(({ greeting }) => setState(greeting));
	}, []);

	// if (!state) return null;
	// return <h1>{state}</h1>;
	//
	if (!folders.length) return null;
	if (error) return <h1>{error}</h1>;
	return (
		<div>
			{folders.map((folder) => (
				<p key={folder.path}>{folder.name!}</p>
			))}
		</div>
	);
};
export default SelectVault;
