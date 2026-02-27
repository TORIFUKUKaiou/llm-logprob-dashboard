// Shared core logic for LLM Logprob Dashboard
// Used by both server.js (Express) and lambda/api-handler.js (Lambda)

const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const LOGPROB_INCLUDE_PATH = 'message.output_text.logprobs';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TOP_LOGPROBS = 5;
const DEFAULT_MAX_OUTPUT_TOKENS = 220;
const DEFAULT_TEMPERATURE = 0.7;
const MIN_TEMPERATURE = 0.0;
const MAX_TEMPERATURE = 2.0;

function buildAppError(type, message, status) {
  return { type, message, status };
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function roundTo(value, digits) {
  return parseFloat(value.toFixed(digits));
}

function loadConfig() {
  return {
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    topLogprobs: Number.isInteger(Number(process.env.TOP_LOGPROBS))
      ? Number(process.env.TOP_LOGPROBS) : DEFAULT_TOP_LOGPROBS,
    maxOutputTokens: parsePositiveInteger(process.env.MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS),
    apiKey: process.env.OPENAI_API_KEY
  };
}

function validatePrompt(prompt) {
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return { valid: false, error: 'プロンプトを入力してください', code: 'VALIDATION_ERROR' };
  }
  return { valid: true, value: prompt };
}

function validateTemperature(temperature) {
  if (temperature === undefined) {
    return { valid: true, value: DEFAULT_TEMPERATURE };
  }
  if (typeof temperature !== 'number' && typeof temperature !== 'string') {
    return { valid: false, error: 'Temperature must be between 0.0 and 2.0', code: 'VALIDATION_ERROR' };
  }
  if (typeof temperature === 'string' && temperature.trim() === '') {
    return { valid: false, error: 'Temperature must be between 0.0 and 2.0', code: 'VALIDATION_ERROR' };
  }
  const parsed = Number(temperature);
  if (!Number.isFinite(parsed) || parsed < MIN_TEMPERATURE || parsed > MAX_TEMPERATURE) {
    return { valid: false, error: 'Temperature must be between 0.0 and 2.0', code: 'VALIDATION_ERROR' };
  }
  return { valid: true, value: parsed };
}

function normalizeTopLogprobs(topLogprobs) {
  if (!Array.isArray(topLogprobs)) return [];
  return topLogprobs
    .map((c) => {
      const token = c && c.token;
      const logprob = c && Number(c.logprob);
      if (typeof token !== 'string' || !Number.isFinite(logprob)) return null;
      return { token, logprob: roundTo(logprob, 4) };
    })
    .filter(Boolean);
}

function calculateStatisticsFromValues(logprobValues) {
  if (!Array.isArray(logprobValues) || logprobValues.length === 0) {
    return { averageLogprob: null, perplexity: null };
  }
  for (const v of logprobValues) {
    if (!Number.isFinite(v)) throw new Error('logprob values must be finite numbers');
  }
  const sum = logprobValues.reduce((acc, v) => acc + v, 0);
  const avg = sum / logprobValues.length;
  return {
    averageLogprob: roundTo(avg, 4),
    perplexity: roundTo(Math.exp(-avg), 2)
  };
}

function calculateStatistics(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return { averageLogprob: null, perplexity: null };
  }
  return calculateStatisticsFromValues(tokens.map((t) => Number(t && t.logprob)));
}

function extractLogprobs(openaiResponse) {
  try {
    if (!openaiResponse || !Array.isArray(openaiResponse.output)) {
      return { success: false, error: 'Invalid response structure: missing output array' };
    }
    const message = openaiResponse.output.find(
      (item) => item && item.type === 'message' && Array.isArray(item.content)
    );
    if (!message) {
      return { success: false, error: 'Invalid response structure: message output is missing' };
    }
    const outputTextItems = message.content.filter((item) => item && item.type === 'output_text');
    if (outputTextItems.length === 0) {
      return { success: false, error: 'Invalid response structure: no output_text found' };
    }

    const generatedText = outputTextItems
      .map((item) => (typeof item.text === 'string' ? item.text : ''))
      .join('');

    const rawLogprobEntries = [];
    for (const ot of outputTextItems) {
      if (Array.isArray(ot.logprobs)) rawLogprobEntries.push(...ot.logprobs);
    }
    if (rawLogprobEntries.length === 0) {
      return { success: false, error: 'Logprobs not available in response' };
    }

    const rawLogprobValues = [];
    const tokens = rawLogprobEntries.map((entry, index) => {
      if (!entry || typeof entry.token !== 'string') {
        throw new Error(`Invalid token entry at index ${index}`);
      }
      const raw = Number(entry.logprob);
      if (!Number.isFinite(raw)) {
        throw new Error(`Invalid logprob value at index ${index}`);
      }
      rawLogprobValues.push(raw);
      return {
        index,
        token: entry.token,
        logprob: roundTo(raw, 4),
        topLogprobs: normalizeTopLogprobs(entry.top_logprobs)
      };
    });

    const coveredChars = tokens.reduce(
      (total, t) => total + (typeof t.token === 'string' ? t.token.length : 0), 0
    );
    const totalChars = generatedText.length;
    const normalizedCoveredChars = totalChars > 0 ? Math.min(coveredChars, totalChars) : 0;
    const coverageRatio = totalChars > 0 ? roundTo(normalizedCoveredChars / totalChars, 4) : null;

    return {
      success: true,
      text: generatedText,
      tokens,
      statistics: calculateStatisticsFromValues(rawLogprobValues),
      coverage: { coveredChars: normalizedCoveredChars, totalChars, ratio: coverageRatio }
    };
  } catch (error) {
    return { success: false, error: `Failed to parse response: ${error.message}` };
  }
}

