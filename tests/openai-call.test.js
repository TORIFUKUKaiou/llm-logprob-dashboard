const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  callOpenAIResponses,
  DEFAULT_MODEL,
  DEFAULT_TOP_LOGPROBS,
  LOGPROB_INCLUDE_PATH,
  OPENAI_RESPONSES_ENDPOINT
} = require('../server');

describe('callOpenAIResponses', () => {
  it('builds the expected Responses API request body', async () => {
    let capturedUrl;
    let capturedOptions;
    const mockFetch = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({ output: [] })
      };
    };

    await callOpenAIResponses('test prompt', 0.3, {
      apiKey: 'test-key',
      fetchImpl: mockFetch
    });

    assert.strictEqual(capturedUrl, OPENAI_RESPONSES_ENDPOINT);
    assert.strictEqual(capturedOptions.method, 'POST');
    assert.strictEqual(
      capturedOptions.headers.Authorization,
      'Bearer test-key'
    );

    const body = JSON.parse(capturedOptions.body);
    assert.strictEqual(body.model, DEFAULT_MODEL);
    assert.strictEqual(body.temperature, 0.3);
    assert.strictEqual(body.top_logprobs, DEFAULT_TOP_LOGPROBS);
    assert.deepStrictEqual(body.include, [LOGPROB_INCLUDE_PATH]);
    assert.deepStrictEqual(body.input, [
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'test prompt' }]
      }
    ]);
  });

  it('allows overriding top_logprobs count', async () => {
    let capturedOptions;
    const mockFetch = async (_url, options) => {
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({ output: [] })
      };
    };

    await callOpenAIResponses('test prompt', 0.7, {
      apiKey: 'test-key',
      fetchImpl: mockFetch,
      topLogprobs: 8
    });

    const body = JSON.parse(capturedOptions.body);
    assert.strictEqual(body.top_logprobs, 8);
  });

  it('throws CONFIG_ERROR when API key is missing', async () => {
    await assert.rejects(
      () =>
        callOpenAIResponses('prompt', 0.7, {
          apiKey: '',
          fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) })
        }),
      (error) =>
        error.type === 'CONFIG_ERROR' &&
        error.message === 'OPENAI_API_KEY is not configured'
    );
  });

  it('maps 401 to OPENAI_ERROR with auth message', async () => {
    await assert.rejects(
      () =>
        callOpenAIResponses('prompt', 0.7, {
          apiKey: 'test-key',
          fetchImpl: async () => ({ ok: false, status: 401 })
        }),
      (error) =>
        error.type === 'OPENAI_ERROR' &&
        error.status === 401 &&
        error.message === 'Authentication failed - check API key'
    );
  });

  it('maps 429 to OPENAI_ERROR with rate limit message', async () => {
    await assert.rejects(
      () =>
        callOpenAIResponses('prompt', 0.7, {
          apiKey: 'test-key',
          fetchImpl: async () => ({ ok: false, status: 429 })
        }),
      (error) =>
        error.type === 'OPENAI_ERROR' &&
        error.status === 429 &&
        error.message === 'Rate limit exceeded - please try again later'
    );
  });

  it('throws OPENAI_ERROR on network failures', async () => {
    await assert.rejects(
      () =>
        callOpenAIResponses('prompt', 0.7, {
          apiKey: 'test-key',
          fetchImpl: async () => {
            throw new Error('network down');
          }
        }),
      (error) =>
        error.type === 'OPENAI_ERROR' &&
        error.message === 'Failed to connect to OpenAI API'
    );
  });
});
