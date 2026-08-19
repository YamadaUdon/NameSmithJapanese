import * as vscode from 'vscode';

export interface ConversionResult {
	original: string;
	converted: string;
	isValid: boolean;
	suggestion?: string;
	issue?: string;
}

export class GrammarValidator {
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
		'observe', 'emit', 'dispatch', 'publish', 'notify', 'trigger'
	];

	private commonNouns = [
		'data', 'user', 'product', 'service', 'item', 'list', 'array',
		'object', 'value', 'result', 'response', 'request', 'error',
		'message', 'event', 'state', 'config', 'settings', 'options',
		'params', 'args', 'props', 'attrs', 'name', 'id', 'key', 'index',
		'count', 'total', 'amount', 'price', 'quantity', 'size', 'width',
		'height', 'time', 'date', 'timestamp', 'url', 'path', 'file',
		'content', 'text', 'string', 'number', 'boolean', 'status'
	];

	validateFunctionName(name: string): ConversionResult {
		const lowerName = name.toLowerCase();
		const words = this.extractWords(lowerName);

		if (words.length === 0) {
			return {
				original: name,
				converted: name,
				isValid: false,
				issue: 'Function name is too short or invalid'
			};
		}

		// Check if it starts with a verb
		const startsWithVerb = this.isVerb(words[0]);

		if (!startsWithVerb) {
			// Try to add a common verb
			const suggestion = this.suggestVerbForFunction(lowerName);
			return {
				original: name,
				converted: suggestion,
				isValid: false,
				issue: `Function should start with a verb (not "${words[0]}")`,
				suggestion: suggestion
			};
		}

		// Check for noun+verb order (wrong order)
		if (words.length > 1) {
			const firstIsNoun = this.isNoun(words[0]);
			if (firstIsNoun && this.isVerb(words[1])) {
				// Likely noun+verb order, suggest switching
				const corrected = [words[1], ...words.slice(0, 1), ...words.slice(2)].join('');
				return {
					original: name,
					converted: this.toCamelCase(corrected),
					isValid: false,
					issue: 'Wrong word order: should be verb+noun, not noun+verb',
					suggestion: this.toCamelCase(corrected)
				};
			}
		}

		return {
			original: name,
			converted: this.toCamelCase(lowerName),
			isValid: true
		};
	}

	validateVariableName(name: string): ConversionResult {
		const lowerName = name.toLowerCase();
		const words = this.extractWords(lowerName);

		if (words.length === 0) {
			return {
				original: name,
				converted: name,
				isValid: false,
				issue: 'Variable name is too short or invalid'
			};
		}

		// Variables should be nouns or noun phrases
		// Check if it looks like a function name (verb at start)
		const startsWithVerb = this.isVerb(words[0]);
		if (startsWithVerb && words.length > 1) {
			return {
				original: name,
				converted: this.toCamelCase(lowerName),
				isValid: false,
				issue: 'Variable name looks like a function (starts with verb). Use noun instead.',
				suggestion: words.slice(1).join('') // Remove verb
			};
		}

		// Check for single character variables (a, x, i except for loop counters)
		if (name.length === 1 && name !== 'i' && name !== 'j' && name !== 'k') {
			return {
				original: name,
				converted: name,
				isValid: false,
				issue: 'Variable name is too vague (single character)'
			};
		}

		return {
			original: name,
			converted: this.toCamelCase(lowerName),
			isValid: true
		};
	}

	private isVerb(word: string): boolean {
		return this.commonVerbs.includes(word.toLowerCase());
	}

	private isNoun(word: string): boolean {
		return this.commonNouns.includes(word.toLowerCase());
	}

	private suggestVerbForFunction(name: string): string {
		// Default to 'get' if no clear verb
		return 'get' + this.toCamelCase(name);
	}

	private extractWords(name: string): string[] {
		// Handle camelCase, snake_case, kebab-case
		const camelCaseWords = name.match(/[a-z]+/gi) || [];
		return camelCaseWords.map(w => w.toLowerCase());
	}

	private toCamelCase(str: string): string {
		if (!str) return str;

		const words = this.extractWords(str);
		if (words.length === 0) return str;

		return (
			words[0].toLowerCase() +
			words.slice(1).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('')
		);
	}

	getDiagnosticMessage(result: ConversionResult): string {
		if (result.isValid) {
			return `✓ Valid naming: "${result.converted}"`;
		}

		let message = `❌ ${result.issue}`;
		if (result.suggestion) {
			message += `\nSuggested: "${result.suggestion}"`;
		}
		return message;
	}
}
