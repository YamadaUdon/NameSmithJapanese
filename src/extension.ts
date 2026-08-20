import * as vscode from 'vscode';
import { JapaneseDetector } from './detector/japaneseDetector';
import { CopilotConverter } from './converter/copilotConverter';
import { NamingGrammarValidator } from './validator/namingGrammarValidator';
import { JapaneseHoverProvider } from './providers/hoverProvider';

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
  console.log('NameSmith extension activated');

  // Initialize converters and validators
  copilotConverter = new CopilotConverter();
  grammarValidator = new NamingGrammarValidator();
  japaneseDetector = new JapaneseDetector();
  diagnosticCollection = vscode.languages.createDiagnosticCollection('namesmith');
  currentModel = vscode.workspace.getConfiguration('namesmith').get<string>('model', '') || 'auto';

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
    }),
    vscode.commands.registerCommand('namesmith.applyHoverConversion', applyHoverConversion),
    vscode.commands.registerCommand('namesmith.selectModel', selectModel)
  );

  // Register hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ['javascript', 'typescript'],
      new JapaneseHoverProvider(copilotConverter)
    )
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

  const config = vscode.workspace.getConfiguration('namesmith');
  if (!config.get<boolean>('enabled', true) || !config.get<boolean>('autoDetect', true)) {
    diagnosticCollection.delete(document.uri);
    return;
  }

  const diagnostics: vscode.Diagnostic[] = [];
  const text = document.getText();
  const lines = text.split('\n');

  for (const identifier of japaneseDetector.detectIdentifiers(text)) {
    const line = document.lineAt(identifier.line);
    const startChar = line.text.indexOf(identifier.name);
    if (startChar === -1) {
      continue;
    }

    const range = new vscode.Range(
      new vscode.Position(identifier.line, startChar),
      new vscode.Position(identifier.line, startChar + identifier.name.length)
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      `日本語の識別子です。英語への変換を検討してください: "${identifier.name}"`,
      vscode.DiagnosticSeverity.Information
    );
    diagnostic.code = 'namesmith.japanese-identifier';
    diagnostic.source = 'NameSmith';
    diagnostics.push(diagnostic);
  }

  // Regex to find identifiers
  const identifierRegex = /(?:const|let|var|function|async\s+function|class|interface)\s+([a-zA-Z_$\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF][a-zA-Z0-9_$\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]*)/g;

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
    // 日本語がない場合は英語の命名文法チェックを実行
    validateDocument(document);
    const grammarIssues = (diagnosticCollection.get(document.uri) ?? [])
      .filter(d => d.source === 'NameSmith Grammar');
    if (grammarIssues.length === 0) {
      vscode.window.showInformationMessage('日本語の識別子・命名の問題は見つかりません');
    } else {
      const answer = await vscode.window.showInformationMessage(
        `日本語の識別子はありませんが、英語の命名に${grammarIssues.length}件の問題があります。修正しますか？`,
        '修正する'
      );
      if (answer === '修正する') {
        await fixAllIssues();
      }
    }
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'NameSmith: 変換候補を生成中...',
      cancellable: true,
    },
    async (progress, token) => {
      try {
        // まず全識別子の候補を生成
        const candidatesMap = new Map<string, string[]>();
        for (let i = 0; i < japaneseIdentifiers.length; i++) {
          if (token.isCancellationRequested) return;

          const identifier = japaneseIdentifiers[i];
          progress.report({
            increment: (100 / japaneseIdentifiers.length),
            message: `候補生成中: ${identifier.name}`,
          });

          const candidates = await copilotConverter.convertWithCandidates(identifier.name, identifier.type);
          if (candidates.length > 0) {
            candidatesMap.set(identifier.name, candidates);
          }
        }

        // 識別子ごとに候補を選択
        const edits: vscode.TextEdit[] = [];
        for (const identifier of japaneseIdentifiers) {
          const candidates = candidatesMap.get(identifier.name);
          if (!candidates) continue;

          const englishName = await pickCandidate(identifier.name, identifier.type, candidates);
          if (!englishName || englishName === identifier.name) continue;

          const fullText = document.getText();
          let index = fullText.indexOf(identifier.name);
          while (index !== -1) {
            const position = document.positionAt(index);
            const range = new vscode.Range(
              position,
              position.translate(0, identifier.name.length)
            );
            edits.push(vscode.TextEdit.replace(range, englishName));
            index = fullText.indexOf(identifier.name, index + identifier.name.length);
          }
        }

        if (edits.length === 0) {
          vscode.window.showInformationMessage('変換は行われませんでした');
          return;
        }

        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(document.uri, edits);
        await vscode.workspace.applyEdit(workspaceEdit);

        vscode.window.showInformationMessage(
          `✅ ${edits.length}ヶ所を英語に変換しました`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`変換エラー: ${error}`);
        console.error(error);
      }
    }
  );
}

/**
 * 変換候補をQuickPickで表示し、選択された候補を返す（スキップ時はundefined）
 */
