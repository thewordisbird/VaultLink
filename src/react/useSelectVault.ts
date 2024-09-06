import { useReducer, useEffect } from "react";
import { ProviderFolderResult } from "src/providers/types";
import { DropboxProvider } from "../providers/dropbox.provider";
import type { ProviderPath } from "../types";

type State = {
	path: string[];
	folders: ProviderFolderResult[];
	isAddFolderDisplayed: boolean;
	isLoading: boolean;
};

type Action =
	| { type: "RESET_VAULT_PATH" }
	| { type: "SET_VAULT_PATH"; payload: { path: string[] } }
	| {
			type: "SET_FOLDERS";
			payload: {
				folders: ProviderFolderResult[];
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
			console.log("update path:", action.payload.path);
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

const dropboxProvider = new DropboxProvider();

export function useSelectVault(
	currentPath?: string,
): [State, React.Dispatch<Action>] {
	const [state, dispatch] = useReducer(reducer, null, () => ({
		path: currentPath ? currentPath.split("/") : [],
		folders: [],
		isAddFolderDisplayed: false,
		isLoading: false,
	}));

	useEffect(() => {
		// TODO: handle error state: should set folders to empty array and display error message
		dispatch({ type: "SET_IS_LOADING" });
		//TODO: Sanitize Path
		const vaultRoot = state.path.length ? "/" + state.path.join("/") : "";
		console.log("vaultRoot:", vaultRoot);
		dropboxProvider
			.listFoldersAndFiles({
				vaultRoot: vaultRoot as ProviderPath,
				recursive: false,
			})
			.then(({ folders }) => {
				if (folders) {
					dispatch({
						type: "SET_FOLDERS",
						payload: { folders: folders },
					});
				}
			})
			.catch((e: any) => {
				console.error("DROPBOX PROVIDER ERROR:", e);
			});
	}, [state.path]);

	return [state, dispatch];
}
