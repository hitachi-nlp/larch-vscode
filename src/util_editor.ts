/*---------------------------------------------------------------------------------------------
 * Copyright (c) Hitachi, Ltd. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

async function replaceWholeContent(editor: vscode.TextEditor, text: string) {
    // position of EOF
    const eofPos = editor.document.validatePosition(
        new vscode.Position(Number.MAX_VALUE, Number.MAX_VALUE)
    );

    const allRange = new vscode.Range(new vscode.Position(0, 0), eofPos);

    // replace the whole text
    await editor.edit((editBuilder) => {
        editBuilder.replace(allRange, text);
    });
}

export { replaceWholeContent };
