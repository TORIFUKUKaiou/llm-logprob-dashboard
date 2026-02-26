const form = document.getElementById('generate-form');
const promptInput = document.getElementById('prompt-input');
const temperatureInput = document.getElementById('temperature-input');
const temperatureValue = document.getElementById('temperature-value');
const generateButton = document.getElementById('generate-button');
const clearHistoryButton = document.getElementById('clear-history-button');
const statusMessage = document.getElementById('status-message');

const resultsSection = document.getElementById('results-section');
const generatedText = document.getElementById('generated-text');
const perplexityValue = document.getElementById('perplexity-value');
const averageLogprobValue = document.getElementById('average-logprob-value');
const tokenCountValue = document.getElementById('token-count-value');
const metaModel = document.getElementById('meta-model');
const metaTemperature = document.getElementById('meta-temperature');
const tokenTableBody = document.getElementById('token-table-body');
const historyList = document.getElementById('history-list');
const topLogprobsEmpty = document.getElementById('top-logprobs-empty');
const topLogprobsContent = document.getElementById('top-logprobs-content');
const selectedTokenText = document.getElementById('selected-token-text');
const selectedTokenMeta = document.getElementById('selected-token-meta');
const topLogprobsList = document.getElementById('top-logprobs-list');

const MAX_HISTORY_ITEMS = 3;
const LOGPROB_WARNING_THRESHOLD = -2.0;
let chart = null;
let history = [];
let currentTokens = [];
let selectedTokenIndex = null;

function formatNumber(value, digits, fallback = '--') {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : fallback;
}

function setStatus(message, variant = 'info') {
  statusMessage.textContent = message;
  statusMessage.classList.remove('status-info', 'status-success', 'status-error');
  statusMessage.classList.add(`status-${variant}`);
}

function setLoading(isLoading) {
  generateButton.disabled = isLoading;
  promptInput.disabled = isLoading;
  temperatureInput.disabled = isLoading;

  if (isLoading) {
    generateButton.textContent = 'Analyzing...';
    setStatus('Requesting OpenAI and parsing token logprobs...', 'info');
  } else {
    generateButton.textContent = 'Generate + Analyze';
  }
}

function normalizeTokenDisplay(token) {
  if (token.length === 0) {
    return '[empty]';
  }

  if (/^\s+$/.test(token)) {
    return `[whitespace x${token.length}]`;
  }

  return token
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function probabilityFromLogprob(logprob) {
  if (typeof logprob !== 'number' || !Number.isFinite(logprob)) {
    return 0;
  }
  return Math.exp(logprob);
}

async function sha256Hex(value) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API is not available in this browser.');
  }

  const encoded = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function updateTableSelection() {
  const rows = tokenTableBody.querySelectorAll('tr[data-token-index]');
  rows.forEach((row) => {
    const rowIndex = Number(row.dataset.tokenIndex);
    row.classList.toggle('selected-row', rowIndex === selectedTokenIndex);
  });
}

function updateChartSelection() {
  if (!chart) {
    return;
  }

  const dataset = chart.data.datasets[0];
  dataset.pointRadius = currentTokens.map((token, index) => {
    if (index === selectedTokenIndex) {
      return 8;
    }
    return token.logprob < LOGPROB_WARNING_THRESHOLD ? 4 : 3;
  });
  dataset.pointBorderWidth = currentTokens.map((_, index) => (index === selectedTokenIndex ? 2 : 0));
  dataset.pointBorderColor = currentTokens.map((_, index) => (index === selectedTokenIndex ? '#111111' : 'transparent'));

  chart.update('none');
}

