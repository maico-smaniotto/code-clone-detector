import * as vscode from 'vscode';
import * as fs from 'fs';
import { LLMService } from './llmService';
import { ConfigManager } from './config';
import { Indexer } from './indexer';

export class CloneDetector {
    private outputChannel: vscode.OutputChannel;

    constructor(
        private context: vscode.ExtensionContext,
        private indexer: Indexer,
        private llmService: LLMService,
        private config: ConfigManager
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

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Detecting Code Clones",
            cancellable: true
        }, async (progress, token) => {
            progress.report({ message: 'Analyzing target snippet...' });
            
            // Generate a summary for the snippet to match against index cache
            const snippetSummary = await this.llmService.generateCompletion(
                this.config.indexPrompt,
                text
            );

            progress.report({ message: 'Searching local cache...' });
            const summaries = this.indexer.getIndexedSummaries();
            if (summaries.length === 0) {
                vscode.window.showWarningMessage('Workspace index is empty. Please run Index Workspace first.');
                return;
            }

            const candidatesPrompt = `Given the query code summary: "${snippetSummary}", which of these file summaries might contain clones? Return a strict comma-separated list of array indices.\nSummaries:\n${summaries.map((s, idx) => `[${idx}] ${s.summary}`).join('\n')}`;
            
            const candidatesResponse = await this.llmService.generateCompletion(
                "You are a filtering system. Return only a comma-separated list of indices matching the query.",
                candidatesPrompt
            );

            let candidateIndices: number[] = [];
            try {
                const matches = candidatesResponse.match(/\d+/g);
                if (matches) {
                    candidateIndices = matches.map(Number).filter(n => n >= 0 && n < summaries.length);
                }
            } catch (e) {
                candidateIndices = summaries.map((_, i) => i);
            }

            if (candidateIndices.length === 0) {
                 candidateIndices = summaries.map((_, i) => i);
            }

            this.outputChannel.show(true);
            this.outputChannel.clear();
            this.outputChannel.appendLine(`Searching clones for snippet summary: ${snippetSummary}`);
            this.outputChannel.appendLine(`Top candidates: ${candidateIndices.length}`);
            
            for (const idx of candidateIndices) {
                if (token.isCancellationRequested) break;
                
                const candidate = summaries[idx];
                progress.report({ message: `Checking ${vscode.workspace.asRelativePath(candidate.uri)}...` });

                const candidateSource = fs.readFileSync(candidate.uri, 'utf8');
                
                const searchPrompt = `${this.config.detectPrompt}\n\nQuery Snippet:\n${text}\n\nTarget File: ${candidate.uri}`;
                try {
                    const result = await this.llmService.generateCompletion(searchPrompt, candidateSource);
                    
                    if (!result.toLowerCase().includes('none') && result.trim() !== '') {
                        this.outputChannel.appendLine('\n--- Clone Found! ---');
                        this.outputChannel.appendLine(`File: ${candidate.uri}`);
                        this.outputChannel.appendLine(result.trim());
                    }
                } catch (e) {
                     this.outputChannel.appendLine(`\nError checking ${candidate.uri}`);
                }
            }
            
            this.outputChannel.appendLine('\n--- Detection Complete ---');
        });
    }
}
