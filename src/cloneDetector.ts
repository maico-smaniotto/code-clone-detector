import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LLMService } from './llmService';
import { ConfigManager } from './config';
import { CloneResultsProvider } from './cloneResultsProvider';

export class CloneDetector {
    private outputChannel: vscode.OutputChannel;

    constructor(
        private context: vscode.ExtensionContext,
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

        const files = await vscode.workspace.findFiles('**/*.{ts,js,py,java,c,cpp,cs,pas}');
        if (files.length === 0) {
            vscode.window.showWarningMessage('No source files found in the workspace.');
            return;
        }

        const quickPickItems: vscode.QuickPickItem[] = files.map(uri => ({
            label: vscode.workspace.asRelativePath(uri),
            description: uri.fsPath,
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

        const selectedUris = selectedItems.map(item => vscode.Uri.file(item.description!));

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Detecting Code Clones",
            cancellable: true
        }, async (progress, token) => {
            const startTime = Date.now();
            this.resultsProvider.clear();
            vscode.commands.executeCommand('codeCloneDetector.resultsView.focus');
            this.outputChannel.show(true);
            this.outputChannel.clear();
            this.outputChannel.appendLine(`Searching clones for snippet in ${selectedUris.length} files...`);

            for (let idx = 0; idx < selectedUris.length; idx++) {
                if (token.isCancellationRequested) break;

                const candidateUri = selectedUris[idx];
                const candidateFileName = path.basename(candidateUri.fsPath);
                progress.report({ message: `Checking ${candidateFileName} (${idx + 1}/${selectedUris.length})...`, increment: (100 / selectedUris.length) });

                const candidateSource = fs.readFileSync(candidateUri.fsPath, 'utf8');

                const candidateLines = candidateSource.split('\n').map((line, index) => `${index + 1}: ${line}`).join('\n');

                const searchPrompt = `${this.config.detectPrompt}\nContext: The target file is named ${candidateFileName}.\n\nQuery Snippet:\n${text}\n\nTarget File: ${candidateUri.fsPath}`;
                try {
                    const result = await this.llmService.generateCompletion(searchPrompt, candidateLines);

                    if (!result.toLowerCase().includes('none') && result.trim() !== '') {
                        this.outputChannel.appendLine('\n--- Clone Found! ---');
                        this.outputChannel.appendLine(`File: ${candidateUri.fsPath}`);
                        this.outputChannel.appendLine(result.trim());

                        // Parse result: File: <filename>, Method: <methodname>, Lines: <start>-<end>
                        const regex = /File:\s*(.*?),\s*Method:\s*(.*?),\s*Lines:\s*(\d+)-(\d+)/gi;
                        let match;
                        while ((match = regex.exec(result)) !== null) {
                            const method = match[2];
                            const startLine = parseInt(match[3], 10);
                            const endLine = parseInt(match[4], 10);
                            this.resultsProvider.addClone(candidateUri.fsPath, method, startLine, endLine);
                        }
                    }
                } catch (e: any) {
                    this.outputChannel.appendLine(`\nError checking ${candidateUri.fsPath}: ${e.message}`);
                    vscode.window.showErrorMessage(`Failed to connect to LLM: ${e.message}`);
                    break;
                }
            }

            const endTime = Date.now();
            const durationSec = ((endTime - startTime) / 1000).toFixed(2);
            this.outputChannel.appendLine(`\n--- Analysis Completed in ${durationSec}s ---`);
            vscode.window.showInformationMessage(`Clone analysis completed in ${durationSec}s.`);
        });
    }
}
