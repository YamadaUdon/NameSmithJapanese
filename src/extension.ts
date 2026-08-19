import * as vscode from 'vscode';
import { JapaneseDetector } from './detector/japaneseDetector';
import { CopilotConverter, TokenUsage } from './converter/copilotConverter';
import { NamingGrammarValidator, NamingIssue } from './validator/namingGrammarValidator';

let extensionContext: vscode.ExtensionContext;
let copilotConverter: CopilotConverter;
let grammarValidator: NamingGrammarValidator;
let japaneseDetector: JapaneseDetector;
let diagnosticCollection: vscode.DiagnosticCollection;
let statusBarItem: vscode.StatusBarItem;

// Statistics tracking
let totalTokensUsed = 0;
let currentModel = 'gpt-4';
let issuesFound = 0;
let totalCostUSD = 0;

export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  console.log('NameSmith extension activated');

  // Initialize converters and validators
  copilotConverter = new CopilotConverter();
  grammarValidator = new NamingGrammarValidator();
  japaneseDetector = new JapaneseDetector();
  diagnosticCollection = vscode.languages.createDiagnosticCollection('namesmith');

  // Create status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'namesmith.showStatistics';
  updateStatusBar();
  statusBarItem.show();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('namesmith.convertFile', convertFile),
    vscode.commands.registerCommand('namesmith.convertSelection', convertSelection),
    vscode.commands.registerCommand('namesmith.showSettings', showSettings),
    vscode.commands.registerCommand('namesmith.fixAllIssues', fixAllIssues),
    vscode.commands.registerCommand('namesmith.showStatistics', showStatistics),
    vscode.commands.registerCommand('namesmith.clearCache', () => {
      copilotConverter.clearCache();
      vscode.window.showInformationMessage('NameSmith: キャッシュをクリアしました');
    }),
    vscode.commands.registerCommand('namesmith.resetStatistics', () => {
      totalTokensUsed = 0;
      totalCostUSD = 0;
      issuesFound = 0;
      currentModel = 'gpt-4';
      updateStatusBar();
      vscode.window.showInformationMessage('NameSmith: 統計情報をリセットしました');
    })
  );

  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(diagnosticCollection);

  // Register document listeners
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      validateDocument(event.document);
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        validateDocument(editor.document);
      }
    })
  );

  // Validate current document
  if (vscode.window.activeTextEditor) {
    validateDocument(vscode.window.activeTextEditor.document);
  }
}

function validateDocument(document: vscode.TextDocument): void {
  if (document.languageId !== 'javascript' && document.languageId !== 'typescript') {
    return;
  }

  const diagnostics: vscode.Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  // Regex to find identifiers
  const identifierRegex = /(?:const|let|var|function|async\s+function|class|interface)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    let match;

    // Reset regex
    identifierRegex.lastIndex = 0;

    while ((match = identifierRegex.exec(line)) !== null) {
      const identifier = match[1];
      const isJapanese = japaneseDetector.isJapanese(identifier);

      if (!isJapanese) {
        // Determine if it's a function
        const isFunctionDeclaration = line.includes('function') || line.includes('class');

        // Validate grammar
        const issue = grammarValidator.validate(identifier, isFunctionDeclaration);

        if (issue) {
          const startPos = match.index! + (match[0].length - identifier.length);
          const endPos = startPos + identifier.length;

          const range = new vscode.Range(
            new vscode.Position(lineNum, startPos),
            new vscode.Position(lineNum, endPos)
          );

          const diagnostic = new vscode.Diagnostic(
            range,
            issue.explanation,
            getSeverity(issue.severity)
          );

          diagnostic.code = issue.rule;
          diagnostic.source = 'NameSmith Grammar';
          diagnostic.relatedInformation = [
            new vscode.DiagnosticRelatedInformation(
              new vscode.Location(document.uri, range),
              `修正案: ${issue.suggestion}`
            )
          ];

          diagnostics.push(diagnostic);
          issuesFound++;
        }
      }
    }
  }

  diagnosticCollection.set(document.uri, diagnostics);
  updateStatusBar();
}