function renderTopLogprobs(tokenEntry) {
  topLogprobsList.innerHTML = '';

  if (!tokenEntry) {
    topLogprobsContent.classList.add('is-hidden');
    topLogprobsEmpty.classList.remove('is-hidden');
    topLogprobsEmpty.textContent = 'Select a token to view alternatives.';
    return;
  }

  topLogprobsContent.classList.remove('is-hidden');
  topLogprobsEmpty.classList.add('is-hidden');
  selectedTokenText.textContent = normalizeTokenDisplay(tokenEntry.token);
  selectedTokenMeta.textContent = `index #${tokenEntry.index} | logprob ${formatNumber(tokenEntry.logprob, 4)}`;

  if (!Array.isArray(tokenEntry.topLogprobs) || tokenEntry.topLogprobs.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'No alternatives returned for this token.';
    topLogprobsList.appendChild(empty);
    return;
  }

  const candidates = [...tokenEntry.topLogprobs].sort((a, b) => b.logprob - a.logprob);
  const probabilities = candidates.map((candidate) => probabilityFromLogprob(candidate.logprob));
  const maxProbability = Math.max(...probabilities, 0.000001);

  candidates.forEach((candidate, index) => {
    const probability = probabilities[index];
    const normalizedWidth = Math.max(6, Math.min(100, (probability / maxProbability) * 100));

    const item = document.createElement('article');
    item.className = 'candidate-item';

    const bar = document.createElement('div');
    bar.className = 'candidate-bar';
    bar.style.width = `${normalizedWidth}%`;

    const body = document.createElement('div');
    body.className = 'candidate-body';

    const token = document.createElement('p');
    token.className = 'candidate-token';
    token.textContent = normalizeTokenDisplay(candidate.token);

    const meta = document.createElement('p');
    meta.className = 'candidate-meta';
    meta.textContent = `logprob ${formatNumber(candidate.logprob, 4)} | p ${(probability * 100).toFixed(2)}%`;

    body.append(token, meta);
    item.append(bar, body);
    topLogprobsList.appendChild(item);
  });
}

function setSelectedToken(index) {
  if (!Number.isInteger(index) || index < 0 || index >= currentTokens.length) {
    selectedTokenIndex = null;
    updateTableSelection();
    updateChartSelection();
    renderTopLogprobs(null);
    return;
  }

  selectedTokenIndex = index;
  updateTableSelection();
  updateChartSelection();
  renderTopLogprobs(currentTokens[index]);
}

function renderTokenTable(tokens) {
  tokenTableBody.innerHTML = '';

  tokens.forEach((tokenEntry) => {
    const row = document.createElement('tr');
    row.dataset.tokenIndex = String(tokenEntry.index);
    row.tabIndex = 0;
    if (tokenEntry.logprob < LOGPROB_WARNING_THRESHOLD) {
      row.classList.add('warning-row');
    }

    const indexCell = document.createElement('td');
    indexCell.textContent = String(tokenEntry.index);

    const tokenCell = document.createElement('td');
    tokenCell.className = 'token-cell';
    tokenCell.textContent = normalizeTokenDisplay(tokenEntry.token);

    const logprobCell = document.createElement('td');
    logprobCell.textContent = formatNumber(tokenEntry.logprob, 4, '-');

    row.addEventListener('click', () => {
      setSelectedToken(tokenEntry.index);
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setSelectedToken(tokenEntry.index);
      }
    });

    row.append(indexCell, tokenCell, logprobCell);
    tokenTableBody.appendChild(row);
  });

  updateTableSelection();
}

function destroyChartIfExists() {
  if (chart) {
    chart.destroy();
    chart = null;
  }
}

