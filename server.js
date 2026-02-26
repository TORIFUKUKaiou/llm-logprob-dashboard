// LLM Logprob Dashboard backend
// OpenAI Responses API integration, logprob extraction, and metrics API.

require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_OUTPUT_TOKENS = parsePositiveInteger(process.env.MAX_OUTPUT_TOKENS, 220);
const DEFAULT_TOP_LOGPROBS = Number.isInteger(Number(process.env.TOP_LOGPROBS))
  ? Number(process.env.TOP_LOGPROBS)
  : 5;
const MIN_TEMPERATURE = 0.0;
const MAX_TEMPERATURE = 2.0;
const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const LOGPROB_INCLUDE_PATH = 'message.output_text.logprobs';

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

function validatePrompt(prompt) {
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return {
      valid: false,
      error: 'プロンプトを入力してください',
      code: 'VALIDATION_ERROR'
    };
  }

  return { valid: true, value: prompt };
}

function validateTemperature(temperature) {
  if (temperature === undefined) {
    return { valid: true, value: DEFAULT_TEMPERATURE };
  }

  if (typeof temperature !== 'number' && typeof temperature !== 'string') {
    return {
      valid: false,
      error: 'Temperature must be between 0.0 and 2.0',
      code: 'VALIDATION_ERROR'
    };
  }

  if (typeof temperature === 'string' && temperature.trim() === '') {
    return {
      valid: false,
      error: 'Temperature must be between 0.0 and 2.0',
      code: 'VALIDATION_ERROR'
    };
  }

  const parsedTemperature = Number(temperature);
  if (
    !Number.isFinite(parsedTemperature) ||
    parsedTemperature < MIN_TEMPERATURE ||
    parsedTemperature > MAX_TEMPERATURE
  ) {
    return {
      valid: false,
      error: 'Temperature must be between 0.0 and 2.0',
      code: 'VALIDATION_ERROR'
    };
  }

  return { valid: true, value: parsedTemperature };
}

function normalizeTopLogprobs(topLogprobs) {
  if (!Array.isArray(topLogprobs)) {
    return [];
  }

  return topLogprobs
    .map((candidate) => {
      const token = candidate && candidate.token;
      const logprob = candidate && Number(candidate.logprob);
      if (typeof token !== 'string' || !Number.isFinite(logprob)) {
        return null;
      }

      return {
        token,
        logprob: roundTo(logprob, 4)
      };
    })
    .filter(Boolean);
}

async function callOpenAIResponses(prompt, temperature = DEFAULT_TEMPERATURE, options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const model = options.model || DEFAULT_MODEL;
  const topLogprobs = Number.isInteger(options.topLogprobs)
    ? options.topLogprobs
    : DEFAULT_TOP_LOGPROBS;
  const maxOutputTokens = parsePositiveInteger(
    options.maxOutputTokens,
    DEFAULT_MAX_OUTPUT_TOKENS
  );
  const fetchImpl = options.fetchImpl || global.fetch;

  if (!apiKey) {
    throw buildAppError('CONFIG_ERROR', 'OPENAI_API_KEY is not configured');
  }

  if (typeof fetchImpl !== 'function') {
    throw buildAppError('CONFIG_ERROR', 'Fetch implementation is not available');
  }

  const requestBody = {
    model,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }]
      }
    ],
    temperature,
    include: [LOGPROB_INCLUDE_PATH],
    top_logprobs: topLogprobs,
    max_output_tokens: maxOutputTokens
  };

  let response;
  try {
    response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
  } catch (error) {
    const appError = buildAppError('OPENAI_ERROR', 'Failed to connect to OpenAI API');
    appError.cause = error;
    throw appError;
  }

  if (!response.ok) {
    let errorMessage = 'OpenAI API request failed';
    if (response.status === 401) {
      errorMessage = 'Authentication failed - check API key';
    } else if (response.status === 429) {
      errorMessage = 'Rate limit exceeded - please try again later';
    } else if (response.status >= 500) {
      errorMessage = 'OpenAI service error - please try again';
    }

    throw buildAppError('OPENAI_ERROR', errorMessage, response.status);
  }

  try {
    return await response.json();
  } catch (error) {
    const appError = buildAppError('OPENAI_ERROR', 'OpenAI API returned invalid JSON', response.status);
    appError.cause = error;
    throw appError;
  }
}

