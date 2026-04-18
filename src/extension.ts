import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { LLMService } from './llmService';
import { Indexer } from './indexer';
import { CloneDetector } from './cloneDetector';

export function activate(context: vscode.ExtensionContext) {
    console.log('Code Clone Detector is now active!');

    const config = new ConfigManager();
    const llmService = new LLMService(config);
    const indexer = new Indexer(context, llmService, config);
    const cloneDetector = new CloneDetector(context, indexer, llmService, config);

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('codeCloneDetector')) {
            config.reload();
        }
    }));

    let indexDisposable = vscode.commands.registerCommand('codeCloneDetector.indexWorkspace', async () => {
        await indexer.indexWorkspace();
    });

    let findDisposable = vscode.commands.registerCommand('codeCloneDetector.findClones', async () => {
        await cloneDetector.findClones();
    });

    context.subscriptions.push(indexDisposable, findDisposable);
}

export function deactivate() {}
