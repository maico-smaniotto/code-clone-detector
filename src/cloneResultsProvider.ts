import * as vscode from 'vscode';
import * as path from 'path';

export class CloneResultItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly filePath: string,
        public readonly method: string,
        public readonly startLine: number,
        public readonly endLine: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.filePath}\nLines: ${this.startLine}-${this.endLine}`;
        this.description = method;
        this.command = {
            command: 'codeCloneDetector.openClone',
            title: 'Open Clone',
            arguments: [this]
        };
        this.iconPath = new vscode.ThemeIcon('file-code');
    }
}

export class CloneResultsProvider implements vscode.TreeDataProvider<CloneResultItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CloneResultItem | undefined | void> = new vscode.EventEmitter<CloneResultItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<CloneResultItem | undefined | void> = this._onDidChangeTreeData.event;

    private clones: CloneResultItem[] = [];

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    clear(): void {
        this.clones = [];
        this.refresh();
    }

    addClone(filePath: string, method: string, startLine: number, endLine: number): void {
        const fileName = path.basename(filePath);
        const item = new CloneResultItem(
            fileName,
            filePath,
            method,
            startLine,
            endLine,
            vscode.TreeItemCollapsibleState.None
        );
        this.clones.push(item);
        this.refresh();
    }

    getTreeItem(element: CloneResultItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CloneResultItem): Thenable<CloneResultItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            return Promise.resolve(this.clones);
        }
    }
}
