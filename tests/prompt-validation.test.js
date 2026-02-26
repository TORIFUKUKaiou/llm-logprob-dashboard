const { describe, it } = require('node:test');
const assert = require('node:assert');

const { validatePrompt } = require('../server');

describe('validatePrompt', () => {
  it('rejects empty strings', () => {
    const result = validatePrompt('');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.code, 'VALIDATION_ERROR');
    assert.strictEqual(result.error, 'プロンプトを入力してください');
  });

  it('rejects whitespace-only values', () => {
    const result = validatePrompt(' \n\t ');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.code, 'VALIDATION_ERROR');
  });

  it('rejects non-string values', () => {
    const result = validatePrompt(1234);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.code, 'VALIDATION_ERROR');
  });

  it('accepts non-empty strings', () => {
    const result = validatePrompt('hello');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.value, 'hello');
  });
});
