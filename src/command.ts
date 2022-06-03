/*---------------------------------------------------------------------------------------------
 * Copyright (c) Hitachi, Ltd. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

import type { GitExtension } from "./vendor/git.d";

import * as path from "path";
import { performance } from "perf_hooks";
import * as packlist from "npm-packlist";

import { readmeGeneratorApi, healthApi, availableModelsApi } from "./rest_api";
import { getReadmeBackupUri, getReadmeContent, existsFile } from "./files";
import { splitText } from "./split_text";
import { DiffOpcode } from "./rest_api_types";
import { editAnimation } from "./editor_motions";
import { replaceWholeContent } from "./util_editor";

async function isServerHealthy() {
    const serverState = await healthApi();
    return serverState;
}

async function chooseGenerationModel() {
    const models = await availableModelsApi();
    const modelIds = models.map((model) => model.id);

    if (modelIds.length === 0) {
        // no models
        throw new Error("the LARCH server has no generation models");
    } else if (modelIds.length === 1) {
        // a single model
        return modelIds[0];
    } else {
        // multiple models
        return await vscode.window.showQuickPick(modelIds, {
            placeHolder: "choose a generation model ...",
        });
    }
}

async function readmeGeneratorCmd(wsf: vscode.WorkspaceFolder) {
    if (!(await isServerHealthy())) {
        throw new Error("the LARCH server looks unhealty");
    }

    const projectName = await getProjectName(wsf);
    if (!projectName) {
        throw new Error("No project name");
    }

    const generationModel = await chooseGenerationModel();
    if (!generationModel) {
        throw new Error("No generation models");
    }

    await vscode.window.withProgress(
        {
            title: "LARCH",
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        },
        async (progress, _token) => {
            progress.report({ message: "collecting files ..." });
            const filePaths = await collectFiles(wsf);
            const prompt = await getReadmeContent(vscode.workspace.fs, wsf.uri);

            progress.report({ message: "generating a README file ..." });
            const [readmeContent, diffOpcodes] = await generateReadme(
                projectName,
                wsf.uri.fsPath,
                filePaths,
                generationModel,
                prompt
            );

            progress.report({ message: "updating workspace ..." });
            const wpm = getWordsPerMinute();
            await updateWorkspace(wsf, readmeContent, diffOpcodes, wpm);
        }
    );
}

function getWordsPerMinute() {
    const config = vscode.workspace.getConfiguration("larch");
    const wpm = config.get<number>("animationWordsPerMinute");

    return wpm || 1000;
}

async function getProjectName(wsf: vscode.WorkspaceFolder) {
    const projectName =
        (await getProjectNameFromGit(wsf)) ||
        (await getProjectNameFromWsf(wsf));

    const projectNameByUser = await vscode.window.showInputBox({
        title: "input project name",
        value: projectName,
        valueSelection: [projectName.length, projectName.length],
    });

    return projectNameByUser;
}

async function getProjectNameFromWsf(wsf: vscode.WorkspaceFolder) {
    const rootDir = wsf.uri.fsPath;
    return path.parse(rootDir).name;
}

async function getProjectNameFromGit(wsf: vscode.WorkspaceFolder) {
    // ref: https://github.com/microsoft/vscode/tree/main/extensions/git
    //      https://github.com/gitkraken/vscode-gitlens
    try {
        const extension =
            vscode.extensions.getExtension<GitExtension>("vscode.git");
        if (!extension) {
            return undefined;
        }

        const gitExtension = extension.isActive
            ? extension.exports
            : await extension.activate();
        const git = gitExtension.getAPI(1);

        const wsfUri = vscode.Uri.file(wsf.uri.fsPath);
        const repo = git.getRepository(wsfUri);
        if (!repo) {
            return undefined;
        }

        for (const remote of repo.state.remotes) {
            if (remote.name === "origin") {
                if (remote.fetchUrl) {
                    const uri = vscode.Uri.parse(remote.fetchUrl);
                    return path.parse(uri.path).name;
                }
            }
        }

        // not found remote "origin"
        return undefined;
    } catch (error) {
        console.warn("WARNING in GitExtension: %s", error);
        return undefined;
    }
}

async function collectFiles(wsf: vscode.WorkspaceFolder) {
    const rootDir = wsf.uri.fsPath;
    const files = await packlist({ path: rootDir });
    const filePaths = files.map((file) => path.join(rootDir, file));

    return filePaths;
}

async function generateReadme(
    projectName: string,
    rootPath: string,
    filePaths: string[],
    generationModel: string,
    prompt?: string
) {
    return await readmeGeneratorApi(
        projectName,
        rootPath,
        filePaths,
        generationModel,
        prompt
    );
}

async function updateWorkspace(
    wsf: vscode.WorkspaceFolder,
    readmeContent: string,
    diffOpcodes: DiffOpcode[] | undefined,
    wpm: number
) {
    const readmeUri = vscode.Uri.joinPath(wsf.uri, "README.md");
    const readmeBkUri = await getReadmeBackupUri(vscode.workspace.fs, wsf.uri);

    if (!existsFile(vscode.workspace.fs, readmeUri)) {
        // create a new file
        const wsEdit = new vscode.WorkspaceEdit();
        wsEdit.createFile(readmeUri);
        await vscode.workspace.applyEdit(wsEdit);
    } else {
        // backup the current file
        if (readmeBkUri) {
            await vscode.workspace.fs.copy(readmeUri, readmeBkUri);
        }
    }

    const textDoc = await vscode.workspace.openTextDocument(readmeUri);
    const editor = await vscode.window.showTextDocument(textDoc);

    try {
        await editAnimation(textDoc, editor, readmeContent, diffOpcodes, wpm);
    } finally {
        // ensure the file content isn't corrupted by unsuspected bad effects of animation
        await replaceWholeContent(editor, readmeContent);
        const saveResult = await editor.document.save();
        if (!saveResult) {
            throw new Error("Failed to save README file");
        }
    }
}

export { readmeGeneratorCmd };
