import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { LLMService } from './llmService';
import { CloneDetector } from './cloneDetector';
import { CloneResultsProvider, CloneResultItem } from './cloneResultsProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Code Clone Detector is now active!');

    const config = new ConfigManager();
    const llmService = new LLMService(config);
    const resultsProvider = new CloneResultsProvider();
    const cloneDetector = new CloneDetector(context, llmService, config, resultsProvider);

    vscode.window.registerTreeDataProvider('codeCloneDetector.resultsView', resultsProvider);

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('codeCloneDetector')) {
            config.reload();
        }
    }));



    let findDisposable = vscode.commands.registerCommand('codeCloneDetector.findClones', async () => {
        await cloneDetector.findClones();
    });

    let openCloneDisposable = vscode.commands.registerCommand('codeCloneDetector.openClone', async (item: CloneResultItem) => {
        if (!item || !item.filePath) {
            vscode.window.showErrorMessage("Invalid clone item or missing file path.");
            return;
        }
        
        try {
            const uri = vscode.Uri.file(item.filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc);
            
            let start = item.startLine - 1;
            let end = item.endLine - 1;
            
            if (Number.isNaN(start) || start < 0) start = 0;
            if (Number.isNaN(end) || end < start) end = start;

            const startPos = new vscode.Position(start, 0);
            const endPos = new vscode.Position(end, 0);
            editor.selection = new vscode.Selection(startPos, endPos);
            editor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenter);
        } catch (e: any) {
            vscode.window.showErrorMessage("Failed to open clone: " + e.message);
        }
    });

    context.subscriptions.push(findDisposable, openCloneDisposable);
}

export function deactivate() {}
