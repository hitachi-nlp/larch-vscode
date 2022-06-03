/*---------------------------------------------------------------------------------------------
 * Copyright (c) Hitachi, Ltd. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

import { performance } from "perf_hooks";

import {
    DiffOpcode,
    DiffInsertOpcode,
    DiffDeleteOpcode,
} from "./rest_api_types";
import { splitText, ChunkLengthGenerator } from "./split_text";
import { replaceWholeContent } from "./util_editor";
import { getRandomInt, sleep } from "./util";

async function editAnimation(
    textDoc: vscode.TextDocument,
    editor: vscode.TextEditor,
    text: string,
    diffOpcodes: DiffOpcode[] | undefined,
    wpm: number
) {
    if (diffOpcodes) {
        await editAnimationDiff(textDoc, editor, text, diffOpcodes, wpm);
    } else {
        await editAnimationWhole(textDoc, editor, text, wpm);
    }
}

async function editAnimationWhole(
    textDoc: vscode.TextDocument,
    editor: vscode.TextEditor,
    text: string,
    wpm: number
) {
    // clear content
    await replaceWholeContent(editor, "");

    const motionCtrl = new MotionController(wpm);

    const numOfWords = (text.match(/\s+/g) || []).length;
    const startTime = performance.now();
    for await (const chunk of splitText(text, motionCtrl.genChunkLength())) {
        // increment insertion position by the length of textChunk does not work because of
        // (the length of textChunk) != (the length of inserted text in editor)
        // e.g. textChunk: "\n" --> inserted text: "\r\n" on Windows
        // go to EOF.
        const pos = textDoc.validatePosition(
            new vscode.Position(Number.MAX_VALUE, Number.MAX_VALUE)
        );
        // scroll if need
        editor.revealRange(
            new vscode.Range(pos, pos),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );
        // insert part of text
        await editor.edit((editBuilder) => {
            editBuilder.insert(pos, chunk);
        });

        // wait if need
        await motionCtrl.paceMaker.next(chunk.length);
    }
    console.log(`word count: ${numOfWords}, char count: ${text.length}`);
    console.log(
        `animation duration: ${(performance.now() - startTime) / 1000}`
    );
}

async function editAnimationDiff(
    textDoc: vscode.TextDocument,
    editor: vscode.TextEditor,
    text: string,
    diffOpcodes: DiffOpcode[],
    wpm: number
) {
    const motionCtrl = new MotionController(wpm);
    const aTextChars = Array.from(textDoc.getText());
    const bTextChars = Array.from(text);

    diffOpcodes = normalizeDiffOpcodes(
        diffOpcodes,
        editor.document,
        aTextChars,
        bTextChars
    );

    const insertFn = async (opcode: DiffInsertOpcode, offset: number) => {
        const [startOffset, _] = convertCharIndex(
            aTextChars,
            opcode.start,
            opcode.start
        );
        const resultText = await insertText(
            editor,
            startOffset + offset,
            opcode.text,
            motionCtrl
        );
        return resultText;
    };

    const deleteFn = async (opcode: DiffDeleteOpcode, offset: number) => {
        const [startOffset, endOffset] = convertCharIndex(
            aTextChars,
            opcode.start,
            opcode.end
        );
        await deleteText(
            editor,
            startOffset + offset,
            endOffset + offset,
            motionCtrl
        );
    };

    const sumCharLength = (textChars: string[]) =>
        textChars.reduce((acc: number, curr: string) => acc + curr.length, 0);

    let offset = 0;

    for (const opcode of diffOpcodes) {
        switch (opcode.type) {
            case "insertion": {
                const resultText = await insertFn(opcode, offset);

                // (the length of inserted text) != (the length of inserted text in editor)
                // e.g. textChunk: "\n" --> inserted text: "\r\n" on Windows
                offset += resultText.length;
                break;
            }
            case "deletion": {
                await deleteFn(opcode, offset);
                offset -= sumCharLength(
                    aTextChars.slice(opcode.start, opcode.end)
                );
                break;
            }
            default: {
                throw new Error(`unknown opcode: ${opcode}`);
            }
        }
    }
}

function normalizeDiffOpcodes(
    diffOpcodes: DiffOpcode[],
    textDoc: vscode.TextDocument,
    aTextChars: string[],
    bTextChars: string[]
) {
    if (textDoc.eol === vscode.EndOfLine.CRLF) {
        diffOpcodes = removeOphanedLFDiffOpcodes(
            diffOpcodes,
            aTextChars,
            bTextChars
        );
    }

    diffOpcodes = sortDiffOpcodes(diffOpcodes);

    return diffOpcodes;
}

function removeOphanedLFDiffOpcodes(
    diffOpcodes: DiffOpcode[],
    aTextChars: string[],
    bTextChars: string[]
) {
    /*
     * In a document of CRLF, if "\r\n" is separated into adjacent opcodes,
     * the editor api will behave falsely.
     */

    return diffOpcodes.map((opcode) => {
        if (opcode.type === "deletion") {
            // normalize orphaned "\r"
            if (opcode.start !== opcode.end) {
                if (
                    aTextChars[opcode.end - 1] === "\r" &&
                    aTextChars[opcode.end] === "\n"
                ) {
                    const modOpcode = { ...opcode }; // clone
                    modOpcode.end -= 1;
                    // console.log("modify opcode: ", modOpcode);
                    return modOpcode;
                }
            }
        }

        return opcode;
    });
}

