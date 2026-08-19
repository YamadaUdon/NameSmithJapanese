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

  async convert(japaneseIdentifier: string): Promise<string> {
    // Check cache first
    if (this.cache.has(japaneseIdentifier)) {
      this.statusBarItem.text = '$(check) NameSmith: Cache hit';
      this.statusBarItem.show();
      return this.cache.get(japaneseIdentifier)!;
    }

    try {
      // Use GitHub Copilot Chat API to convert
      const prompt = this.buildPrompt(japaneseIdentifier);
      const result = await this.callCopilotAPI(prompt);

      if (result.text) {
        this.cache.set(japaneseIdentifier, result.text);

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

    return japaneseIdentifier;
  }

  private buildPrompt(japaneseIdentifier: string): string {
    return `Convert the following Japanese identifier to a proper English programming identifier using verb+noun format (e.g., "getUserData", "calculateTotal", "fetchProducts"). Return ONLY the English identifier, nothing else.

Japanese identifier: ${japaneseIdentifier}

English identifier:`;
  }

  private async callCopilotAPI(prompt: string): Promise<CopilotResponse> {
    try {
      // Use the Language Models API available in VS Code 1.93.0+
      const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });

      if (!models || models.length === 0) {
        console.warn('No Copilot models found. Using fallback conversion.');
        return { text: '' };
      }

      const model = models[0];
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
        text: this.validateAndCleanEnglishIdentifier(text),
        usage: usage
      };
    } catch (error) {
      console.error('Copilot API call failed:', error);
      return { text: '' };
    }
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
    // Remove any extra characters, keep only valid identifier characters
    let cleaned = text
      .split('\n')[0] // Take first line only
      .trim()
      .replace(/[^a-zA-Z0-9_$]/g, ''); // Remove invalid characters

    // Ensure it doesn't start with a number
    if (/^\d/.test(cleaned)) {
      cleaned = '_' + cleaned;
    }

    // Ensure it doesn't start with $
    if (cleaned.startsWith('$')) {
      cleaned = cleaned.substring(1);
    }

    // Return camelCase format
    return this.toCamelCase(cleaned);
  }

  private toCamelCase(str: string): string {
    if (!str) {
      return str;
    }

    return str
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase()) // Convert snake_case to camelCase
      .replace(/^(.)/, (_, char) => char.toLowerCase()); // Lowercase first character
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
  }

  getStatusBarItem(): vscode.StatusBarItem {
    return this.statusBarItem;
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
