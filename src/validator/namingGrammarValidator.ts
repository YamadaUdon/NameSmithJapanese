import * as vscode from 'vscode';

export interface NamingIssue {
  name: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  suggestion: string;
  explanation: string;
}

export class NamingGrammarValidator {
  private commonVerbs = [
    'get', 'set', 'fetch', 'create', 'update', 'delete', 'remove',
    'add', 'insert', 'find', 'search', 'filter', 'map', 'reduce',
    'process', 'handle', 'execute', 'run', 'start', 'stop', 'init',
    'load', 'save', 'send', 'receive', 'check', 'validate', 'parse',
    'format', 'transform', 'convert', 'generate', 'render', 'display',
    'show', 'hide', 'open', 'close', 'calculate', 'compute', 'merge',
    'join', 'split', 'sort', 'order', 'clear', 'reset', 'enable',
    'disable', 'toggle', 'activate', 'deactivate', 'invoke', 'call',
    'register', 'unregister', 'subscribe', 'unsubscribe', 'watch',
    'observe', 'emit', 'dispatch', 'publish', 'notify', 'trigger',
    'upload', 'download', 'export', 'import', 'backup', 'restore',
    'extract', 'compress', 'decompress', 'encrypt', 'decrypt'
  ];

  private commonNouns = [
    'data', 'user', 'product', 'service', 'item', 'list', 'array',
    'object', 'value', 'result', 'response', 'request', 'error',
    'message', 'event', 'state', 'config', 'settings', 'options',
    'params', 'args', 'props', 'attrs', 'name', 'id', 'key', 'index',
    'count', 'total', 'amount', 'price', 'quantity', 'size', 'width',
    'height', 'time', 'date', 'timestamp', 'url', 'path', 'file',
    'content', 'text', 'string', 'number', 'boolean', 'status',
    'email', 'password', 'token', 'permission', 'role', 'type',
    'category', 'tag', 'description', 'title', 'address', 'phone',
    'profile', 'account', 'session', 'cookie', 'cache', 'buffer',
    'queue', 'stack', 'tree', 'graph', 'node', 'edge', 'vertex'
  ];

  private booleanPrefixes = ['is', 'has', 'can', 'should', 'must', 'will', 'do'];

  /**
   * Rule 1: 基本的な語順チェック（修飾語 → 対象）
   */
  private checkBasicWordOrder(name: string, isFunction: boolean): NamingIssue | null {
    const words = this.extractWords(name);
    if (words.length < 2) return null;

    // Skip if it starts with a verb (for functions)
    if (isFunction && this.isVerb(words[0])) return null;

    // Check if first word is noun and second is also a noun with likely wrong order
    const firstIsNoun = this.isNoun(words[0]);
    const secondIsNoun = this.isNoun(words[1]);

    if (firstIsNoun && secondIsNoun) {
      // Check if it looks like reversed order
      // e.g., "nameUser" should be "userName"
      const reversed = this.reverseWordOrder(words);
      if (reversed !== name) {
        return {
          name: name,
          rule: 'Rule 1: 基本的な語順',
          severity: 'error',
          suggestion: reversed,
          explanation: `命名は「修飾語 → 対象」の順序にしてください。例: "${reversed}" (${words.slice(1).join('')}の${words[0]}, ではなく ${words[0]}の${words.slice(1).join('')})`
        };
      }
    }

    return null;
  }

  /**
   * Rule 2: 名詞の組み合わせ（大きな分類 → 具体的内容）
   */
  private checkNounCombination(name: string): NamingIssue | null {
    const words = this.extractWords(name);
    if (words.length < 2) return null;

    // Common patterns to check
    const patterns = [
      { wrong: ['address', 'user'], right: ['user', 'address'], example: 'userAddress' },
      { wrong: ['profile', 'user'], right: ['user', 'profile'], example: 'userProfile' },
      { wrong: ['history', 'payment', 'user'], right: ['user', 'payment', 'history'], example: 'userPaymentHistory' },
      { wrong: ['status', 'account'], right: ['account', 'status'], example: 'accountStatus' },
      { wrong: ['settings', 'user'], right: ['user', 'settings'], example: 'userSettings' },
    ];

    for (const pattern of patterns) {
      if (this.matchesWordPattern(words, pattern.wrong)) {
        return {
          name: name,
          rule: 'Rule 2: 名詞の組み合わせ',
          severity: 'error',
          suggestion: pattern.example,
          explanation: `複数の名詞を組み合わせる場合は「より大きな分類 → 具体的な内容」の順にしてください。例: ${pattern.example}`
        };
      }
    }

    return null;
  }

