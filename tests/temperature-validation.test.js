const { describe, it } = require('node:test');
const assert = require('node:assert');

const { DEFAULT_TEMPERATURE, validateTemperature } = require('../server');

describe('validateTemperature', () => {
  it('uses the default when omitted', () => {
    const result = validateTemperature(undefined);
    assert.deepStrictEqual(result, {
      valid: true,
      value: DEFAULT_TEMPERATURE
    });
  });

  it('accepts boundary values', () => {
    assert.strictEqual(validateTemperature(0).valid, true);
    assert.strictEqual(validateTemperature(2).valid, true);
  });

  it('accepts numeric strings', () => {
    const result = validateTemperature('1.25');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.value, 1.25);
  });

  it('rejects malformed string values', () => {
    const result = validateTemperature('1.2abc');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.code, 'VALIDATION_ERROR');
  });

  it('rejects empty strings', () => {
    const result = validateTemperature('   ');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.code, 'VALIDATION_ERROR');
  });

  it('rejects out-of-range values', () => {
    assert.strictEqual(validateTemperature(-0.1).valid, false);
    assert.strictEqual(validateTemperature(2.1).valid, false);
  });
});
