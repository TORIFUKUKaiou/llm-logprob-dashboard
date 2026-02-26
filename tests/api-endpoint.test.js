const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { createGenerateHandler } = require('../server');

const fixtureResponse = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../fixtures/response.json'), 'utf8')
);

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

describe('POST /api/generate handler', () => {
  it('returns parsed response with numeric temperature and meta', async () => {
    const handler = createGenerateHandler({
      apiKey: 'test-key',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => fixtureResponse
      })
    });
    const res = createMockResponse();

    await handler({ body: { prompt: 'hello', temperature: 0 } }, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.meta.temperature, 0);
    assert.strictEqual(res.body.meta.model, 'gpt-4o-mini');
    assert.strictEqual(res.body.meta.maxOutputTokens, 220);
    assert.deepStrictEqual(Object.keys(res.body.meta.logprobCoverage), [
      'coveredChars',
      'totalChars',
      'ratio'
    ]);
    assert.strictEqual(typeof res.body.meta.logprobCoverage.ratio, 'number');
    assert.strictEqual(typeof res.body.generatedText, 'string');
    assert.ok(Array.isArray(res.body.tokens));
    assert.ok(res.body.tokens.length > 0);
    assert.deepStrictEqual(Object.keys(res.body.statistics), [
      'averageLogprob',
      'perplexity'
    ]);
  });

  it('returns VALIDATION_ERROR for empty prompt', async () => {
    const handler = createGenerateHandler({
      apiKey: 'test-key',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => fixtureResponse
      })
    });
    const res = createMockResponse();

    await handler({ body: { prompt: '   ', temperature: 0.7 } }, res);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
  });

  it('returns VALIDATION_ERROR for malformed temperature', async () => {
    const handler = createGenerateHandler({
      apiKey: 'test-key',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => fixtureResponse
      })
    });
    const res = createMockResponse();

    await handler({ body: { prompt: 'hello', temperature: '1.0abc' } }, res);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.code, 'VALIDATION_ERROR');
  });

  it('returns CONFIG_ERROR when OPENAI_API_KEY is missing', async () => {
    const handler = createGenerateHandler({
      apiKey: '',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => fixtureResponse
      })
    });
    const res = createMockResponse();

    await handler({ body: { prompt: 'hello', temperature: 0.7 } }, res);

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.code, 'CONFIG_ERROR');
  });

  it('maps OpenAI 429 to OPENAI_ERROR with HTTP 503', async () => {
    const handler = createGenerateHandler({
      apiKey: 'test-key',
      fetchImpl: async () => ({ ok: false, status: 429 })
    });
    const res = createMockResponse();

    await handler({ body: { prompt: 'hello', temperature: 0.7 } }, res);

    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.code, 'OPENAI_ERROR');
  });

  it('returns PARSE_ERROR when OpenAI response has no logprobs', async () => {
    const handler = createGenerateHandler({
      apiKey: 'test-key',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'hello' }]
            }
          ]
        })
      })
    });
    const res = createMockResponse();

    await handler({ body: { prompt: 'hello', temperature: 0.7 } }, res);

    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.code, 'PARSE_ERROR');
  });
});
