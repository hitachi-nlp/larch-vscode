/*---------------------------------------------------------------------------------------------
 * Copyright (c) Hitachi, Ltd. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type ChunkLengthGenerator = Generator<number, void, void>;

function* genOnes(): ChunkLengthGenerator {
    while (true) {
        yield 1;
    }
}

function* genTextChunk(text: string): Generator<string, void, number> {
    // do not separete "\r\n".
    // if "\r\n" is separated into "\r" and "\n", the editor's delete api will be confused.
    function* genOneChar(text: string): Generator<string, void, void> {
        for (const subText of text.split(/(\r\n)/)) {
            if (subText === "\r\n") {
                yield subText;
            } else {
                for (const c of subText) {
                    yield c;
                }
            }
        }
    }

    // ref: https://stackoverflow.com/questions/4547609/how-to-get-character-array-from-a-string
    let buf = "";
    let len = yield "";
    for (const chars of genOneChar(text)) {
        buf += chars;
        if (buf.length >= len) {
            len = yield buf;
            buf = "";
        }
    }
    if (buf) {
        yield buf;
    }
}

function* splitText(
    text: string,
    chunkLenGen: ChunkLengthGenerator
): Generator<string, void, void> {
    /*
     * +--------+     next: undefined       +-----------+    next: undefined       +--------------+
     * |        |   --------------------->  |           |  --------------------->  |              |
     * |        |                           |           |                          | chunkLenGen  |
     * |        |                           |           |  <---------------------  |              |
     * |        |                           |           |    yield: length         +--------------+
     * | caller |                           | splitText |
     * |        |                           |           |    next: length          +--------------+
     * |        |                           |           |  --------------------->  |              |
     * |        |                           |           |                          | textChunkGen |
     * |        |   <---------------------  |           |  <---------------------  |              |
     * +--------+     yield: part of text   |           |    yield: part of text   +--------------+
     *                                      +-----------+
     */

    const textChunkGen = genTextChunk(text);

    // initialize
    textChunkGen.next();

    for (const len of chunkLenGen) {
        const result = textChunkGen.next(len);
        if (result.done) {
            break;
        }

        const chunk = result.value;
        yield chunk;
    }
}

export { splitText, ChunkLengthGenerator, genOnes };
