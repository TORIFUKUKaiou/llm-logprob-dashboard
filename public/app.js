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
const metaMaxOutputTokens = document.getElementById('meta-max-output-tokens');
const metaLogprobCoverage = document.getElementById('meta-logprob-coverage');
const tokenTableBody = document.getElementById('token-table-body');
const historyList = document.getElementById('history-list');
const topLogprobsEmpty = document.getElementById('top-logprobs-empty');
const topLogprobsContent = document.getElementById('top-logprobs-content');
const selectedTokenText = document.getElementById('selected-token-text');
const selectedTokenMeta = document.getElementById('selected-token-meta');
const topLogprobsList = document.getElementById('top-logprobs-list');
const cosmoStage = document.getElementById('cosmo-stage');
const cosmoStars = document.getElementById('cosmo-stars');

const MAX_HISTORY_ITEMS = 3;
const LOGPROB_WARNING_THRESHOLD = -2.0;
const DEFAULT_TEMPERATURE = 0.7;
const HISTORY_STORAGE_KEY = 'llm-logprob-dashboard-history-v1';
const COSMO_STAR_LIMIT = 120;
const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let chart = null;
let history = [];
let currentTokens = [];
let selectedTokenIndex = null;
let cosmoStarIntervalId = null;
let cosmoCleanupTimerId = null;

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

function setCosmoAnchorFromButton() {
  if (!generateButton || !document.body) {
    return;
  }

  const buttonRect = generateButton.getBoundingClientRect();
  const anchorX = buttonRect.left + buttonRect.width / 2;
  const anchorY = buttonRect.top + buttonRect.height / 2;
  document.body.style.setProperty('--cosmo-x', `${anchorX}px`);
  document.body.style.setProperty('--cosmo-y', `${anchorY}px`);
}

function clearCosmoInterval() {
  if (cosmoStarIntervalId !== null) {
    window.clearInterval(cosmoStarIntervalId);
    cosmoStarIntervalId = null;
  }
}

function spawnCosmoStar(intensity = 1) {
  if (!cosmoStars || reduceMotionQuery.matches) {
    return;
  }

  const angle = Math.random() * Math.PI * 2;
  const speed = 80 + Math.random() * 240 * intensity;
  const dx = Math.cos(angle) * speed;
  const dy = Math.sin(angle) * speed;
  const size = 1.8 + Math.random() * 3.2 * intensity;
  const originJitter = 1.8 * intensity;

  const star = document.createElement('span');
  star.className = 'cosmo-star';
  star.style.left = `calc(var(--cosmo-x, 50vw) + ${(Math.random() - 0.5) * originJitter}vw)`;
  star.style.top = `calc(var(--cosmo-y, 34vh) + ${(Math.random() - 0.5) * originJitter}vh)`;
  star.style.width = `${size}px`;
  star.style.height = `${size}px`;
  star.style.setProperty('--dx', `${dx}px`);
  star.style.setProperty('--dy', `${dy}px`);
  star.style.setProperty('--dur', `${620 + Math.random() * 620}ms`);
  cosmoStars.appendChild(star);

  if (cosmoStars.childElementCount > COSMO_STAR_LIMIT) {
    const overflow = cosmoStars.childElementCount - COSMO_STAR_LIMIT;
    for (let i = 0; i < overflow; i += 1) {
      if (cosmoStars.firstElementChild) {
        cosmoStars.firstElementChild.remove();
      }
    }
  }

  window.setTimeout(() => {
    star.remove();
  }, 1600);
}

function burstCosmoStars(count, intensity = 1) {
  for (let i = 0; i < count; i += 1) {
    spawnCosmoStar(intensity);
  }
}

