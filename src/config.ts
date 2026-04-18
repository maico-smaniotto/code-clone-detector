import * as vscode from 'vscode';

export class ConfigManager {
    public llmProvider: string = 'ollama';
    public apiKey: string = '';
    public modelName: string = 'llama3';
    public ollamaEndpoint: string = 'http://127.0.0.1:11434';
    public indexPrompt: string = '';
    public detectPrompt: string = '';

    constructor() {
        this.reload();
    }

    public reload() {
        const config = vscode.workspace.getConfiguration('codeCloneDetector');
        this.llmProvider = config.get<string>('llmProvider') || 'ollama';
        this.apiKey = config.get<string>('apiKey') || '';
        this.modelName = config.get<string>('modelName') || 'llama3';
        this.ollamaEndpoint = config.get<string>('ollamaEndpoint') || 'http://127.0.0.1:11434';
        this.indexPrompt = config.get<string>('indexPrompt') || '';
        this.detectPrompt = config.get<string>('detectPrompt') || '';
    }
}
