/*---------------------------------------------------------------------------------------------
 * Copyright (c) Hitachi, Ltd. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

import * as fsPromises from "fs/promises";
import * as path from "path";
import { URL } from "url";

import fetch from "node-fetch";
import { isBinaryFile } from "isbinaryfile";

import {
    GenerationRequest,
    GenerationModel,
    toGenerationModels,
    toGenerationResponse,
    Directory,
    DiffOpcode,
} from "./rest_api_types";

type DirMap = {
    [path: string]: Directory;
};

function getBaseUrlOfRestApi() {
    const config = vscode.workspace.getConfiguration("larch");
    const url = config.get<string>("restAPI");

    if (!url) {
        throw new Error("No Setting: larch.restAPI");
    }

    return url;
}

function getFileSizeThreshold() {
    const config = vscode.workspace.getConfiguration("larch");
    const threshold = config.get<number>("fileSizeThreshold");

    return threshold || 100_000; // default: 100kbytes
}

async function isSizeAcceptable(fh: fsPromises.FileHandle, threshold: number) {
    const stat = await fh.stat();
    return stat.size < threshold;
}

async function createFileTree(
    rootPath: string,
    filePaths: string[],
    fileSizeThreshold: number
) {
    const dirMap: DirMap = {};

    function makeDirs(dirPath: string): Directory {
        if (dirPath in dirMap) {
            return dirMap[dirPath];
        }

        let parentSpec: Directory | undefined;

        if (dirPath !== rootPath) {
            const parentPath = path.dirname(dirPath);
            parentSpec = makeDirs(parentPath);
        }

        const dirObj = {
            name: path.basename(dirPath),
            children: [],
        };

        dirMap[dirPath] = dirObj;
        parentSpec?.children?.push(dirObj);

        return dirObj;
    }

    async function createFileObj(filePath: string, fh: fsPromises.FileHandle) {
        let content: string | undefined = undefined;
        let excluded = true;

        try {
            if (await isSizeAcceptable(fh, fileSizeThreshold)) {
                const buf = await fh.readFile();
                if (!(await isBinaryFile(buf))) {
                    content = buf.toString();
                    excluded = false;
                }
            }
        } catch (error) {
            // ignore
            console.log(error);
        }

        return {
            name: path.basename(filePath),
            excluded: excluded,
            content: content,
        };
    }

    for (const filePath of filePaths) {
        let fh = undefined;
        try {
            fh = await fsPromises.open(filePath, "r");
            const stat = await fh.stat();

            if (stat.isFile()) {
                const parentPath = path.dirname(filePath);
                const parentSpec = makeDirs(parentPath);

                const fileObj = await createFileObj(filePath, fh);

                parentSpec.children?.push(fileObj);
            } else {
                // ignore other types
            }
        } finally {
            await fh?.close();
        }
    }

    return dirMap[rootPath];
}

async function readmeGeneratorApi(
    projectName: string,
    rootPath: string,
    filePaths: string[],
    generationModel: string,
    prompt?: string
): Promise<[string, DiffOpcode[] | undefined]> {
    const url = new URL("/generations", getBaseUrlOfRestApi());
    const fileSizeThreshold = getFileSizeThreshold();

    const rootDirObj = await createFileTree(
        rootPath,
        filePaths,
        fileSizeThreshold
    );

    const generationRequest = new GenerationRequest(
        projectName,
        rootDirObj,
        generationModel,
        prompt
    );

    const response = await fetch(url, {
        method: "post",
        body: generationRequest.toJson(),
        headers: { "Content-Type": "application/json" }, // eslint-disable-line @typescript-eslint/naming-convention
    });

    if (response.ok) {
        const responseBody = await response.json();
        const generationResponse = toGenerationResponse(responseBody);
        if (generationResponse.choices.length > 0) {
            return [
                generationResponse.choices[0]["text"],
                generationResponse.choices[0]["edits"],
            ];
        } else {
            throw new Error(
                `GenerationResponse's choices is empty: ${JSON.stringify(
                    responseBody
                )}`
            );
        }
    } else {
        const requestBody = await response.text();
        throw new Error(`status=${response.status}, response=${requestBody}`);
    }
}

async function availableModelsApi(): Promise<GenerationModel[]> {
    const url = new URL("/models", getBaseUrlOfRestApi());
    const response = await fetch(url, { method: "get" });
    if (response.ok) {
        const responseBody = await response.json();
        const generationModels = toGenerationModels(responseBody);
        return generationModels.data;
    } else {
        const requestBody = await response.text();
        throw new Error(`status=${response.status}, response=${requestBody}`);
    }
}

async function healthApi(): Promise<boolean> {
    const url = new URL("/health", getBaseUrlOfRestApi());
    const response = await fetch(url, { method: "get" });
    return response.ok;
}

export { readmeGeneratorApi, availableModelsApi, healthApi };
