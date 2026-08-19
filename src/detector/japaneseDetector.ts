export interface JapaneseIdentifier {
  name: string;
  type: 'function' | 'variable';
  line: number;
  column: number;
}

export class JapaneseDetector {
  // Regex to detect Japanese characters (Hiragana, Katakana, Kanji)
  private japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;

  // Regex to match identifiers (variable/function names)
  private identifierRegex = /(?:function|const|let|var|async\s+function|\w+\s+\w+\s*\()\s*([a-zA-Z_$][a-zA-Z0-9_$]*|[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF_$][a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF$]*)/g;

  isJapanese(text: string): boolean {
    return this.japaneseRegex.test(text);
  }

  detectIdentifiers(code: string): JapaneseIdentifier[] {
    const identifiers: JapaneseIdentifier[] = [];
    const lines = code.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Skip comments and strings
      if (this.isCommentOrString(line)) {
        continue;
      }

      // Detect function declarations
      const functionMatches = [...line.matchAll(/function\s+([a-zA-Z_$][\w$]*|[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF_$][\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF$]*)\s*\(/g)];
      for (const match of functionMatches) {
        if (this.isJapanese(match[1])) {
          identifiers.push({
            name: match[1],
            type: 'function',
            line: lineNum,
            column: match.index || 0,
          });
        }
      }

      // Detect arrow function declarations
      const arrowFuncMatches = [...line.matchAll(/const\s+([a-zA-Z_$][\w$]*|[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF_$][\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF$]*)\s*=\s*(?:async\s*)?\(/g)];
      for (const match of arrowFuncMatches) {
        if (this.isJapanese(match[1])) {
          identifiers.push({
            name: match[1],
            type: 'function',
            line: lineNum,
            column: match.index || 0,
          });
        }
      }

      // Detect variable declarations
      const varMatches = [...line.matchAll(/(?:const|let|var)\s+([a-zA-Z_$][\w$]*|[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF_$][\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF$]*)/g)];
      for (const match of varMatches) {
        if (this.isJapanese(match[1])) {
          identifiers.push({
            name: match[1],
            type: 'variable',
            line: lineNum,
            column: match.index || 0,
          });
        }
      }
    }

    // Remove duplicates
    return Array.from(new Map(identifiers.map(id => [id.name, id])).values());
  }

  private isCommentOrString(line: string): boolean {
    // Simple check - skip lines that are comments
    const trimmed = line.trim();
    return trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('#');
  }
}
