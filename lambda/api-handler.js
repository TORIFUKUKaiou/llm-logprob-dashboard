const { buildAppError, handleGenerate } = require('./core');

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

function parseRequestBody(event) {
  if (!event || !event.body) return {};
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
    ? event.requestContext.http.method : 'GET';
  const path = event && typeof event.rawPath === 'string' ? event.rawPath : '/';

  if (method !== 'POST' || path !== '/api/generate') {
    return jsonResponse(404, { error: 'Not found', code: 'NOT_FOUND' });
  }

  const body = parseRequestBody(event);
  const result = await handleGenerate(body.prompt, body.temperature);
  return jsonResponse(result.statusCode, result.body);
};