async function callOpenAIResponses(prompt, temperature, options = {}) {
  const config = loadConfig();
  const apiKey = options.apiKey ?? config.apiKey;
  const model = options.model || config.model;
  const topLogprobs = Number.isInteger(options.topLogprobs) ? options.topLogprobs : config.topLogprobs;
  const maxOutputTokens = parsePositiveInteger(options.maxOutputTokens, config.maxOutputTokens);
  const fetchImpl = options.fetchImpl || global.fetch;

  if (!apiKey) throw buildAppError('CONFIG_ERROR', 'OPENAI_API_KEY is not configured');
  if (typeof fetchImpl !== 'function') throw buildAppError('CONFIG_ERROR', 'Fetch implementation is not available');

  const requestBody = {
    model,
    input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
    temperature,
    include: [LOGPROB_INCLUDE_PATH],
    top_logprobs: topLogprobs,
    max_output_tokens: maxOutputTokens
  };

  let response;
  try {
    response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody)
    });
  } catch (error) {
    const appError = buildAppError('OPENAI_ERROR', 'Failed to connect to OpenAI API');
    appError.cause = error;
    throw appError;
  }

  if (!response.ok) {
    let msg = 'OpenAI API request failed';
    if (response.status === 401) msg = 'Authentication failed - check API key';
    else if (response.status === 429) msg = 'Rate limit exceeded - please try again later';
    else if (response.status >= 500) msg = 'OpenAI service error - please try again';
    throw buildAppError('OPENAI_ERROR', msg, response.status);
  }

  try {
    return await response.json();
  } catch (error) {
    const appError = buildAppError('OPENAI_ERROR', 'OpenAI API returned invalid JSON', response.status);
    appError.cause = error;
    throw appError;
  }
}

function mapErrorToHttpResponse(error) {
  if (error && error.type === 'VALIDATION_ERROR') {
    return { statusCode: 400, errorCode: 'VALIDATION_ERROR', errorMessage: error.message || 'Validation error' };
  }
  if (error && error.type === 'CONFIG_ERROR') {
    return { statusCode: 500, errorCode: 'CONFIG_ERROR', errorMessage: error.message || 'Server configuration error' };
  }
  if (error && error.type === 'PARSE_ERROR') {
    return { statusCode: 500, errorCode: 'PARSE_ERROR', errorMessage: error.message || 'Failed to parse response' };
  }
  if (error && error.type === 'OPENAI_ERROR') {
    return { statusCode: error.status === 429 ? 503 : 502, errorCode: 'OPENAI_ERROR', errorMessage: error.message || 'OpenAI API error' };
  }
  return { statusCode: 500, errorCode: 'OPENAI_ERROR', errorMessage: 'An unexpected error occurred' };
}

async function handleGenerate(prompt, temperature, options = {}) {
  const promptValidation = validatePrompt(prompt);
  if (!promptValidation.valid) {
    return { ok: false, statusCode: 400, body: { error: promptValidation.error, code: promptValidation.code } };
  }

  const temperatureValidation = validateTemperature(temperature);
  if (!temperatureValidation.valid) {
    return { ok: false, statusCode: 400, body: { error: temperatureValidation.error, code: temperatureValidation.code } };
  }

  try {
    const openaiResponse = await callOpenAIResponses(
      promptValidation.value, temperatureValidation.value, options
    );
    const extracted = extractLogprobs(openaiResponse);
    if (!extracted.success) {
      return { ok: false, statusCode: 500, body: { error: extracted.error, code: 'PARSE_ERROR' } };
    }

    const config = loadConfig();
    return {
      ok: true,
      statusCode: 200,
      body: {
        generatedText: extracted.text,
        tokens: extracted.tokens,
        statistics: extracted.statistics,
        meta: {
          model: options.model || config.model,
          temperature: temperatureValidation.value,
          maxOutputTokens: parsePositiveInteger(options.maxOutputTokens, config.maxOutputTokens),
          logprobCoverage: extracted.coverage
        }
      }
    };
  } catch (error) {
    const mapped = mapErrorToHttpResponse(error);
    console.error('API Error:', { code: mapped.errorCode, originalStatus: error && error.status, message: error && error.message });
    return { ok: false, statusCode: mapped.statusCode, body: { error: mapped.errorMessage, code: mapped.errorCode } };
  }
}

module.exports = {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_TOP_LOGPROBS,
  LOGPROB_INCLUDE_PATH,
  OPENAI_RESPONSES_ENDPOINT,
  buildAppError,
  calculateStatistics,
  calculateStatisticsFromValues,
  callOpenAIResponses,
  extractLogprobs,
  handleGenerate,
  loadConfig,
  mapErrorToHttpResponse,
  normalizeTopLogprobs,
  parsePositiveInteger,
  roundTo,
  validatePrompt,
  validateTemperature
};
