const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { extractLogprobs } = require('../server');

const fixtureResponse = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../fixtures/response.json'), 'utf8')
);

describe('extractLogprobs text parsing', () => {
  it('extracts full generated text from fixture response', () => {
    const result = extractLogprobs(fixtureResponse);

    assert.strictEqual(result.success, true);
    assert.strictEqual(typeof result.text, 'string');
    assert.strictEqual(result.text.length > 0, true);
    assert.match(result.text, /A logprob, or logarithmic probability/);
  });

  it('returns PARSE failure on missing output array', () => {
    const result = extractLogprobs({ id: 'resp_x' });

    assert.strictEqual(result.success, false);
    assert.match(result.error, /missing output array/);
  });

  it('returns PARSE failure when no message is present', () => {
    const result = extractLogprobs({
      output: [{ type: 'reasoning', content: [] }]
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error, /message output is missing/);
  });

  it('returns PARSE failure when output_text is missing', () => {
    const result = extractLogprobs({
      output: [{ type: 'message', content: [{ type: 'foo' }] }]
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error, /no output_text found/);
  });

  it('concatenates multiple output_text parts in order', () => {
    const result = extractLogprobs({
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Hello',
              logprobs: [{ token: 'Hello', logprob: -0.1, top_logprobs: [] }]
            },
            {
              type: 'output_text',
              text: ' world',
              logprobs: [{ token: ' world', logprob: -0.2, top_logprobs: [] }]
            }
          ]
        }
      ]
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.text, 'Hello world');
    assert.strictEqual(result.tokens.length, 2);
    assert.strictEqual(result.tokens[0].token, 'Hello');
    assert.strictEqual(result.tokens[1].token, ' world');
  });
});
