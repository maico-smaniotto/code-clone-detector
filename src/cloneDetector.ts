import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LLMService } from './llmService';
import { ConfigManager } from './config';
import { Indexer } from './indexer';
import { CloneResultsProvider } from './cloneResultsProvider';

export class CloneDetector {
    private outputChannel: vscode.OutputChannel;

    constructor(
        private context: vscode.ExtensionContext,
        private indexer: Indexer,
        private llmService: LLMService,
        private config: ConfigManager,
        private resultsProvider: CloneResultsProvider
    ) {
        this.outputChannel = vscode.window.createOutputChannel('Code Clone Detector');
    }

    public async findClones() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active text editor');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text || text.trim().length === 0) {
            vscode.window.showErrorMessage('Please select a code snippet first.');
            return;
        }

        const summaries = this.indexer.getIndexedSummaries();
        if (summaries.length === 0) {
            vscode.window.showWarningMessage('Workspace index is empty. Please run Index Workspace first.');
            return;
        }

        const quickPickItems: vscode.QuickPickItem[] = summaries.map(s => ({
            label: vscode.workspace.asRelativePath(s.uri),
            picked: true
        }));

        const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
            canPickMany: true,
            placeHolder: 'Select files to include in clone search (check/uncheck all by clicking the checkbox above)',
            ignoreFocusOut: true
        });

        if (!selectedItems || selectedItems.length === 0) {
            return;
        }

        const selectedUris = new Set(selectedItems.map(item => item.label));
        const filteredSummaries = summaries.filter(s => selectedUris.has(vscode.workspace.asRelativePath(s.uri)));

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Detecting Code Clones",
            cancellable: true
        }, async (progress, token) => {
            this.resultsProvider.clear();
            vscode.commands.executeCommand('codeCloneDetector.resultsView.focus');
            this.outputChannel.show(true);
            this.outputChannel.clear();
            this.outputChannel.appendLine(`Searching clones for snippet in ${filteredSummaries.length} files...`);

            for (let idx = 0; idx < filteredSummaries.length; idx++) {
                if (token.isCancellationRequested) break;

                const candidate = filteredSummaries[idx];
                progress.report({ message: `Checking ${vscode.workspace.asRelativePath(candidate.uri)} (${idx + 1}/${filteredSummaries.length})...`, increment: (100 / filteredSummaries.length) });

                const candidateSource = fs.readFileSync(candidate.uri, 'utf8');

                const candidateLines = candidateSource.split('\n').map((line, index) => `${index + 1}: ${line}`).join('\n');

                const candidateFileName = path.basename(candidate.uri);
                const searchPrompt = `${this.config.detectPrompt}\nContext: The target file is named ${candidateFileName}.\n\nQuery Snippet:\n${text}\n\nTarget File: ${candidate.uri}`;
                try {
                    const result = await this.llmService.generateCompletion(searchPrompt, candidateLines);

                    if (!result.toLowerCase().includes('none') && result.trim() !== '') {
                        this.outputChannel.appendLine('\n--- Clone Found! ---');
                        this.outputChannel.appendLine(`File: ${candidate.uri}`);
                        this.outputChannel.appendLine(result.trim());
                        
                        // Parse result: File: <filename>, Method: <methodname>, Lines: <start>-<end>
                        const match = result.match(/File:\s*(.*?),\s*Method:\s*(.*?),\s*Lines:\s*(\d+)-(\d+)/i);
                        if (match) {
                            const method = match[2];
                            const startLine = parseInt(match[3], 10);
                            const endLine = parseInt(match[4], 10);
                            this.resultsProvider.addClone(candidate.uri, method, startLine, endLine);
                        }
                    }
                } catch (e: any) {
                    this.outputChannel.appendLine(`\nError checking ${candidate.uri}: ${e.message}`);
                    vscode.window.showErrorMessage(`Failed to connect to LLM: ${e.message}`);
                    break;
                }
            }

            this.outputChannel.appendLine('\n--- Detection Complete ---');
        });
    }
}
