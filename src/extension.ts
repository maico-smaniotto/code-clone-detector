import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { LLMService } from './llmService';
import { Indexer } from './indexer';
import { CloneDetector } from './cloneDetector';
import { CloneResultsProvider, CloneResultItem } from './cloneResultsProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Code Clone Detector is now active!');

    const config = new ConfigManager();
    const llmService = new LLMService(config);
    const indexer = new Indexer(context, llmService, config);
    const resultsProvider = new CloneResultsProvider();
    const cloneDetector = new CloneDetector(context, indexer, llmService, config, resultsProvider);

    vscode.window.registerTreeDataProvider('codeCloneDetector.resultsView', resultsProvider);

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

    let openCloneDisposable = vscode.commands.registerCommand('codeCloneDetector.openClone', async (item: CloneResultItem) => {
        if (!item || !item.filePath) return;
        
        const doc = await vscode.workspace.openTextDocument(item.filePath);
        const editor = await vscode.window.showTextDocument(doc);
        
        const startPos = new vscode.Position(Math.max(0, item.startLine - 1), 0);
        const endPos = new vscode.Position(Math.max(0, item.endLine - 1), 0);
        editor.selection = new vscode.Selection(startPos, endPos);
        editor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenter);
    });

    context.subscriptions.push(indexDisposable, findDisposable, openCloneDisposable);
}

export function deactivate() {}
