import { createContext, useReducer, useEffect, useContext } from "react";
import { files, DropboxResponse } from "dropbox";

type SelectVaultContextType = {
	state: State;
	dispatch: React.Dispatch<Action>;
	setVaultInSettings: (path: string) => void;
	addFolder: (
		path: string,
	) => Promise<DropboxResponse<files.CreateFolderResult>>;
};
const SelectVaultContext = createContext<SelectVaultContextType | undefined>(
	undefined,
);

type State = {
	path: string[];
	folders: (
		| files.FileMetadataReference
		| files.FolderMetadataReference
		| files.DeletedMetadataReference
	)[];
	isAddFolderDisplayed: boolean;
	isLoading: boolean;
};

type Action =
	| { type: "RESET_VAULT_PATH" }
	| { type: "SET_VAULT_PATH"; payload: { path: string[] } }
	| {
			type: "SET_FOLDERS";
			payload: {
				folders: (
					| files.FileMetadataReference
					| files.FolderMetadataReference
					| files.DeletedMetadataReference
				)[];
			};
	  }
	| { type: "ADD_FOLDER"; payload: { folderName: string } }
	| { type: "TOGGLE_ADD_FOLDER" }
	| { type: "SET_IS_LOADING" };

const reducer = (state: State, action: Action) => {
	switch (action.type) {
		case "RESET_VAULT_PATH":
			return { ...state, path: [] };
		case "SET_VAULT_PATH":
			return {
				...state,
				path: action.payload.path,
			};
		case "SET_FOLDERS":
			return {
				...state,
				folders: action.payload.folders,
				isLoading: false,
			};
		case "ADD_FOLDER":
			return {
				...state,
				path: [...state.path, action.payload.folderName],
				isAddFolderDisplayed: false,
			};
		case "TOGGLE_ADD_FOLDER":
			return {
				...state,
				isAddFolderDisplayed: !state.isAddFolderDisplayed,
			};
		case "SET_IS_LOADING":
			return {
				...state,
				isLoading: true,
			};
		default:
			throw new Error("Reducer Error: Invalid Action");
	}
};

interface SelectVaultProviderProps {
	currentPath: string | undefined;
	children: React.ReactNode;
	listFolders: (
		args: files.ListFolderArg,
	) => Promise<void | DropboxResponse<files.ListFolderResult>>;
	addFolder: (
		path: string,
	) => Promise<DropboxResponse<files.CreateFolderResult>>;
	setVaultInSettings: (path: string) => void;
}

export const SelectVaultProvider: React.FC<SelectVaultProviderProps> = ({
	children,
	currentPath,
	listFolders,
	addFolder,
	setVaultInSettings,
}) => {
	const [state, dispatch] = useReducer(reducer, {
		path: currentPath ? currentPath.split("/") : [],
		folders: [],
		isAddFolderDisplayed: false,
		isLoading: false,
	});

	useEffect(() => {
		console.log("state.path:", state.path);
		dispatch({ type: "SET_IS_LOADING" });
		listFolders({
			path: state.path.length ? "/" + state.path.join("/") : "",
		}).then((res) => {
			if (res) {
				const folders = res.result.entries.filter(
					(entry) => entry[".tag"] === "folder",
				);
				console.log("folders:", folders);
				dispatch({
					type: "SET_FOLDERS",
					payload: { folders: folders },
				});
			}
		});
	}, [state.path]);

	return (
		<SelectVaultContext.Provider
			value={{ state, dispatch, setVaultInSettings, addFolder }}
		>
			{children}
		</SelectVaultContext.Provider>
	);
};

export const useSelectVault = () => {
	const context = useContext(SelectVaultContext);

	if (!context) {
		throw new Error(
			"useSelectVault must be used in the SelectVaultProvider",
		);
	}

	return context;
};