  /**
   * Rule 3: 属性・状態を表す場合（対象 → 属性・状態）
   */
  private checkAttributeOrder(name: string): NamingIssue | null {
    const words = this.extractWords(name);
    if (words.length < 2) return null;

    const attributeWords = ['status', 'type', 'state', 'name', 'value', 'size', 'count', 'color', 'level', 'mode'];

    // Check if attribute word comes first (wrong order)
    if (attributeWords.includes(words[0])) {
      // Likely reversed order
      const corrected = [...words.slice(1), words[0]].join('');
      return {
        name: name,
        rule: 'Rule 3: 属性・状態の順序',
        severity: 'warning',
        suggestion: this.toCamelCase(corrected),
        explanation: `属性・状態は「対象 → 属性」の順にしてください。例: ${this.toCamelCase(corrected)}`
      };
    }

    return null;
  }

  /**
   * Rule 4: Boolean値（状態・条件 → 対象）
   */
  private checkBooleanNaming(name: string): NamingIssue | null {
    const lowerName = name.toLowerCase();
    const words = this.extractWords(name);

    // Check if it's a Boolean but doesn't have prefix
    if (!this.startsWithBooleanPrefix(name)) {
      // Check if it looks like a boolean value (contains yes/no, active/inactive, etc)
      const booleanIndicators = ['active', 'deleted', 'valid', 'visible', 'enabled', 'checked', 'selected', 'locked', 'pending', 'available'];

      if (booleanIndicators.some(indicator => lowerName.includes(indicator))) {
        const suggested = 'is' + name.charAt(0).toUpperCase() + name.slice(1);
        return {
          name: name,
          rule: 'Rule 4: Boolean値の命名',
          severity: 'warning',
          suggestion: suggested,
          explanation: `Boolean値は状態を表す接頭語（is, has, can, should など）を付けてください。例: ${suggested}`
        };
      }
    }

    // Check for negative form (Rule 7)
    if (lowerName.startsWith('isNot') || lowerName.startsWith('isNo') || lowerName.includes('Not')) {
      const corrected = this.convertNegativeToPosisitive(name);
      if (corrected !== name) {
        return {
          name: name,
          rule: 'Rule 7: 否定形を避ける',
          severity: 'warning',
          suggestion: corrected,
          explanation: `可能な限り肯定形で意味を表現してください。例: ${corrected} (${name}ではなく)`
        };
      }
    }

    return null;
  }

  /**
   * Rule 5: 関数名の基本ルール（不自然な語順のみ検出）
   */
  validateFunctionName(name: string): NamingIssue | null {
    const words = this.extractWords(name);
    if (words.length < 2) return null;

    // 一般的な命名規則として、語順が不自然な「名詞 + 動詞」のみを検出する
    // 例: userGet -> getUser
    if (this.isNoun(words[0]) && this.isVerb(words[1])) {
      const corrected = [words[1], words[0], ...words.slice(2)].join('');
      return {
        name: name,
        rule: 'Rule 5: 関数名の基本ルール',
        severity: 'warning',
        suggestion: this.toCamelCase(corrected),
        explanation: `語順が不自然です。一般的には「動作 → 対象」の順が読みやすくなります。例: ${this.toCamelCase(corrected)}`
      };
    }

    return null;
  }