async function convertFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('エディターが開いていません');
    return;
  }

  const document = editor.document;
  const japaneseIdentifiers = japaneseDetector.detectIdentifiers(document.getText());

  if (japaneseIdentifiers.length === 0) {
    vscode.window.showInformationMessage('日本語の識別子が見つかりません');
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'NameSmith: 識別子を変換中...',
      cancellable: true,
    },
    async (progress, token) => {
      try {
        const edits: vscode.TextEdit[] = [];

        for (let i = 0; i < japaneseIdentifiers.length; i++) {
          if (token.isCancellationRequested) break;

          const identifier = japaneseIdentifiers[i];
          progress.report({
            increment: (100 / japaneseIdentifiers.length),
            message: `変換中: ${identifier.name}`,
          });

          const englishName = await copilotConverter.convert(identifier.name);
          if (englishName && englishName !== identifier.name) {
            const fullText = document.getText();
            let index = 0;
            while ((index = fullText.indexOf(identifier.name, index)) !== -1) {
              const position = document.positionAt(index);
              const range = new vscode.Range(
                position,
                position.translate(0, identifier.name.length)
              );
              edits.push(vscode.TextEdit.replace(range, englishName));
              index += identifier.name.length;
            }
          }
        }

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(document.uri, edits);
        await vscode.workspace.applyEdit(workspaceEdit);

        vscode.window.showInformationMessage(
          `✅ ${edits.length}個の識別子を英語に変換しました`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`変換エラー: ${error}`);
        console.error(error);
      }
    }
  );
}

async function convertSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('エディターが開いていません');
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText.trim()) {
    vscode.window.showErrorMessage('テキストを選択してください');
    return;
  }

  if (!japaneseDetector.isJapanese(selectedText)) {
    vscode.window.showErrorMessage('選択テキストに日本語が含まれていません');
    return;
  }

  try {
    const englishName = await copilotConverter.convert(selectedText.trim());
    if (englishName) {
      editor.edit((editBuilder) => {
        editBuilder.replace(selection, englishName);
      });
      vscode.window.showInformationMessage(`✅ 変換完了: "${englishName}"`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`変換エラー: ${error}`);
    console.error(error);
  }
}

function showSettings(): void {
  vscode.commands.executeCommand('workbench.action.openSettings', '@ext:YamadaUdon.namesmithjapanese');
}

async function fixAllIssues() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('エディターが開いていません');
    return;
  }

  const diagnostics = diagnosticCollection.get(editor.document.uri);
  if (!diagnostics || diagnostics.length === 0) {
    vscode.window.showInformationMessage('修正する問題がありません');
    return;
  }

  let fixedCount = 0;
  await editor.edit((editBuilder) => {
    for (const diagnostic of diagnostics) {
      if (diagnostic.relatedInformation && diagnostic.relatedInformation.length > 0) {
        const message = diagnostic.relatedInformation[0].message;
        const suggestion = message.replace('修正案: ', '');
        editBuilder.replace(diagnostic.range, suggestion);
        fixedCount++;
      }
    }
  });

  vscode.window.showInformationMessage(`✅ ${fixedCount}個の問題を修正しました`);
}

function showStatistics(): void {
  const costInYen = (totalCostUSD * 150).toFixed(2);
  const stats =
    `📊 NameSmith 統計情報\n\n` +
    `モデル: ${currentModel}\n` +
    `使用トークン: ${totalTokensUsed}\n` +
    `推定コスト: $${totalCostUSD.toFixed(6)} (¥${costInYen})\n` +
    `検出された問題: ${issuesFound}`;

  vscode.window.showInformationMessage(stats);
}

function updateStatusBar(): void {
  const costInYen = (totalCostUSD * 150).toFixed(2);

  statusBarItem.text =
    `$(zap) NameSmith: ${totalTokensUsed} tokens (${currentModel}) | ¥${costInYen} | ${issuesFound} issues`;

  statusBarItem.tooltip =
    `NameSmith - 日本語コード識別子を英語に変換\n\n` +
    `モデル: ${currentModel}\n` +
    `使用トークン: ${totalTokensUsed}\n` +
    `推定コスト: $${totalCostUSD.toFixed(6)} (¥${costInYen})\n` +
    `検出された問題: ${issuesFound}\n\n` +
    `クリックして詳細を表示`;
}

function getSeverity(severity: string): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

export function deactivate() {
  console.log('NameSmith extension deactivated');
  diagnosticCollection.dispose();
  statusBarItem.dispose();
  if (copilotConverter) {
    copilotConverter.dispose();
  }
}
