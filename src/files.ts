/*---------------------------------------------------------------------------------------------
 * Copyright (c) Hitachi, Ltd. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

/**
 * Generate backup URI for README.md.
 *
 * if README.md file does not exist, return Promise<undefined>.
 */
async function getReadmeBackupUri(fs: vscode.FileSystem, dir: vscode.Uri) {
    const allFiles = await fs.readDirectory(dir);
    const allFilenames = allFiles.map(([name, _fileType]) => name);

    const backupName = nextReadmeBackupName(allFilenames);

    if (backupName) {
        return vscode.Uri.joinPath(dir, backupName);
    } else {
        return undefined;
    }
}

/**
 *
 * @returns "README.md.bk<N>", where <N> is the largest backup number plus 1.
 *     if README.md file does not exist, return undefined.
 */
function nextReadmeBackupName(listOfFiles: string[]): string | undefined {
    const readmePat = /^README\.md(?<bk>\.bk(?<bkIndex>\d+))?$/;

    let readmeExists = false;
    let bkMax = 0;

    for (const filename of listOfFiles) {
        const match = filename.match(readmePat);
        if (!match) {
            continue;
        }

        if (!match.groups?.bk) {
            readmeExists = true;
        } else {
            const bkIndex = Number(match.groups.bkIndex);
            if (bkMax < bkIndex) {
                bkMax = bkIndex;
            }
        }
    }

    if (readmeExists) {
        return `README.md.bk${bkMax + 1}`;
    } else {
        return undefined;
    }
}

/**
 * if the file exists, return true. Otherwise return false.
 */
async function existsFile(fs: vscode.FileSystem, uri: vscode.Uri) {
    try {
        await fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

/**
 * Read README file ("README.md", "README.txt", or "README"), then return the content.
 *
 * @returns the content of README file.
 *     if README file does not exist, return undefined.
 */
async function getReadmeContent(
    fs: vscode.FileSystem,
    dir: vscode.Uri
): Promise<string | undefined> {
    async function getContent(filename: string) {
        const fileUri = vscode.Uri.joinPath(dir, filename);
        const textDoc = await vscode.workspace.openTextDocument(fileUri);
        return textDoc.getText();
    }

    const readmeFiles = ["README.md", "README.txt", "README"]; // FIXME

    for (const readmeFile of readmeFiles) {
        try {
            return await getContent(readmeFile);
        } catch (error) {
            // ignore error
        }
    }

    // no readme files
    return undefined;
}

export { getReadmeBackupUri, getReadmeContent, existsFile };
