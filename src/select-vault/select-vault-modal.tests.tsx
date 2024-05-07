/*
Launching Modal:
-	display all folders from root if no path set
-	display all sub folders of path if set
-	dispaly error banner if there is a request error

Add Folder:
-	Adds a new folder to the current path and navigates to that location
-	Can immediately add a child folder to the newly created folder
-	display error banner for any api issues

Select vault:
-	sets the vault setting and closes the modal

Navigation:
-	At root folder there are no breadcrumbs and the title reads "All folders"
-	In a child folder the breadcrumbs display up to the parent
-	Clicking a breadcrumb loads the subfolders of the selected folder
-	The active folder is displayed above the table



*/