function calculateStatisticsFromValues(logprobValues) {
  if (!Array.isArray(logprobValues) || logprobValues.length === 0) {
    return {
      averageLogprob: null,
      perplexity: null
    };
  }

  for (const value of logprobValues) {
    if (!Number.isFinite(value)) {
      throw new Error('logprob values must be finite numbers');
    }
  }

  const sum = logprobValues.reduce((acc, value) => acc + value, 0);
  const averageLogprob = sum / logprobValues.length;
  const perplexity = Math.exp(-averageLogprob);

  return {
    averageLogprob: roundTo(averageLogprob, 4),
    perplexity: roundTo(perplexity, 2)
  };
}

function calculateStatistics(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return {
      averageLogprob: null,
      perplexity: null
    };
  }

  const logprobValues = tokens.map((token) => Number(token && token.logprob));
  return calculateStatisticsFromValues(logprobValues);
}

// Extracts generated text and per-token logprobs from Responses API response.
function extractLogprobs(openaiResponse) {
  try {
    if (!openaiResponse || !Array.isArray(openaiResponse.output)) {
      return {
        success: false,
        error: 'Invalid response structure: missing output array'
      };
    }

    const message = openaiResponse.output.find(
      (item) => item && item.type === 'message' && Array.isArray(item.content)
    );
    if (!message) {
      return {
        success: false,
        error: 'Invalid response structure: message output is missing'
      };
    }

    const outputTextItems = message.content.filter(
      (item) => item && item.type === 'output_text'
    );
    if (outputTextItems.length === 0) {
      return {
        success: false,
        error: 'Invalid response structure: no output_text found'
      };
    }

    const generatedText = outputTextItems
      .map((item) => (typeof item.text === 'string' ? item.text : ''))
      .join('');

    const rawLogprobEntries = [];
    for (const outputText of outputTextItems) {
      if (Array.isArray(outputText.logprobs)) {
        rawLogprobEntries.push(...outputText.logprobs);
      }
    }

    if (rawLogprobEntries.length === 0) {
      return {
        success: false,
        error: 'Logprobs not available in response'
      };
    }

    const rawLogprobValues = [];
    const tokens = rawLogprobEntries.map((entry, index) => {
      if (!entry || typeof entry.token !== 'string') {
        throw new Error(`Invalid token entry at index ${index}`);
      }

      const rawLogprob = Number(entry.logprob);
      if (!Number.isFinite(rawLogprob)) {
        throw new Error(`Invalid logprob value at index ${index}`);
      }

      rawLogprobValues.push(rawLogprob);

      return {
        index,
        token: entry.token,
        logprob: roundTo(rawLogprob, 4),
        topLogprobs: normalizeTopLogprobs(entry.top_logprobs)
      };
    });

    const coveredChars = tokens.reduce((total, tokenEntry) => {
      return total + (typeof tokenEntry.token === 'string' ? tokenEntry.token.length : 0);
    }, 0);
    const totalChars = generatedText.length;
    const normalizedCoveredChars = totalChars > 0
      ? Math.min(coveredChars, totalChars)
      : 0;
    const coverageRatio = totalChars > 0
      ? roundTo(normalizedCoveredChars / totalChars, 4)
      : null;

    return {
      success: true,
      text: generatedText,
      tokens,
      statistics: calculateStatisticsFromValues(rawLogprobValues),
      coverage: {
        coveredChars: normalizedCoveredChars,
        totalChars,
        ratio: coverageRatio
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse response: ${error.message}`
    };
  }
}

function mapErrorToHttpResponse(error) {
  if (error && error.type === 'VALIDATION_ERROR') {
    return {
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
      errorMessage: error.message || 'Validation error'
    };
  }

  if (error && error.type === 'CONFIG_ERROR') {
    return {
      statusCode: 500,
      errorCode: 'CONFIG_ERROR',
      errorMessage: error.message || 'Server configuration error'
    };
  }

  if (error && error.type === 'PARSE_ERROR') {
    return {
      statusCode: 500,
      errorCode: 'PARSE_ERROR',
      errorMessage: error.message || 'Failed to parse response'
    };
  }

  if (error && error.type === 'OPENAI_ERROR') {
    return {
      statusCode: error.status === 429 ? 503 : 502,
      errorCode: 'OPENAI_ERROR',
      errorMessage: error.message || 'OpenAI API error'
    };
  }

  return {
    statusCode: 500,
    errorCode: 'OPENAI_ERROR',
    errorMessage: 'An unexpected error occurred'
  };
}

function createGenerateHandler(options = {}) {
  const configuredModel = options.model || DEFAULT_MODEL;
  const configuredTopLogprobs = Number.isInteger(options.topLogprobs)
    ? options.topLogprobs
    : DEFAULT_TOP_LOGPROBS;
  const configuredMaxOutputTokens = parsePositiveInteger(
    options.maxOutputTokens,
    DEFAULT_MAX_OUTPUT_TOKENS
  );
  const configuredApiKey =
    Object.prototype.hasOwnProperty.call(options, 'apiKey')
      ? options.apiKey
      : process.env.OPENAI_API_KEY;
  const fetchImpl = options.fetchImpl || global.fetch;

  return async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { prompt, temperature } = body;

    const promptValidation = validatePrompt(prompt);
    if (!promptValidation.valid) {
      return res.status(400).json({
        error: promptValidation.error,
        code: promptValidation.code
      });
    }

    const temperatureValidation = validateTemperature(temperature);
    if (!temperatureValidation.valid) {
      return res.status(400).json({
        error: temperatureValidation.error,
        code: temperatureValidation.code
      });
    }

    try {
      const openaiResponse = await callOpenAIResponses(
        promptValidation.value,
        temperatureValidation.value,
        {
          apiKey: configuredApiKey,
          fetchImpl,
          model: configuredModel,
          topLogprobs: configuredTopLogprobs,
          maxOutputTokens: configuredMaxOutputTokens
        }
      );

      const extracted = extractLogprobs(openaiResponse);
      if (!extracted.success) {
        return res.status(500).json({
          error: extracted.error,
          code: 'PARSE_ERROR'
        });
      }

      return res.json({
        generatedText: extracted.text,
        tokens: extracted.tokens,
        statistics: extracted.statistics,
        meta: {
          model: configuredModel,
          temperature: temperatureValidation.value,
          maxOutputTokens: configuredMaxOutputTokens,
          logprobCoverage: extracted.coverage
        }
      });
    } catch (error) {
      const mappedError = mapErrorToHttpResponse(error);

      console.error('API Error:', {
        code: mappedError.errorCode,
        originalStatus: error && error.status,
        message: error && error.message
      });

      return res.status(mappedError.statusCode).json({
        error: mappedError.errorMessage,
        code: mappedError.errorCode
      });
    }
  };
}

function createApp(options = {}) {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));
  app.post('/api/generate', createGenerateHandler(options));

  return app;
}

function startServer(options = {}) {
  const app = createApp(options);
  const port = options.port || process.env.PORT || 3000;

  const server = app.listen(port, () => {
    console.log(`LLM Logprob Dashboard server running on http://localhost:${port}`);
    console.log('Ready to visualize token-level log probabilities.');
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OPENAI_API_KEY is not configured. /api/generate will return CONFIG_ERROR.');
    }
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TEMPERATURE,
  DEFAULT_TOP_LOGPROBS,
  LOGPROB_INCLUDE_PATH,
  OPENAI_RESPONSES_ENDPOINT,
  calculateStatistics,
  calculateStatisticsFromValues,
  callOpenAIResponses,
  createApp,
  createGenerateHandler,
  extractLogprobs,
  mapErrorToHttpResponse,
  normalizeTopLogprobs,
  roundTo,
  startServer,
  validatePrompt,
  validateTemperature
};
