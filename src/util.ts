/*---------------------------------------------------------------------------------------------
 * Copyright (c) Hitachi, Ltd. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from "crypto";

function uuid(): string {
    return crypto.randomUUID();
}

function getRandomInt(min: number, max: number) {
    // ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export { uuid, getRandomInt, sleep };