  /**
   * Rule 6: 条件・検索条件を含む場合（動詞 → 対象 → 条件）
   */
  private checkConditionalFormat(name: string): NamingIssue | null {
    const words = this.extractWords(name);
    if (words.length < 3) return null;

    // Check for patterns like "findByIdUser" (wrong) vs "findUserById" (correct)
    const byKeywordIndex = words.findIndex(w => w.toLowerCase() === 'by');
    if (byKeywordIndex > 0 && byKeywordIndex < words.length - 1) {
      // Check if there's a noun after "by" that should come before
      const nounBeforeBy = words.slice(0, byKeywordIndex).find(w => this.isNoun(w));
      const nounAfterBy = words.slice(byKeywordIndex + 1).find(w => this.isNoun(w));

      if (nounBeforeBy && nounAfterBy && byKeywordIndex > 1) {
        // Wrong order detected
        const verb = words[0];
        const mainNoun = nounAfterBy;
        const condition = words.slice(byKeywordIndex).join('');
        const corrected = `${verb}${mainNoun}${condition}`;

        return {
          name: name,
          rule: 'Rule 6: 条件付き検索',
          severity: 'warning',
          suggestion: this.toCamelCase(corrected),
          explanation: `検索条件を含む場合は「動詞 → 対象 → 条件」の順にしてください。例: ${this.toCamelCase(corrected)}`
        };
      }
    }

    return null;
  }

  /**
   * Validate any identifier name
   */
  validate(name: string, isFunction: boolean = false): NamingIssue | null {
    // Run all validation rules
    const checks = [
      this.checkBasicWordOrder(name, isFunction),
      this.checkNounCombination(name),
      this.checkAttributeOrder(name),
      this.checkBooleanNaming(name),
      this.checkConditionalFormat(name),
    ];

    // For functions, also check function-specific rules
    if (isFunction) {
      checks.push(this.validateFunctionName(name));
    }

    // Return first issue found (prioritize by severity)
    const errors = checks.filter(c => c && c.severity === 'error');
    if (errors.length > 0) return errors[0]!;

    const warnings = checks.filter(c => c && c.severity === 'warning');
    if (warnings.length > 0) return warnings[0]!;

    const infos = checks.filter(c => c && c.severity === 'info');
    if (infos.length > 0) return infos[0]!;

    return null;
  }

  // ============== Helper Methods ==============

  private isVerb(word: string): boolean {
    return this.commonVerbs.includes(word.toLowerCase());
  }

  private isNoun(word: string): boolean {
    return this.commonNouns.includes(word.toLowerCase());
  }

  private startsWithBooleanPrefix(name: string): boolean {
    return this.booleanPrefixes.some(prefix => name.toLowerCase().startsWith(prefix));
  }

  private extractWords(name: string): string[] {
    // Extract words from camelCase, snake_case, kebab-case
    const words = name
      .replace(/([A-Z])/g, ' $1') // Add space before uppercase
      .replace(/[_-]/g, ' ') // Replace underscores and hyphens with space
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map(w => w.toLowerCase());
    return words;
  }

  private reverseWordOrder(words: string[]): string {
    if (words.length < 2) return words.join('');
    return this.toCamelCase([...words.slice(1), words[0]].join(''));
  }

  private matchesWordPattern(words: string[], pattern: string[]): boolean {
    if (words.length !== pattern.length) return false;
    return words.every((w, i) => w === pattern[i].toLowerCase());
  }

  private convertNegativeToPosisitive(name: string): string {
    let corrected = name;

    // Convert "isNot" to "is"
    corrected = corrected.replace(/isNot([A-Z])/g, (_, char) => 'is' + char);
    corrected = corrected.replace(/is[Nn]ot/g, 'is');

    // Convert "notValid" to "isValid"
    corrected = corrected.replace(/^not([A-Z])/i, (_, char) => 'is' + char);

    // Convert "hasNo" to "lacks" or "doesNotHave" to similar positive
    corrected = corrected.replace(/hasNo([A-Z])/g, (_, char) => 'lacks' + char);
    corrected = corrected.replace(/has[Nn]o/g, 'lacks');

    return this.toCamelCase(corrected);
  }

  private suggestVerbForFunction(name: string): string {
    // Try to find a good verb for this identifier
    const commonPrefixes = ['get', 'fetch', 'load', 'create', 'make', 'build'];
    return commonPrefixes[0] + name.charAt(0).toUpperCase() + name.slice(1);
  }

  private toCamelCase(str: string): string {
    if (!str) return str;

    const words = str
      .split(/[\s_-]+/)
      .filter(w => w.length > 0)
      .map(w => w.toLowerCase());

    if (words.length === 0) return str;

    return (
      words[0].toLowerCase() +
      words.slice(1).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')
    );
  }
}
