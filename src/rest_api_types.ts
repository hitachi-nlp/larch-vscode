/*---------------------------------------------------------------------------------------------
 * Copyright (c) Hitachi, Ltd. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface File {
    name: string;
    excluded: boolean;
    content?: string;
}

interface Directory {
    name: string;
    children: (File | Directory)[];
}

class GenerationRequest {
    files: Directory;
    model: string;
    prompt: string;
    project_name: string; // eslint-disable-line @typescript-eslint/naming-convention

    constructor(
        projectName: string,
        files: Directory,
        model: string,
        prompt?: string
    ) {
        this.files = files;
        this.model = model;
        this.prompt = prompt || "";
        this.project_name = projectName;
    }

    toJson() {
        return JSON.stringify(this);
    }
}

interface GenerationModel {
    id: string;
    description: string;
    owned_by: string; // eslint-disable-line @typescript-eslint/naming-convention
}

interface GenerationModels {
    data: GenerationModel[];
}

interface DiffInsertOpcode {
    type: "insertion";
    start: number;
    text: string;
}

interface DiffDeleteOpcode {
    type: "deletion";
    start: number;
    end: number;
}

type DiffOpcode = DiffInsertOpcode | DiffDeleteOpcode;

interface Generation {
    text: string;
    index: number;
    logprobs: number;
    edits?: DiffOpcode[];
}

interface GenerationResponse {
    id: string;
    model: string;
    choices: Generation[];
}

function isGenerationModel(obj: any): obj is GenerationModel {
    return (
        typeof obj.id === "string" &&
        typeof obj.description === "string" &&
        typeof obj.owned_by === "string"
    );
}

function isGenerationModels(obj: any): obj is GenerationModels {
    return Array.isArray(obj.data) && obj.data.every(isGenerationModel);
}

function isGeneration(obj: any): obj is Generation {
    return (
        typeof obj.text === "string" &&
        typeof obj.index === "number" &&
        typeof obj.logprobs === "number"
    );
}

function isGenerationResponse(obj: any): obj is GenerationResponse {
    return (
        typeof obj.id === "string" &&
        typeof obj.model === "string" &&
        Array.isArray(obj.choices) &&
        obj.choices.every(isGeneration)
    );
}

function toGenerationModels(obj: any): GenerationModels {
    if (!isGenerationModels(obj)) {
        throw new Error(
            `invalid as a GenerationModels: ${JSON.stringify(obj)}`
        );
    }

    return obj;
}

function toGenerationResponse(obj: any): GenerationResponse {
    if (!isGenerationResponse(obj)) {
        throw new Error(
            `invalid as a GenerationResponse: ${JSON.stringify(obj)}`
        );
    }

    return obj;
}

export {
    File,
    Directory,
    GenerationRequest,
    GenerationModel,
    GenerationModels,
    Generation,
    GenerationResponse,
    DiffOpcode,
    DiffInsertOpcode,
    DiffDeleteOpcode,
    toGenerationModels,
    toGenerationResponse,
};
