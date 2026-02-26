const { describe, it } = require('node:test');
const assert = require('node:assert');

const { calculateStatisticsFromValues, roundTo } = require('../server');

describe('precision control', () => {
  it('roundTo keeps 4-digit precision for token logprobs', () => {
    assert.strictEqual(roundTo(-0.123456, 4), -0.1235);
    assert.strictEqual(roundTo(-0.00006, 4), -0.0001);
  });

  it('roundTo keeps 2-digit precision for perplexity values', () => {
    assert.strictEqual(roundTo(2.718281828, 2), 2.72);
    assert.strictEqual(roundTo(1.224, 2), 1.22);
  });

  it('computes metrics and rounds outputs to required precision', () => {
    const result = calculateStatisticsFromValues([
      -0.123456789,
      -0.987654321,
      -0.456789123
    ]);

    assert.deepStrictEqual(result, {
      averageLogprob: -0.5226,
      perplexity: 1.69
    });
  });
});
