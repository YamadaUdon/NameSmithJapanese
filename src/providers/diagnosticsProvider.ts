import * as vscode from 'vscode';
import { JapaneseIdentifier } from '../detector/japaneseDetector';

export class DiagnosticsProvider {
	private diagnosticsCollection: vscode.DiagnosticCollection;

	constructor() {
		this.diagnosticsCollection = vscode.languages.createDiagnosticCollection('namesmith');
	}

	updateDiagnostics(document: vscode.TextDocument, identifiers: JapaneseIdentifier[]): void {
		const diagnostics: vscode.Diagnostic[] = [];

		for (const identifier of identifiers) {
			const line = document.lineAt(identifier.line);
			const startChar = line.text.indexOf(identifier.name);

			if (startChar !== -1) {
				const range = new vscode.Range(
					new vscode.Position(identifier.line, startChar),
					new vscode.Position(identifier.line, startChar + identifier.name.length)
				);

				const diagnostic = new vscode.Diagnostic(
					range,
					`Japanese identifier detected: "${identifier.name}". Consider converting to English.`,
					vscode.DiagnosticSeverity.Information
				);
				diagnostic.source = 'NameSmith';
				diagnostic.code = 'namesmith.japanese-identifier';
				diagnostics.push(diagnostic);
			}
		}

		this.diagnosticsCollection.set(document.uri, diagnostics);
	}

	clearDiagnostics(document: vscode.TextDocument): void {
		this.diagnosticsCollection.delete(document.uri);
	}

	dispose(): void {
		this.diagnosticsCollection.dispose();
	}
}