function sortDiffOpcodes(diffOpcodes: DiffOpcode[]) {
    diffOpcodes = [...diffOpcodes]; // clone

    diffOpcodes.sort((aOpcode, bOpcode) => {
        return aOpcode.start - bOpcode.start;
    });

    return diffOpcodes;
}

function convertCharIndex(
    charArray: string[],
    startIndex: number,
    endIndex: number
) {
    /*
     * 'startIndex' and 'endIndex' are indixes for unicode characters (a surrogate pair counts as 1).
     * this functions converts theses to indixes for UTF-16 (a surrogate pair counts as 2).
     */
    let sum = 0;

    for (let i = 0; i < startIndex; ++i) {
        sum += charArray[i].length;
    }
    const convStartIndex = sum;

    for (let i = startIndex; i < endIndex; ++i) {
        sum += charArray[i].length;
    }
    const convEndIndex = sum;

    return [convStartIndex, convEndIndex];
}

class MotionController {
    wpm: number; // words per minute
    cps: number; // characters per second
    paceMaker: AsyncGenerator<number, void, number>;
    chunkAverageLen: number = 0;

    constructor(wpm: number) {
        this.wpm = wpm;
        this.cps = this.wpm2cps(wpm);
        this.paceMaker = this.makePace();

        // initialize
        this.paceMaker.next();
    }

    private wpm2cps(wpm: number) {
        const wordAverageLen = 5; // TODO
        const cps = (wpm * wordAverageLen) / 60;
        return cps;
    }

    private calcChunkLen(
        cps: number,
        estimateLen: number,
        estimateDuration: number // unit: second
    ) {
        const estimateCps = estimateLen / estimateDuration;
        const chunkLen = cps / estimateCps;

        console.log(
            `estimate: cps=${cps}, estimate_cps=${estimateCps}, chunkLen=${chunkLen}`
        );
        console.log(
            `estimate: estimate_len=${estimateLen}, estimate_duration=${estimateDuration}`
        );

        return Math.max(chunkLen, 1);
    }

    private *estimateChunkLen(): Generator<number, void, void> {
        // estimate chunk size
        const estimateLen = 30; // TODO
        const estimateStartTime = performance.now();
        for (let i = 0; i < estimateLen; ++i) {
            yield 1;
        }
        const estimateStopTime = performance.now();

        // set chunkAverageLen
        this.chunkAverageLen = this.calcChunkLen(
            this.cps,
            estimateLen,
            (estimateStopTime - estimateStartTime) / 1000
        );
    }

    *genChunkLength(): ChunkLengthGenerator {
        while (true) {
            if (this.chunkAverageLen < 1.0) {
                yield 1;
            } else {
                yield getRandomInt(1, this.chunkAverageLen * 2);
            }
        }
    }

    async *makePace(): AsyncGenerator<number, void, number> {
        const startTime = performance.now();

        let sum = yield 0;

        // estimate chunk size
        for (const _ of this.estimateChunkLen()) {
            sum += yield 0;
        }

        while (true) {
            const expectedDurationMs = (sum / this.cps) * 1000;
            const realDurationMs = performance.now() - startTime;
            const waitDurationMs = expectedDurationMs - realDurationMs;
            if (waitDurationMs > 0.0) {
                await sleep(waitDurationMs);
            }

            // console.log(`makePace: ${waitDurationMs}, ${this.chunkAverageLen}`);
            sum += yield waitDurationMs / 1000;
        }
    }
}

async function insertText(
    editor: vscode.TextEditor,
    offset: number,
    text: string,
    motionCtrl: MotionController
) {
    const document = editor.document;
    const insertPos = document.positionAt(offset);

    const beforePos = insertPos;

    // move cursor
    editor.selection = new vscode.Selection(insertPos, insertPos);

    for (const chunk of splitText(text, motionCtrl.genChunkLength())) {
        const cursorPos = editor.selection.active;

        // scroll if need
        editor.revealRange(
            new vscode.Range(cursorPos, cursorPos),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );

        await editor.edit((editBuilder) => {
            editBuilder.insert(cursorPos, chunk);
        });

        await motionCtrl.paceMaker.next(chunk.length);
    }

    const afterPos = editor.selection.active;

    const resultText = document.getText(new vscode.Range(beforePos, afterPos));
    return resultText;
}

async function deleteText(
    editor: vscode.TextEditor,
    startOffset: number,
    endOffset: number,
    motionCtrl: MotionController
) {
    const document = editor.document;
    const startPos = document.positionAt(startOffset);
    const endPos = document.positionAt(endOffset);
    const text = document.getText(new vscode.Range(startPos, endPos));

    const reverseFn = (chunks: Generator<string, void, unknown>) => {
        const charReverseArray: string[] = [];
        for (const c of chunks) {
            charReverseArray.unshift(c);
        }
        return charReverseArray;
    };

    // move cursor
    editor.selection = new vscode.Selection(endPos, endPos);

    // delete characters backward in order to show transitions in a natual way
    for (const chunk of await reverseFn(
        splitText(text, motionCtrl.genChunkLength())
    )) {
        const cursorPos = editor.selection.active;
        const delStartPos = document.positionAt(
            document.offsetAt(cursorPos) - chunk.length
        );

        // scroll if need
        editor.revealRange(
            new vscode.Range(delStartPos, cursorPos),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );

        await editor.edit((editBuilder) => {
            editBuilder.delete(new vscode.Range(delStartPos, cursorPos));
        });

        await motionCtrl.paceMaker.next(chunk.length);
    }
}

export { editAnimation };
