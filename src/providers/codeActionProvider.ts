import * as vscode from 'vscode';
import { JapaneseDetector } from '../detector/japaneseDetector';
import { CopilotConverter } from '../converter/copilotConverter';

export class CodeActionProvider implements vscode.CodeActionProvider {
	private detector = new JapaneseDetector();

	constructor(private converter: CopilotConverter) {}

	async provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext
	): Promise<vscode.CodeAction[]> {
		const actions: vscode.CodeAction[] = [];

		// Check if there's Japanese text in the current range or nearby
		const line = document.lineAt(range.start.line).text;
		const selectedText = document.getText(range);

		if (this.detector.isJapanese(selectedText) || this.detector.isJapanese(line)) {
			// Find Japanese identifier in the line
			const japaneseIdMatch = this.findJapaneseIdentifierAt(line, range.start.character);

			if (japaneseIdMatch) {
				const action = new vscode.CodeAction(
					`Convert "${japaneseIdMatch}" to English`,
					vscode.CodeActionKind.QuickFix
				);
				action.command = {
					title: 'Convert to English',
					command: 'namesmith.convertSelection',
				};
				actions.push(action);
			}
		}

		return actions;
	}

	private findJapaneseIdentifierAt(line: string, column: number): string | null {
		const identifierRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF_$][a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF$]*/g;
		let match;

		while ((match = identifierRegex.exec(line)) !== null) {
			const start = match.index;
			const end = start + match[0].length;

			if (start <= column && column <= end) {
				return match[0];
			}
		}

		return null;
	}
}
