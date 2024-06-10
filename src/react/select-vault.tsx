import { StrictMode, useState } from "react";
import {
	SelectVaultProvider,
	useSelectVault,
} from "./select-vault-context-provider";

import type { Folder } from "../types";

interface SelectVaultProps {
	currentPath: string | undefined;
	listFolders: () => Promise<Folder[]>;
	addFolder: (path: string) => Promise<void>;
	setVaultInSettings: (path: string) => void;
}

const SelectVault: React.FC<SelectVaultProps> = ({
	currentPath,
	listFolders,
	addFolder,
	setVaultInSettings,
}) => {
	return (
		<StrictMode>
			<SelectVaultProvider
				currentPath={currentPath}
				listFolders={listFolders}
				addFolder={addFolder}
				setVaultInSettings={setVaultInSettings}
			>
				<TableControl />
				<TableBreadcrumb />
				<TableCurrentLocation />
				<TableBody />
			</SelectVaultProvider>
		</StrictMode>
	);
};

const TableControl: React.FC = () => {
	const { state, dispatch, setVaultInSettings } = useSelectVault();

	return (
		<div className="control-container">
			<h1>Select Vault</h1>
			<div className="control-btn-container">
				<button
					disabled={state.isAddFolderDisplayed}
					onClick={() => dispatch({ type: "TOGGLE_ADD_FOLDER" })}
				>
					Add folder
				</button>
				<button
					className="mod-cta"
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
	//console.log("breadcrumbs", state.path);
	if (!state.path.length) return null;

	return (
		<div>
			<TextLink onClick={() => dispatch({ type: "RESET_VAULT_PATH" })}>
				All folders
			</TextLink>
			{state.path.slice(0, state.path.length - 1).map((dir, idx, arr) => {
				if (dir === "") return null;
				return (
					<>
						<span className="display-slash">/</span>
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
					</>
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

interface TextLinkProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	children: string;
}

const TextLink: React.FC<TextLinkProps> = ({ children, ...props }) => {
	return (
		<button type="button" className="btn-text-link" onClick={props.onClick}>
			{children}
		</button>
	);
};

const TableBody: React.FC = () => {
	const { state, dispatch } = useSelectVault();

	if (!state.folders) return null;

	if (state.isLoading) return <h3>Loading...</h3>;
	if (!state.folders.length) return <h3>No sub-folders</h3>;
	return (
		<div style={{ overflowY: "auto", height: "225px" }}>
			<table className="folder-select-table">
				<tbody>
					{state.folders.map((folder, idx) => (
						<tr
							className={`table-row ${idx % 2 == 0 ? "table-alt-row" : ""}`}
							key={(folder as any).id}
						>
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
		</div>
	);
};

export default SelectVault;
