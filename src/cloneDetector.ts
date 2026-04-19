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
            
            progress.report({ message: 'Analyzing target snippet...' });

            // Generate a summary for the snippet to match against index cache
            const snippetFileName = path.basename(editor.document.fileName);
            const snippetPrompt = `${this.config.indexPrompt}\nContext: The snippet is from a file named ${snippetFileName}.`;
            let snippetSummary: string;
            try {
                snippetSummary = await this.llmService.generateCompletion(
                    snippetPrompt,
                    text
                );
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to connect to LLM: ${err.message}`);
                return;
            }

            progress.report({ message: 'Searching local cache...' });

            const candidatesPrompt = `Given the query code summary: "${snippetSummary}", which of these file summaries might contain clones? Return a strict comma-separated list of array indices.\nSummaries:\n${filteredSummaries.map((s, idx) => `[${idx}] ${s.summary}`).join('\n')}`;

            let candidatesResponse: string;
            try {
                candidatesResponse = await this.llmService.generateCompletion(
                    "You are a filtering system. Return only a comma-separated list of indices matching the query.",
                    candidatesPrompt
                );
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to connect to LLM: ${err.message}`);
                return;
            }

            let candidateIndices: number[] = [];
            try {
                const matches = candidatesResponse.match(/\d+/g);
                if (matches) {
                    candidateIndices = matches.map(Number).filter(n => n >= 0 && n < filteredSummaries.length);
                }
            } catch (e) {
                candidateIndices = filteredSummaries.map((_, i) => i);
            }

            if (candidateIndices.length === 0) {
                candidateIndices = filteredSummaries.map((_, i) => i);
            }

            this.outputChannel.show(true);
            this.outputChannel.clear();
            this.outputChannel.appendLine(`Searching clones for snippet summary: ${snippetSummary}`);
            this.outputChannel.appendLine(`Top candidates: ${candidateIndices.length}`);

            for (const idx of candidateIndices) {
                if (token.isCancellationRequested) break;

                const candidate = filteredSummaries[idx];
                progress.report({ message: `Checking ${vscode.workspace.asRelativePath(candidate.uri)}...` });

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
