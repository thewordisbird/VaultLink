# VaultLink

An Obsidian plugin to link your vault to a cloud provider. Currently only supporting dropbox.

## Sync Protocol
There are several conditions that lead to a full client/provider sync.

NOTE: Provider in the below context refers to the remote cloud provider
### New Remote Vault Selection
When a new vault is selected the following rules are applied to the sync:
- Provider and client files with the same name and content hash are untouched
- Provider and client files with the same name but different content hashes sync the file with the most recent modification timestamp
- Provider files that do not exist on the client are downloaded and added to the client
- Client files that do not exist on the provider are uploaded to the provider

