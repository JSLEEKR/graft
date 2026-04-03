"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const node_1 = require("vscode-languageclient/node");
let client;
function activate(context) {
    const serverOptions = {
        command: 'graft-lsp',
    };
    const clientOptions = {
        documentSelector: [{ scheme: 'file', language: 'graft' }],
    };
    client = new node_1.LanguageClient('graft', 'Graft Language Server', serverOptions, clientOptions);
    client.start();
}
function deactivate() {
    return client?.stop();
}
