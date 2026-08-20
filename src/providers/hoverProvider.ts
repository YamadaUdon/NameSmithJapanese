import * as vscode from 'vscode';
import { JapaneseDetector } from '../detector/japaneseDetector';
import { CopilotConverter } from '../converter/copilotConverter';

export class JapaneseHoverProvider implements vscode.HoverProvider {
  private detector = new JapaneseDetector();

  constructor(private converter: CopilotConverter) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    const wordRange = this.getJapaneseIdentifierRange(document, position);
    if (!wordRange) {
      return undefined;
    }

    const identifier = document.getText(wordRange);
    if (!this.detector.isJapanese(identifier)) {
      return undefined;
    }

    const line = document.lineAt(position.line).text;
    const kind = this.detectKind(line, identifier);

    const candidates = await this.converter.convertWithCandidates(identifier, kind);
    if (token.isCancellationRequested || candidates.length === 0) {
      return undefined;
    }

    const recommended = candidates[0];
    const commandArgs = encodeURIComponent(JSON.stringify([identifier, recommended]));

    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.appendMarkdown(`**NameSmith** 推奨: \`${recommended}\`\n\n`);
    markdown.appendMarkdown(
      `[この名前に変換する](command:namesmith.applyHoverConversion?${commandArgs})`
    );

    return new vscode.Hover(markdown, wordRange);
  }

  private getJapaneseIdentifierRange(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Range | undefined {
    return document.getWordRangeAtPosition(
      position,
      /[a-zA-Z_$\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF][a-zA-Z0-9_$\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]*/
    );
  }

  private detectKind(line: string, identifier: string): 'function' | 'variable' {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isFunction = new RegExp(
      `(?:function\\s+${escaped}\\s*\\(|(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?\\(|${escaped}\\s*\\()`
    ).test(line);
    return isFunction ? 'function' : 'variable';
  }
}
