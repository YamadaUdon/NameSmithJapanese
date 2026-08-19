# NameSmith Japanese

日本語の関数名や変数名を、GitHub Copilot Chat の言語モデルを使って英語のコード識別子へ変換する VS Code 拡張機能です。

## 主な機能

- 日本語を含む識別子を検出し、英語の識別子への変換を提案
- ファイル全体の識別子をまとめて変換
- 選択した識別子だけを変換
- 英語の関数名・変数名を命名規則に沿って検査
- 変換結果をセッション中にキャッシュして再利用
- 変換に使用したトークン数と推定コストをステータスバーに表示

## 必要環境

- VS Code 1.93 以上
- GitHub Copilot Chat 拡張機能
- GitHub Copilot を利用できるアカウント

本拡張機能は VS Code Language Model API と GitHub Copilot のモデルを使用します。Copilot Chat がインストールされ、サインイン済みである必要があります。

## インストール

Marketplace で公開後は、VS Code の拡張機能ビューで `NameSmith Japanese` を検索してインストールできます。

VSIX ファイルからインストールする場合は、コマンドパレットで `Extensions: Install from VSIX...` を実行し、`.vsix` ファイルを選択してください。

## 使い方

### ファイル全体を変換

1. 対象ファイルを VS Code で開きます。
2. コマンドパレット（`Ctrl+Shift+P` / `Cmd+Shift+P`）を開きます。
3. `NameSmith: Convert file identifiers to English` を実行します。

検出された日本語の識別子が GitHub Copilot に送信され、変換結果で置き換えられます。

### 選択範囲を変換

日本語の識別子を選択し、次のショートカットを実行します。

- Windows / Linux: `Ctrl+Shift+Alt+J`
- macOS: `Cmd+Shift+Alt+J`

または、コマンドパレットから `NameSmith: Convert selected identifier to English` を実行します。

### 設定を開く

コマンドパレットから `NameSmith: Settings` を実行します。設定画面で次の項目を変更できます。

| 設定 | 型 | 初期値 | 説明 |
| --- | --- | --- | --- |
| `namesmith.enabled` | boolean | `true` | NameSmith の機能を有効にする |
| `namesmith.autoDetect` | boolean | `true` | 日本語の識別子を自動検出する |
| `namesmith.targetIdentifiers` | enum | `functions_and_variables` | 変換対象を関数と変数、関数のみ、変数のみに限定する |

### 変換例

変換前:

```typescript
const ユーザーデータを取得 = () => {
  const 名前 = "太郎";
  const 年齢 = 25;
  return { 名前, 年齢 };
};
```

変換後の例:

```typescript
const getUserData = () => {
  const name = "太郎";
  const age = 25;
  return { name, age };
};
```

## 対応言語

現在、自動診断の対象は JavaScript と TypeScript です。ファイル変換・選択変換では、VS Code のアクティブなエディターを対象にします。

## 既知の制限事項

- 変換には GitHub Copilot Chat とインターネット接続が必要です。
- GitHub Copilot のモデルや利用可能な API は、契約状況や VS Code のバージョンによって異なる場合があります。
- コメント内の日本語は識別子として変換しません。
- AI による変換結果は必ず確認してから利用してください。特に公開コードや重要な処理では、変換前後の差分を確認してください。
- 推定コストは概算値です。実際の請求額を示すものではありません。

## トラブルシューティング

### Copilot のモデルが見つからない

1. GitHub Copilot Chat がインストールされていることを確認します。
2. GitHub アカウントにサインインしていることを確認します。
3. VS Code を再読み込みします。
4. Copilot の利用可能なモデルと契約状況を確認します。

### 変換候補が表示されない

- `namesmith.enabled` と `namesmith.autoDetect` が有効か確認します。
- 対象ファイルが JavaScript または TypeScript か確認します。
- コマンドパレットから手動変換を実行します。
- VS Code の「出力」パネルと開発者ツールでエラーを確認します。

## 開発者向け情報

### セットアップ

```bash
git clone https://github.com/YamadaUdon/NameSmithJapanese.git
cd NameSmithJapanese
npm install
npm run compile
```

### 開発モード

```bash
npm run watch
```

VS Code で `F5` を押すと Extension Development Host を起動できます。

### ビルド・パッケージ化

```bash
npm run vscode:prepublish
npx vsce package
```

`@vscode/vsce` 3.x は Node.js 20 以上が必要です。Node.js 18 を使っている場合は、Node.js 20 を一時利用して実行できます。

```bash
npx -y -p node@20 -p @vscode/vsce -c "vsce package"
```

### テスト・静的解析

```bash
npm run compile
npm run lint
```

## ライセンス

MIT License。詳細は [LICENSE](LICENSE) を参照してください。

## 問い合わせ

不具合の報告や改善提案は [GitHub Issues](https://github.com/YamadaUdon/NameSmithJapanese/issues) へお願いします。