function startCosmoCharge() {
  if (!document.body || !cosmoStage) {
    return;
  }

  window.clearTimeout(cosmoCleanupTimerId);
  clearCosmoInterval();
  document.body.classList.remove('cosmo-impact', 'cosmo-fizzle');
  document.body.classList.add('cosmo-active');
  generateButton.classList.remove('cosmo-impact');
  generateButton.classList.add('cosmo-charging');
  setCosmoAnchorFromButton();

  if (reduceMotionQuery.matches) {
    return;
  }

  burstCosmoStars(20, 1);
  cosmoStarIntervalId = window.setInterval(() => {
    burstCosmoStars(3, 1);
  }, 120);
}

function stopCosmoCharge(outcome = 'neutral') {
  if (!document.body || !cosmoStage) {
    return;
  }

  clearCosmoInterval();
  generateButton.classList.remove('cosmo-charging');

  if (outcome === 'success') {
    document.body.classList.remove('cosmo-fizzle');
    document.body.classList.add('cosmo-impact');
    generateButton.classList.remove('cosmo-impact');
    void generateButton.offsetWidth;
    generateButton.classList.add('cosmo-impact');
    burstCosmoStars(36, 1.4);
  } else if (outcome === 'error') {
    document.body.classList.remove('cosmo-impact');
    document.body.classList.add('cosmo-fizzle');
    burstCosmoStars(16, 0.8);
  } else {
    document.body.classList.remove('cosmo-impact', 'cosmo-fizzle');
  }

  document.body.classList.remove('cosmo-active');
  cosmoCleanupTimerId = window.setTimeout(() => {
    document.body.classList.remove('cosmo-impact', 'cosmo-fizzle');
    generateButton.classList.remove('cosmo-impact');
    if (cosmoStars) {
      cosmoStars.innerHTML = '';
    }
  }, 900);
}

