// LLM Logprob Dashboard backend
// Express server entry point

require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');

const core = require('./lambda/core');

function createGenerateHandler(options = {}) {
  return async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await core.handleGenerate(body.prompt, body.temperature, options);
    return res.status(result.statusCode).json(result.body);
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
  ...core,
  createApp,
  createGenerateHandler,
  startServer
};