function renderChart(tokens) {
  if (typeof Chart === 'undefined') {
    setStatus('Chart library failed to load. Token table is still available.', 'error');
    return;
  }

  const canvas = document.getElementById('logprob-chart');
  const context = canvas.getContext('2d');

  destroyChartIfExists();

  chart = new Chart(context, {
    type: 'line',
    data: {
      labels: tokens.map((token) => token.index),
      datasets: [
        {
          label: 'Logprob',
          data: tokens.map((token) => token.logprob),
          borderColor: '#ff4f20',
          backgroundColor: 'rgba(255, 79, 32, 0.2)',
          borderWidth: 3,
          tension: 0.23,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: tokens.map((token) =>
            token.logprob < LOGPROB_WARNING_THRESHOLD ? '#e81f43' : '#00b7ff'
          )
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event, chartElements) => {
        if (!Array.isArray(chartElements) || chartElements.length === 0) {
          return;
        }
        const point = chartElements[0];
        setSelectedToken(point.index);
      },
      plugins: {
        legend: {
          labels: {
            font: {
              family: 'Space Grotesk',
              weight: 700
            }
          }
        },
        tooltip: {
          callbacks: {
            title(tooltipItems) {
              if (!tooltipItems.length) {
                return '';
              }
              return `Token #${tooltipItems[0].label}`;
            },
            label(context) {
              return `logprob: ${formatNumber(context.parsed.y, 4, '-')}`;
            },
            afterLabel(context) {
              const token = tokens[context.dataIndex] ? tokens[context.dataIndex].token : '';
              return `token: ${normalizeTokenDisplay(token)}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Token Index',
            font: {
              family: 'Space Grotesk',
              weight: 700
            }
          },
          ticks: {
            maxRotation: 0,
            autoSkip: true
          }
        },
        y: {
          title: {
            display: true,
            text: 'Logprob',
            font: {
              family: 'Space Grotesk',
              weight: 700
            }
          }
        }
      }
    }
  });
}

function renderHistory() {
  historyList.innerHTML = '';

  if (history.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'No runs yet.';
    historyList.appendChild(empty);
    return;
  }

  history.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'history-item reveal';

    const meta = document.createElement('p');
    meta.className = 'history-meta';
    meta.textContent = `${item.time} | temp ${item.temperature} | ppl ${item.perplexity}`;

    const main = document.createElement('p');
    main.className = 'history-main';
    main.textContent = item.prompt;

    const excerpt = document.createElement('p');
    excerpt.className = 'history-text';
    excerpt.textContent = item.text;

    card.append(meta, main, excerpt);
    historyList.appendChild(card);
  });
}

function pushHistoryItem(payload, prompt, temperature) {
  const snippet = payload.generatedText.replace(/\s+/g, ' ').trim();
  history.unshift({
    time: new Date().toLocaleTimeString(),
    prompt: prompt.length > 42 ? `${prompt.slice(0, 42)}...` : prompt,
    text: snippet.length > 110 ? `${snippet.slice(0, 110)}...` : snippet,
    temperature: formatNumber(temperature, 1, '-'),
    perplexity: formatNumber(payload.statistics.perplexity, 2, '-')
  });
  history = history.slice(0, MAX_HISTORY_ITEMS);
  renderHistory();
}

function revealResults() {
  resultsSection.classList.remove('is-hidden');
  const cards = resultsSection.querySelectorAll('.metric-card, .result-card');
  cards.forEach((card, index) => {
    card.classList.remove('reveal');
    void card.offsetWidth;
    card.style.animationDelay = `${index * 40}ms`;
    card.classList.add('reveal');
  });
}

function renderResult(payload, temperature) {
  currentTokens = Array.isArray(payload.tokens) ? payload.tokens : [];
  selectedTokenIndex = null;

  generatedText.textContent = payload.generatedText || '';
  perplexityValue.textContent = formatNumber(payload.statistics.perplexity, 2);
  averageLogprobValue.textContent = formatNumber(payload.statistics.averageLogprob, 4);
  tokenCountValue.textContent = String(currentTokens.length);
  metaModel.textContent = payload.meta.model || '-';
  metaTemperature.textContent = formatNumber(temperature, 1);

  renderTokenTable(currentTokens);
  renderChart(currentTokens);
  renderTopLogprobs(null);

  if (currentTokens.length > 0) {
    const mostUncertainToken = currentTokens.reduce((prev, token) =>
      token.logprob < prev.logprob ? token : prev
    );
    setSelectedToken(mostUncertainToken.index);
  }

  revealResults();
}

async function requestGeneration(prompt, temperature) {
  const requestBody = JSON.stringify({
    prompt,
    temperature
  });
  const bodySha256 = await sha256Hex(requestBody);

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-amz-content-sha256': bodySha256
    },
    body: requestBody
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage = payload && payload.error ? payload.error : `Request failed (${response.status})`;
    const errorCode = payload && payload.code ? ` [${payload.code}]` : '';
    throw new Error(`${errorMessage}${errorCode}`);
  }

  return payload;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const prompt = promptInput.value.trim();
  const temperature = Number(temperatureInput.value);

  if (!prompt) {
    setStatus('Prompt is required.', 'error');
    promptInput.focus();
    return;
  }

  setLoading(true);

  try {
    const payload = await requestGeneration(prompt, temperature);

    renderResult(payload, temperature);
    pushHistoryItem(payload, prompt, temperature);
    setStatus('Analysis complete.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    setLoading(false);
  }
});

temperatureInput.addEventListener('input', () => {
  temperatureValue.textContent = Number(temperatureInput.value).toFixed(1);
});

clearHistoryButton.addEventListener('click', () => {
  history = [];
  renderHistory();
  setStatus('History cleared.', 'info');
});

window.addEventListener('beforeunload', () => {
  destroyChartIfExists();
});

renderHistory();