function setLoading(isLoading, outcome = 'neutral') {
  generateButton.disabled = isLoading;
  promptInput.disabled = isLoading;
  temperatureInput.disabled = isLoading;

  if (isLoading) {
    generateButton.textContent = 'Analyzing...';
    setStatus('Requesting OpenAI and parsing token logprobs...', 'info');
    startCosmoCharge();
  } else {
    generateButton.textContent = 'Generate + Analyze';
    stopCosmoCharge(outcome);
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

function createHistoryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toFiniteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function calculateLogprobCoverage(generatedText, tokens) {
  const totalChars = typeof generatedText === 'string' ? generatedText.length : 0;
  const coveredChars = Array.isArray(tokens)
    ? tokens.reduce(
        (total, tokenEntry) =>
          total + (tokenEntry && typeof tokenEntry.token === 'string' ? tokenEntry.token.length : 0),
        0
      )
    : 0;
  const normalizedCoveredChars = totalChars > 0 ? Math.min(coveredChars, totalChars) : 0;
  const ratio = totalChars > 0 ? normalizedCoveredChars / totalChars : null;

  return {
    coveredChars: normalizedCoveredChars,
    totalChars,
    ratio
  };
}

function normalizeCoverage(coverage, generatedText, tokens) {
  const fallback = calculateLogprobCoverage(generatedText, tokens);
  if (!coverage || typeof coverage !== 'object') {
    return fallback;
  }

  const coveredChars = toFiniteNumber(coverage.coveredChars, fallback.coveredChars);
  const totalChars = toFiniteNumber(coverage.totalChars, fallback.totalChars);
  const ratio = toFiniteNumber(coverage.ratio, null);
  const normalizedCoveredChars = Math.max(0, Math.floor(coveredChars));
  const normalizedTotalChars = Math.max(0, Math.floor(totalChars));
  const normalizedRatio = normalizedTotalChars > 0
    ? (ratio !== null ? Math.max(0, Math.min(1, ratio)) : normalizedCoveredChars / normalizedTotalChars)
    : null;

  return {
    coveredChars: normalizedTotalChars > 0
      ? Math.min(normalizedCoveredChars, normalizedTotalChars)
      : 0,
    totalChars: normalizedTotalChars,
    ratio: normalizedRatio
  };
}

function formatCoverage(coverage) {
  if (!coverage || typeof coverage !== 'object') {
    return '-';
  }

  const totalChars = toFiniteNumber(coverage.totalChars, 0);
  const coveredChars = toFiniteNumber(coverage.coveredChars, 0);
  if (!Number.isFinite(totalChars) || totalChars <= 0) {
    return '-';
  }

  const ratio = toFiniteNumber(coverage.ratio, coveredChars / totalChars);
  const percentage = Math.max(0, Math.min(100, ratio * 100));
  const normalizedCovered = Math.max(0, Math.min(Math.floor(coveredChars), Math.floor(totalChars)));
  const normalizedTotal = Math.max(0, Math.floor(totalChars));

  return `${percentage.toFixed(1)}% (${normalizedCovered}/${normalizedTotal} chars)`;
}

function normalizeStoredPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const tokens = Array.isArray(payload.tokens)
    ? payload.tokens
        .map((tokenEntry, index) => {
          if (!tokenEntry || typeof tokenEntry !== 'object') {
            return null;
          }

          const token = typeof tokenEntry.token === 'string' ? tokenEntry.token : '';
          const logprob = toFiniteNumber(tokenEntry.logprob, null);
          if (logprob === null) {
            return null;
          }

          const topLogprobs = Array.isArray(tokenEntry.topLogprobs)
            ? tokenEntry.topLogprobs
                .map((candidate) => {
                  if (!candidate || typeof candidate !== 'object') {
                    return null;
                  }
                  const candidateToken = typeof candidate.token === 'string' ? candidate.token : '';
                  const candidateLogprob = toFiniteNumber(candidate.logprob, null);
                  if (candidateLogprob === null) {
                    return null;
                  }
                  return {
                    token: candidateToken,
                    logprob: candidateLogprob
                  };
                })
                .filter(Boolean)
            : [];

          return {
            index,
            token,
            logprob,
            topLogprobs
          };
        })
        .filter(Boolean)
    : [];

  const averageLogprob = toFiniteNumber(payload.statistics && payload.statistics.averageLogprob, null);
  const perplexity = toFiniteNumber(payload.statistics && payload.statistics.perplexity, null);
  const generatedTextValue = typeof payload.generatedText === 'string' ? payload.generatedText : '';
  const model = payload.meta && typeof payload.meta.model === 'string'
    ? payload.meta.model
    : '-';
  const maxOutputTokens = Number.isInteger(toFiniteNumber(payload.meta && payload.meta.maxOutputTokens, null))
    ? Number(payload.meta.maxOutputTokens)
    : null;
  const logprobCoverage = normalizeCoverage(
    payload.meta && payload.meta.logprobCoverage,
    generatedTextValue,
    tokens
  );

  return {
    generatedText: generatedTextValue,
    tokens,
    statistics: {
      averageLogprob,
      perplexity
    },
    meta: {
      model,
      maxOutputTokens,
      logprobCoverage
    }
  };
}

function normalizeStoredHistoryItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const payload = normalizeStoredPayload(item.payload);
  if (!payload) {
    return null;
  }

  return {
    id: typeof item.id === 'string' ? item.id : createHistoryId(),
    time: typeof item.time === 'string' ? item.time : new Date().toLocaleTimeString(),
    prompt: typeof item.prompt === 'string' ? item.prompt : '',
    temperature: toFiniteNumber(item.temperature, DEFAULT_TEMPERATURE),
    payload
  };
}

function loadHistoryFromStorage() {
  if (!window.localStorage) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => normalizeStoredHistoryItem(item))
      .filter(Boolean)
      .slice(0, MAX_HISTORY_ITEMS);
  } catch (_error) {
    return [];
  }
}

