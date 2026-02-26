const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const fixtureResponse = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../fixtures/response.json'), 'utf8')
);

const originalFetch = global.fetch;
const originalEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  TOP_LOGPROBS: process.env.TOP_LOGPROBS
};

let handler;

function buildEvent(body, overrides = {}) {
  return {
    rawPath: '/api/generate',
    isBase64Encoded: false,
    body: JSON.stringify(body),
    requestContext: {
      http: {
        method: 'POST'
      }
    },
    ...overrides
  };
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL = 'gpt-4o-mini';
  process.env.TOP_LOGPROBS = '5';
  delete require.cache[require.resolve('../lambda/api-handler')];
  handler = require('../lambda/api-handler').handler;
});

afterEach(() => {
  global.fetch = originalFetch;

  process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
  process.env.OPENAI_MODEL = originalEnv.OPENAI_MODEL;
  process.env.TOP_LOGPROBS = originalEnv.TOP_LOGPROBS;
});

describe('lambda/api-handler', () => {
  it('returns generated payload for valid request', async () => {
    let capturedBody;
    global.fetch = async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => fixtureResponse
      };
    };

    const response = await handler(
      buildEvent({ prompt: 'Explain logprob', temperature: 0.4 })
    );
    const payload = JSON.parse(response.body);

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(payload.meta.model, 'gpt-4o-mini');
    assert.strictEqual(payload.meta.temperature, 0.4);
    assert.ok(Array.isArray(payload.tokens));
    assert.strictEqual(capturedBody.top_logprobs, 5);
  });

  it('returns VALIDATION_ERROR when prompt is empty', async () => {
    const response = await handler(
      buildEvent({ prompt: '   ', temperature: 0.7 })
    );
    const payload = JSON.parse(response.body);

    assert.strictEqual(response.statusCode, 400);
    assert.strictEqual(payload.code, 'VALIDATION_ERROR');
  });

  it('returns 404 for non-api path', async () => {
    const response = await handler(
      buildEvent(
        { prompt: 'x', temperature: 0.7 },
        { rawPath: '/other/path' }
      )
    );
    const payload = JSON.parse(response.body);

    assert.strictEqual(response.statusCode, 404);
    assert.strictEqual(payload.code, 'NOT_FOUND');
  });

  it('maps OpenAI 429 to HTTP 503 OPENAI_ERROR', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 429
    });

    const response = await handler(
      buildEvent({ prompt: 'x', temperature: 0.7 })
    );
    const payload = JSON.parse(response.body);

    assert.strictEqual(response.statusCode, 503);
    assert.strictEqual(payload.code, 'OPENAI_ERROR');
  });
});
