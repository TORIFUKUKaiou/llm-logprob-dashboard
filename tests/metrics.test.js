const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  calculateStatistics,
  calculateStatisticsFromValues
} = require('../server');

describe('calculateStatisticsFromValues', () => {
  it('computes average logprob and perplexity from raw values', () => {
    const result = calculateStatisticsFromValues([-0.5, -1.5, -2.0, -0.8]);

    assert.deepStrictEqual(result, {
      averageLogprob: -1.2,
      perplexity: 3.32
    });
  });

  it('returns null metrics for empty input', () => {
    const result = calculateStatisticsFromValues([]);

    assert.deepStrictEqual(result, {
      averageLogprob: null,
      perplexity: null
    });
  });

  it('throws when values include non-finite numbers', () => {
    assert.throws(
      () => calculateStatisticsFromValues([-0.1, Number.NaN]),
      /finite numbers/
    );
  });
});

describe('calculateStatistics', () => {
  it('computes metrics from token objects', () => {
    const result = calculateStatistics([
      { token: 'a', logprob: -0.1 },
      { token: 'b', logprob: -0.3 },
      { token: 'c', logprob: -0.2 }
    ]);

    assert.deepStrictEqual(result, {
      averageLogprob: -0.2,
      perplexity: 1.22
    });
  });

  it('returns null metrics for empty token list', () => {
    const result = calculateStatistics([]);

    assert.deepStrictEqual(result, {
      averageLogprob: null,
      perplexity: null
    });
  });
});