function persistHistoryToStorage() {
  if (!window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (_error) {
    // Fall back to in-memory history when browser storage is unavailable.
  }
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
    const snippet = item.payload.generatedText.replace(/\s+/g, ' ').trim();
    const promptPreview = item.prompt.length > 42 ? `${item.prompt.slice(0, 42)}...` : item.prompt;

    const card = document.createElement('article');
    card.className = 'history-item history-item-clickable reveal';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Restore run from ${item.time}`);

    const meta = document.createElement('p');
    meta.className = 'history-meta';
    meta.textContent = `${item.time} | temp ${formatNumber(item.temperature, 1, '-')} | ppl ${formatNumber(item.payload.statistics.perplexity, 2, '-')}`;

    const main = document.createElement('p');
    main.className = 'history-main';
    main.textContent = promptPreview || '[empty prompt]';

    const excerpt = document.createElement('p');
    excerpt.className = 'history-text';
    excerpt.textContent = snippet.length > 110 ? `${snippet.slice(0, 110)}...` : (snippet || '[no generated text]');

    card.addEventListener('click', () => {
      restoreFromHistory(item);
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        restoreFromHistory(item);
      }
    });

    card.append(meta, main, excerpt);
    historyList.appendChild(card);
  });
}

function restoreFromHistory(item) {
  const normalizedItem = normalizeStoredHistoryItem(item);
  if (!normalizedItem) {
    setStatus('Failed to restore the selected run.', 'error');
    return;
  }

  promptInput.value = normalizedItem.prompt;
  temperatureInput.value = String(normalizedItem.temperature);
  temperatureValue.textContent = Number(normalizedItem.temperature).toFixed(1);
  renderResult(normalizedItem.payload, normalizedItem.temperature);
  setStatus('Restored from Recent Runs.', 'info');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function pushHistoryItem(payload, prompt, temperature) {
  const normalizedPayload = normalizeStoredPayload(payload);
  if (!normalizedPayload) {
    return;
  }

  history.unshift({
    id: createHistoryId(),
    time: new Date().toLocaleTimeString(),
    prompt,
    temperature: toFiniteNumber(temperature, DEFAULT_TEMPERATURE),
    payload: normalizedPayload
  });
  history = history.slice(0, MAX_HISTORY_ITEMS);
  persistHistoryToStorage();
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
  const statistics = payload && typeof payload.statistics === 'object'
    ? payload.statistics
    : {};
  const meta = payload && typeof payload.meta === 'object'
    ? payload.meta
    : {};
  const coverage = normalizeCoverage(
    meta.logprobCoverage,
    payload.generatedText || '',
    currentTokens
  );

  generatedText.textContent = payload.generatedText || '';
  perplexityValue.textContent = formatNumber(statistics.perplexity, 2);
  averageLogprobValue.textContent = formatNumber(statistics.averageLogprob, 4);
  tokenCountValue.textContent = String(currentTokens.length);
  metaModel.textContent = typeof meta.model === 'string' ? meta.model : '-';
  metaTemperature.textContent = formatNumber(temperature, 1);
  metaMaxOutputTokens.textContent = Number.isInteger(meta.maxOutputTokens)
    ? String(meta.maxOutputTokens)
    : '-';
  metaLogprobCoverage.textContent = formatCoverage(coverage);

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

  let generationOutcome = 'neutral';
  setLoading(true);

  try {
    const payload = await requestGeneration(prompt, temperature);

    renderResult(payload, temperature);
    pushHistoryItem(payload, prompt, temperature);
    setStatus('Analysis complete.', 'success');
    generationOutcome = 'success';
  } catch (error) {
    setStatus(error.message, 'error');
    generationOutcome = 'error';
  } finally {
    setLoading(false, generationOutcome);
  }
});

temperatureInput.addEventListener('input', () => {
  temperatureValue.textContent = Number(temperatureInput.value).toFixed(1);
});

clearHistoryButton.addEventListener('click', () => {
  history = [];
  persistHistoryToStorage();
  renderHistory();
  setStatus('History cleared.', 'info');
});

window.addEventListener('beforeunload', () => {
  destroyChartIfExists();
});

history = loadHistoryFromStorage();
renderHistory();
