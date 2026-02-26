const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { extractLogprobs } = require('../server');

const fixtureResponse = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../fixtures/response.json'), 'utf8')
);

describe('extractLogprobs token parsing', () => {
  it('extracts token array with index, token, logprob, topLogprobs', () => {
    const result = extractLogprobs(fixtureResponse);

    assert.strictEqual(result.success, true);
    assert.ok(Array.isArray(result.tokens));
    assert.strictEqual(result.tokens.length > 0, true);

    const first = result.tokens[0];
    assert.strictEqual(typeof first.index, 'number');
    assert.strictEqual(typeof first.token, 'string');
    assert.strictEqual(typeof first.logprob, 'number');
    assert.ok(Array.isArray(first.topLogprobs));
  });

  it('preserves token order and index sequence', () => {
    const result = extractLogprobs(fixtureResponse);
    assert.strictEqual(result.success, true);

    assert.strictEqual(result.tokens[0].token, 'A');
    assert.strictEqual(result.tokens[1].token, ' log');
    assert.strictEqual(result.tokens[2].token, 'prob');

    result.tokens.forEach((token, index) => {
      assert.strictEqual(token.index, index);
    });
  });

  it('rounds token logprob values to 4 decimals', () => {
    const result = extractLogprobs(fixtureResponse);
    assert.strictEqual(result.success, true);

    const value = result.tokens[0].logprob;
    assert.strictEqual(value, -0.0041);
  });

  it('normalizes top_logprobs into topLogprobs', () => {
    const result = extractLogprobs({
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'A',
              logprobs: [
                {
                  token: 'A',
                  logprob: -0.11119,
                  top_logprobs: [
                    { token: 'A', logprob: -0.11119 },
                    { token: 'B', logprob: -1.23456 },
                    { token: 42, logprob: -2.0 }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.tokens[0].topLogprobs, [
      { token: 'A', logprob: -0.1112 },
      { token: 'B', logprob: -1.2346 }
    ]);
  });

  it('returns parse failure when logprobs are missing', () => {
    const result = extractLogprobs({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'hello' }]
        }
      ]
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error, /Logprobs not available/);
  });
});
