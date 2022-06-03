/*---------------------------------------------------------------------------------------------
 * Copyright (c) Hitachi, Ltd. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

import { readmeGeneratorCmd } from "./command";

async function chooseWorkspaceFolder(
    wsfs: readonly vscode.WorkspaceFolder[] | undefined
) {
    if (!wsfs || wsfs.length === 0) {
        // no workspaces
        return undefined;
    } else if (wsfs.length === 1) {
        // a single workspace
        return wsfs[0];
    } else {
        // multi-root workspaces
        return await vscode.window.showWorkspaceFolderPick();
    }
}

async function dumpError(wsf: vscode.WorkspaceFolder, error: Error) {
    const dumpUri = vscode.Uri.joinPath(wsf.uri, "error_dump.log");
    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.deleteFile(dumpUri, { ignoreIfNotExists: true });
    wsEdit.createFile(dumpUri);
    wsEdit.insert(dumpUri, new vscode.Position(0, 0), error.stack || "");
    await vscode.workspace.applyEdit(wsEdit);

    const dumpTextDoc = await vscode.workspace.openTextDocument(dumpUri);
    await dumpTextDoc.save();
}

// this method is called when the extension is activated
export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "larch" is now active!');

    let disposable = vscode.commands.registerCommand("larch.cmd", async () => {
        const wsfs = vscode.workspace.workspaceFolders;
        const wsf = await chooseWorkspaceFolder(wsfs);

        try {
            if (!wsf) {
                throw new Error("No workspaces");
            }

            await readmeGeneratorCmd(wsf);
            vscode.window.showInformationMessage("LARCH: done");
        } catch (error) {
            // FIXME: improve error handling
            const msg = String(error);
            vscode.window.showErrorMessage(`LARCH: ${msg}`);
            if (wsf && error instanceof Error) {
                await dumpError(wsf, error);
            }
        }
    });

    context.subscriptions.push(disposable);
}

// this method is called when the extension is deactivated
export function deactivate() {}