async function pickCandidate(
  originalName: string,
  kind: 'function' | 'variable',
  candidates: string[]
): Promise<string | undefined> {
  const kindLabel = kind === 'function' ? '関数' : '変数';
  const items: vscode.QuickPickItem[] = candidates.map((c, i) => ({
    label: c,
    description: i === 0 ? '推奨' : undefined,
  }));
  items.push({ label: '$(close) スキップ', description: 'この識別子は変換しない', alwaysShow: true });

  const picked = await vscode.window.showQuickPick(items, {
    title: `NameSmith: 変換候補の選択`,
    placeHolder: `${kindLabel} "${originalName}" の変換先を選択してください`,
  });

  if (!picked || picked.label.includes('スキップ')) {
    return undefined;
  }
  return picked.label;
}

/**
 * ホバーのリンクから呼ばれ、ドキュメント内の識別子を一括置換する
 */
async function applyHoverConversion(original: string, replacement: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !original || !replacement) {
    return;
  }

  const document = editor.document;
  const fullText = document.getText();
  const edits: vscode.TextEdit[] = [];
  let index = fullText.indexOf(original);
  while (index !== -1) {
    const position = document.positionAt(index);
    edits.push(vscode.TextEdit.replace(
      new vscode.Range(position, position.translate(0, original.length)),
      replacement
    ));
    index = fullText.indexOf(original, index + original.length);
  }

  if (edits.length === 0) {
    return;
  }

  const workspaceEdit = new vscode.WorkspaceEdit();
  workspaceEdit.set(document.uri, edits);
  await vscode.workspace.applyEdit(workspaceEdit);
  vscode.window.showInformationMessage(`✅ "${original}" を "${replacement}" に変換しました（${edits.length}ヶ所）`);
}

/**
 * 利用可能なCopilotモデルをQuickPickで選択して設定に保存する
 */
async function selectModel(): Promise<void> {
  const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
  if (!models || models.length === 0) {
    vscode.window.showWarningMessage('利用可能なCopilotモデルが見つかりません。GitHub Copilotにサインインしているか確認してください。');
    return;
  }

  const config = vscode.workspace.getConfiguration('namesmith');
  const current = config.get<string>('model', '');

  const items: (vscode.QuickPickItem & { value: string })[] = [
    {
      label: '$(sparkle) 自動（既定）',
      description: current === '' ? '現在の設定' : undefined,
      detail: '利用可能な最初のモデルを使用',
      value: '',
    },
    ...models.map(m => ({
      label: m.name,
      description: [m.family, current === m.family ? '現在の設定' : undefined].filter(Boolean).join(' — '),
      detail: `vendor: ${m.vendor} / id: ${m.id} / max input tokens: ${m.maxInputTokens}`,
      value: m.family,
    })),
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: 'NameSmith: AIモデルの選択',
    placeHolder: '変換に使用するモデルを選択してください',
  });
  if (!picked || picked.value === current) {
    return;
  }

  await config.update('model', picked.value, vscode.ConfigurationTarget.Global);

  // モデルが変わったので既存の変換結果は破棄
  copilotConverter.clearCache();
  currentModel = picked.value === '' ? models[0].family : picked.value;
  updateStatusBar();
  vscode.window.showInformationMessage(`NameSmith: モデルを「${picked.label.replace('$(sparkle) ', '')}」に変更しました`);
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

  const trimmedText = selectedText.trim();

  if (!japaneseDetector.isJapanese(trimmedText)) {
    const line = editor.document.lineAt(selection.start.line).text;
    const escapedName = trimmedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isFunction = new RegExp(
      `(?:function\\s+${escapedName}\\s*\\(|(?:const|let|var)\\s+${escapedName}\\s*=\\s*(?:async\\s*)?\\()`
    ).test(line);
    const issue = grammarValidator.validate(trimmedText, isFunction);

    if (!issue) {
      vscode.window.showInformationMessage('選択された識別子に修正が必要な文法上の問題はありません');
      return;
    }

    await editor.edit((editBuilder) => {
      editBuilder.replace(selection, issue.suggestion);
    });
    vscode.window.showInformationMessage(`✅ 命名を修正しました: "${issue.suggestion}"`);
    return;
  }

  try {
    const line = editor.document.lineAt(selection.start.line).text;
    const escapedName = trimmedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isFunction = new RegExp(
      `(?:function\\s+${escapedName}\\s*\\(|(?:const|let|var)\\s+${escapedName}\\s*=\\s*(?:async\\s*)?\\()`
    ).test(line);
    const kind = isFunction ? 'function' as const : 'variable' as const;
    const candidates = await copilotConverter.convertWithCandidates(trimmedText, kind);
    if (candidates.length === 0) {
      vscode.window.showWarningMessage('変換候補を生成できませんでした');
      return;
    }

    const englishName = await pickCandidate(trimmedText, kind, candidates);
    if (englishName) {
      await editor.edit((editBuilder) => {
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
