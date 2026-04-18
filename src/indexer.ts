import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';
import { LLMService } from './llmService';
import { ConfigManager } from './config';

export interface FileSummary {
    uri: string;
    summary: string;
}

export class Indexer {
    constructor(
        private context: vscode.ExtensionContext,
        private llmService: LLMService,
        private config: ConfigManager
    ) { }

    public async indexWorkspace() {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open to index.');
            return;
        }

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Indexing Workspace",
            cancellable: true
        }, async (progress, token) => {
            const folder = vscode.workspace.workspaceFolders![0].uri.fsPath;
            const files = this.getFiles(folder);

            const summaries: FileSummary[] = [];

            let i = 0;
            for (const file of files) {
                if (token.isCancellationRequested) break;
                progress.report({ message: `Parsing ${path.basename(file)}...`, increment: (100 / files.length) });

                try {
                    const content = fs.readFileSync(file, 'utf8');
                    // Skip very small or empty files
                    if (content.trim().length < 50) continue;

                    const fileName = path.basename(file);
                    const prompt = `${this.config.indexPrompt}\nContext: The file name is ${fileName}.`;
                    const summary = await this.llmService.generateCompletion(
                        prompt,
                        content
                    );

                    summaries.push({
                        uri: file,
                        summary: summary.trim()
                    });
                } catch (err: any) {
                    console.error(`Failed to index ${file}: ${err.message}`);
                }

                i++;
            }

            // Save to workspace state or file
            await this.context.workspaceState.update('codeCloneSummaries', summaries);
            vscode.window.showInformationMessage(`Indexed ${summaries.length} files successfully.`);
        });
    }

    public getIndexedSummaries(): FileSummary[] {
        return this.context.workspaceState.get<FileSummary[]>('codeCloneSummaries') || [];
    }

    private getFiles(dir: string): string[] {
        let results: string[] = [];
        const ig = ignore().add(['node_modules', '.git', 'dist', 'out', 'build', '*.min.js', '*.map', '_recovery', 'Debug', 'Release']);

        const gitignorePath = path.join(dir, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            ig.add(fs.readFileSync(gitignorePath, 'utf8'));
        }

        const readDir = (currentDir: string) => {
            const list = fs.readdirSync(currentDir);
            for (const file of list) {
                const absolutePath = path.join(currentDir, file);
                const relativePath = path.relative(dir, absolutePath);

                if (ig.ignores(relativePath)) {
                    continue;
                }

                const stat = fs.statSync(absolutePath);
                if (stat && stat.isDirectory()) {
                    readDir(absolutePath);
                } else {
                    if (['.ts', '.js', '.py', '.java', '.c', '.cpp', '.cs', '.pas'].includes(path.extname(file))) {
                        results.push(absolutePath);
                    }
                }
            }
        };

        readDir(dir);
        return results;
    }
}
