const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const DEFAULT_TEMPERATURE = 0.7;
const MIN_TEMPERATURE = 0.0;
const MAX_TEMPERATURE = 2.0;
const MAX_OUTPUT_TOKENS = parsePositiveInteger(process.env.MAX_OUTPUT_TOKENS, 220);
const TOP_LOGPROBS = Number.isInteger(Number(process.env.TOP_LOGPROBS))
  ? Number(process.env.TOP_LOGPROBS)
  : 5;
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

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    },
    body: JSON.stringify(payload)
  };
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

function calculateStatisticsFromValues(logprobValues) {
  if (!Array.isArray(logprobValues) || logprobValues.length === 0) {
    return {
      averageLogprob: null,
      perplexity: null
    };
  }

  const sum = logprobValues.reduce((acc, value) => acc + value, 0);
  const averageLogprob = sum / logprobValues.length;
  const perplexity = Math.exp(-averageLogprob);

  return {
    averageLogprob: roundTo(averageLogprob, 4),
    perplexity: roundTo(perplexity, 2)
  };
}

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

async function callOpenAIResponses(prompt, temperature) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw buildAppError('CONFIG_ERROR', 'OPENAI_API_KEY is not configured');
  }

  const requestBody = {
    model: DEFAULT_MODEL,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: prompt }]
      }
    ],
    temperature,
    include: [LOGPROB_INCLUDE_PATH],
    top_logprobs: TOP_LOGPROBS,
    max_output_tokens: MAX_OUTPUT_TOKENS
  };

  let response;
  try {
    response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
  } catch (_error) {
    throw buildAppError('OPENAI_ERROR', 'Failed to connect to OpenAI API');
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

  return response.json();
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

function parseRequestBody(event) {
  if (!event || !event.body) {
    return {};
  }

  const bodyRaw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  try {
    const body = JSON.parse(bodyRaw);
    return body && typeof body === 'object' ? body : {};
  } catch (_error) {
    throw buildAppError('VALIDATION_ERROR', 'Request body must be valid JSON');
  }
}

exports.handler = async (event) => {
  const method = event && event.requestContext && event.requestContext.http
    ? event.requestContext.http.method
    : 'GET';
  const path = event && typeof event.rawPath === 'string' ? event.rawPath : '/';

  if (method !== 'POST' || path !== '/api/generate') {
    return jsonResponse(404, {
      error: 'Not found',
      code: 'NOT_FOUND'
    });
  }

  try {
    const body = parseRequestBody(event);
    const { prompt, temperature } = body;

    const promptValidation = validatePrompt(prompt);
    if (!promptValidation.valid) {
      return jsonResponse(400, {
        error: promptValidation.error,
        code: promptValidation.code
      });
    }

    const temperatureValidation = validateTemperature(temperature);
    if (!temperatureValidation.valid) {
      return jsonResponse(400, {
        error: temperatureValidation.error,
        code: temperatureValidation.code
      });
    }

    const openaiResponse = await callOpenAIResponses(
      promptValidation.value,
      temperatureValidation.value
    );

    const extracted = extractLogprobs(openaiResponse);
    if (!extracted.success) {
      return jsonResponse(500, {
        error: extracted.error,
        code: 'PARSE_ERROR'
      });
    }

    return jsonResponse(200, {
      generatedText: extracted.text,
      tokens: extracted.tokens,
      statistics: extracted.statistics,
      meta: {
        model: DEFAULT_MODEL,
        temperature: temperatureValidation.value,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        logprobCoverage: extracted.coverage
      }
    });
  } catch (error) {
    const mappedError = mapErrorToHttpResponse(error);
    console.error('Lambda API Error:', {
      code: mappedError.errorCode,
      originalStatus: error && error.status,
      message: error && error.message
    });
    return jsonResponse(mappedError.statusCode, {
      error: mappedError.errorMessage,
      code: mappedError.errorCode
    });
  }
};
