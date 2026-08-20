import * as vscode from 'vscode';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number; // in USD
}

export interface CopilotResponse {
  text: string;
  usage?: TokenUsage;
}

export class CopilotConverter {
  private cache: Map<string, string> = new Map();
  private candidatesCache: Map<string, string[]> = new Map();
  private statusBarItem: vscode.StatusBarItem;

  // Token pricing (as of 2024)
  // Source: https://openai.com/pricing
  private readonly PRICING = {
    inputPerMTok: 0.005,    // $0.005 per 1M input tokens
    outputPerMTok: 0.015,   // $0.015 per 1M output tokens
  };

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'namesmith.showTokenStats';
    this.updateStatusBar();
  }

  async convert(japaneseIdentifier: string, kind: 'function' | 'variable' = 'variable'): Promise<string> {
    // Check cache first
    const cacheKey = `${kind}:${japaneseIdentifier}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      this.statusBarItem.text = '$(check) NameSmith: Cache hit';
      this.statusBarItem.show();
      return cached;
    }

    try {
      // Use GitHub Copilot Chat API to convert
      const prompt = this.buildPrompt(japaneseIdentifier, kind);
      const result = await this.callCopilotAPI(prompt);

      if (result.text) {
        this.cache.set(cacheKey, result.text);

        // Update status bar with token usage
        if (result.usage) {
          this.displayTokenUsage(japaneseIdentifier, result.usage);
        }

        return result.text;
      }

      return this.fallbackConversion(japaneseIdentifier);
    } catch (error) {
      console.error('Copilot conversion error:', error);
      this.statusBarItem.text = '$(error) NameSmith: Error';
      this.statusBarItem.show();

      // Fallback to basic transliteration
      return this.fallbackConversion(japaneseIdentifier);
    }
  }

  /**
   * 変換候補を複数（最大3件）返す。失敗時はフォールバック変換1件を返す。
   */
  async convertWithCandidates(japaneseIdentifier: string, kind: 'function' | 'variable' = 'variable'): Promise<string[]> {
    const cacheKey = `${kind}:${japaneseIdentifier}`;
    const cached = this.candidatesCache.get(cacheKey);
    if (cached !== undefined) {
      this.statusBarItem.text = '$(check) NameSmith: Cache hit';
      this.statusBarItem.show();
      return cached;
    }

    try {
      const prompt = this.buildCandidatesPrompt(japaneseIdentifier, kind);
      const result = await this.callCopilotAPIRaw(prompt);

      if (result.text) {
        const candidates = [...new Set(
          result.text
            .split('\n')
            .map(line => this.validateAndCleanEnglishIdentifier(line))
            .filter(c => c.length > 0)
        )].slice(0, 3);

        if (candidates.length > 0) {
          this.candidatesCache.set(cacheKey, candidates);
          this.cache.set(cacheKey, candidates[0]);
          if (result.usage) {
            this.displayTokenUsage(japaneseIdentifier, result.usage);
          }
          return candidates;
        }
      }

      return [this.fallbackConversion(japaneseIdentifier)];
    } catch (error) {
      console.error('Copilot conversion error:', error);
      this.statusBarItem.text = '$(error) NameSmith: Error';
      this.statusBarItem.show();
      return [this.fallbackConversion(japaneseIdentifier)];
    }
  }

  private buildCandidatesPrompt(japaneseIdentifier: string, kind: 'function' | 'variable'): string {
    if (kind === 'function') {
      return `Convert the following Japanese function name to English camelCase identifiers in verb+noun order (e.g., "getUserData", "calculateTotal"). Return exactly 3 candidates, one per line, best first. Return ONLY the identifiers, nothing else.

Japanese function name: ${japaneseIdentifier}

Candidates:`;
    }

    return `Convert the following Japanese variable name to English camelCase identifiers as noun phrases WITHOUT a leading verb (e.g., "userName", "totalPrice"). Return exactly 3 candidates, one per line, best first. Return ONLY the identifiers, nothing else.

Japanese variable name: ${japaneseIdentifier}

Candidates:`;
  }

  private buildPrompt(japaneseIdentifier: string, kind: 'function' | 'variable'): string {
    if (kind === 'function') {
      return `Convert the following Japanese function name to an English camelCase identifier in verb+noun order (e.g., "getUserData", "calculateTotal", "fetchProducts"). Return ONLY the identifier, nothing else.

Japanese function name: ${japaneseIdentifier}

English identifier:`;
    }

    return `Convert the following Japanese variable name to an English camelCase identifier as a noun phrase WITHOUT a leading verb (e.g., "userName", "totalPrice", "productList"). Return ONLY the identifier, nothing else.

Japanese variable name: ${japaneseIdentifier}

English identifier:`;
  }

  private async callCopilotAPI(prompt: string): Promise<CopilotResponse> {
    const raw = await this.callCopilotAPIRaw(prompt);
    return {
      text: this.validateAndCleanEnglishIdentifier(raw.text),
      usage: raw.usage
    };
  }

  private async callCopilotAPIRaw(prompt: string): Promise<CopilotResponse> {
    try {
      const model = await this.selectModel();

      if (!model) {
        console.warn('No Copilot models found. Using fallback conversion.');
        return { text: '' };
      }

      const messages = [
        new vscode.LanguageModelChatMessage(
          vscode.LanguageModelChatMessageRole.User,
          prompt
        ),
      ];

      const chatResponse = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

      // Extract text from response
      let text = '';
      for await (const fragment of chatResponse.text) {
        text += fragment;
      }

      // Estimate token usage (rough calculation)
      const usage = this.estimateTokenUsage(prompt, text);

      return {
        text,
        usage: usage
      };
    } catch (error) {
      console.error('Copilot API call failed:', error);
      return { text: '' };
    }
  }

  /**
   * 設定 namesmith.model（family または id）に一致するモデルを優先し、なければ先頭を使う
   */
  private async selectModel(): Promise<vscode.LanguageModelChat | undefined> {
    const preferred = vscode.workspace.getConfiguration('namesmith').get<string>('model', '');
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    if (!models || models.length === 0) {
      return undefined;
    }

    if (preferred) {
      const matched = models.find(m => m.family === preferred || m.id === preferred);
      if (matched) {
        return matched;
      }
      console.warn(`NameSmith: model "${preferred}" not found. Falling back to ${models[0].family}.`);
    }

    return models[0];
  }

  private estimateTokenUsage(prompt: string, response: string): TokenUsage {
    // Rough estimation: ~4 characters per token
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(response.length / 4);
    const totalTokens = inputTokens + outputTokens;

    const inputCost = (inputTokens / 1_000_000) * this.PRICING.inputPerMTok;
    const outputCost = (outputTokens / 1_000_000) * this.PRICING.outputPerMTok;
    const totalCost = inputCost + outputCost;

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost: totalCost
    };
  }

  private displayTokenUsage(identifier: string, usage: TokenUsage): void {
    const costInYen = (usage.estimatedCost * 150).toFixed(2); // Rough JPY conversion

    this.statusBarItem.text =
      `$(zap) NameSmith: ${usage.totalTokens} tokens | ¥${costInYen}`;
    this.statusBarItem.tooltip =
      `Last conversion: "${identifier}"\n` +
      `Input: ${usage.inputTokens} tokens\n` +
      `Output: ${usage.outputTokens} tokens\n` +
      `Total: ${usage.totalTokens} tokens\n` +
      `Cost: $${usage.estimatedCost.toFixed(6)} (¥${costInYen})`;
    this.statusBarItem.show();
  }

  private updateStatusBar(): void {
    this.statusBarItem.text = '$(zap) NameSmith: Ready';
    this.statusBarItem.tooltip = 'Click to view token statistics';
    this.statusBarItem.show();
  }

  private validateAndCleanEnglishIdentifier(text: string): string {
    // Take first non-empty line, strip list markers/labels/quotes/backticks
    let cleaned = (text.split('\n').find(l => l.trim().length > 0) ?? '')
      .trim()
      .replace(/^(?:\d+[.)]|[-*•])\s*/, '')
      .replace(/^(?:english identifier|candidates?)\s*:\s*/i, '')
      .replace(/^[`"'\s]+|[`"'\s.:;]+$/g, '');

    // Join space/hyphen/underscore separated words into camelCase, preserving inner caps
    const parts = cleaned.split(/[\s\-_]+/).filter(p => p.length > 0);
    cleaned = parts
      .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
      .join('')
      .replace(/[^a-zA-Z0-9_$]/g, ''); // Remove remaining invalid characters

    // Ensure it doesn't start with a number
    if (/^\d/.test(cleaned)) {
      cleaned = '_' + cleaned;
    }

    // Ensure it doesn't start with $
    while (cleaned.startsWith('$')) {
      cleaned = cleaned.substring(1);
    }

    // Lowercase first character (camelCase)
    if (cleaned) {
      cleaned = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
    }

    return cleaned;
  }

  private fallbackConversion(japaneseIdentifier: string): string {
    // Simple fallback: transliterate Japanese to romaji pattern
    const romanization: { [key: string]: string } = {
      'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
      'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
      'さ': 'sa', 'し': 'si', 'す': 'su', 'せ': 'se', 'そ': 'so',
      'た': 'ta', 'ち': 'ti', 'つ': 'tu', 'て': 'te', 'と': 'to',
      'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
      'は': 'ha', 'ひ': 'hi', 'ふ': 'hu', 'へ': 'he', 'ほ': 'ho',
      'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
      'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
      'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
      'わ': 'wa', 'ゐ': 'wi', 'ゑ': 'we', 'を': 'wo', 'ん': 'n',
    };

    let result = '';
    for (const char of japaneseIdentifier) {
      result += romanization[char] || char;
    }

    return result || japaneseIdentifier;
  }

  clearCache(): void {
    this.cache.clear();
    this.candidatesCache.clear();
  }

  getStatusBarItem(): vscode.StatusBarItem {
    return this.statusBarItem;
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
