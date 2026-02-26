# LLM Logprob Dashboard  
## Revised Requirements Document (MVP v1.0)

---

## 1. Introduction

LLM Logprob Dashboardは、OpenAI Responses APIを利用し、生成テキストの各トークンに対応するlog probability（logprob）を取得・可視化する簡易分析ツールである。

本システムは、LLMの生成過程における「確信度」と「迷い」を数値および視覚情報として提示することを目的とする。

本ドキュメントは **1日で完成可能なMVP仕様** を定義する。

---

## 2. Scope（MVP範囲）

本バージョンでは以下を対象とする：

- 単一プロンプト入力
- 単一生成結果の表示
- トークンごとのlogprob可視化
- 平均logprob計算
- perplexity計算
- 折れ線グラフ表示

以下は対象外（将来拡張）：

- 複数温度比較
- top_logprobsの複数候補表示
- 履歴保存
- ユーザー認証

---

## 3. Glossary

- **Logprob**: 自然対数（ln）によるトークン生成確率の対数値。値は通常負であり、0に近いほど高確信。
- **Perplexity**: モデルの予測不確実性を示す指標。  
  定義：  
  `perplexity = exp(- (1/N) * Σ logprob_i )`
- **Token**: OpenAI APIが返すサブワード単位の文字列。必ずしも単語単位ではない。
- **Responses API**: OpenAIの最新APIエンドポイント。

---

## 4. System Architecture

- **Backend**: Node.js (Express)
- **Frontend**: HTML + JavaScript
- **Chart Library**: Chart.js
- **API**: OpenAI Responses API
- **Model**: `gpt-4o-mini`

---

# 5. Functional Requirements

---

## Requirement 1: OpenAI API Integration

### User Story  
As a developer, I want to call the OpenAI Responses API with logprobs enabled, so that I can retrieve token-level probability data.

### Acceptance Criteria

1. The API_Client SHALL use the OpenAI **Responses API**.
2. The API_Client SHALL specify `"gpt-4o-mini"` as the model.
3. The API_Client SHALL set `"logprobs": true`.
4. The API_Client SHALL accept a temperature parameter.
5. The API key SHALL be retrieved from environment variables only.
6. If the API key is missing, the system SHALL return an error.
7. API requests SHALL be executed from the backend server only.

---

## Requirement 2: Logprob Extraction

### User Story  
As a user, I want to see token-level log probabilities.

### Acceptance Criteria

1. When a response is received, the system SHALL extract:
   - Generated text
   - Token list
   - Corresponding logprob values
2. Tokens SHALL be preserved in generation order.
3. If logprobs are not present, the system SHALL return an error.
4. The system SHALL assume logprob values are natural log values.

---

## Requirement 3: Statistical Computation

### User Story  
As a user, I want to understand overall model confidence.

### Acceptance Criteria

1. The system SHALL compute average_logprob:

average_logprob = (1/N) * Σ logprob_i

2. The system SHALL compute perplexity:

perplexity = exp(-average_logprob)

3. Perplexity SHALL be displayed with at least 2 decimal precision.
4. If the logprob list is empty, statistics SHALL NOT be computed.

---

## Requirement 4: User Interface

### User Story  
As a user, I want to input prompts and temperature.

### Acceptance Criteria

1. The UI SHALL provide:
- Prompt text area
- Temperature slider (0.0–2.0)
- Submit button
2. Temperature value SHALL be displayed dynamically.
3. If prompt is empty, submission SHALL be blocked.

---

## Requirement 5: Generated Text Display

### Acceptance Criteria

1. Generated text SHALL be displayed clearly.
2. Line breaks SHALL be preserved.
3. Text SHALL not be truncated.

---

## Requirement 6: Logprob Table

### Acceptance Criteria

1. The system SHALL display a table with:
- Token index
- Token text
- Logprob value
2. Logprob SHALL display with 4 decimal places.
3. If logprob < -2.0, the row SHALL be highlighted.

---

## Requirement 7: Perplexity Display

### Acceptance Criteria

1. Perplexity SHALL be displayed prominently.
2. The label SHALL clearly state “Perplexity”.
3. The numeric value SHALL be formatted to 2 decimals.

---

## Requirement 8: Logprob Line Chart

### Acceptance Criteria

1. The system SHALL render a line chart using Chart.js.
2. X-axis: Token index.
3. Y-axis: Logprob value.
4. Y-axis SHALL automatically scale to include all values.
5. Axis labels SHALL be visible.

---

## Requirement 9: Error Handling

### Acceptance Criteria

1. API errors SHALL be displayed to users.
2. Rate limit errors SHALL show a clear message.
3. Sensitive data SHALL NOT be exposed.
4. Unexpected errors SHALL be logged server-side.

---

## Requirement 10: Security

### Acceptance Criteria

1. API key SHALL NOT be exposed to client-side.
2. API key SHALL NOT be logged.
3. API requests SHALL go through backend only.

---

## Requirement 11: Documentation

### Acceptance Criteria

1. A README SHALL include:
- Setup steps
- Required environment variables
- Install instructions
- Run instructions
2. Code SHALL include comments explaining API response structure.
3. README SHALL include future extension ideas:
- Temperature comparison
- top_logprobs visualization
- Export to CSV

---

# 6. Non-Functional Requirements

1. The system SHALL run locally.
2. Setup time SHALL be under 10 minutes.
3. Codebase SHALL remain under 500 lines (excluding dependencies).
4. UI SHALL load within 2 seconds on a local machine.

---

# 7. Out of Scope (Phase 2)

- Multi-result comparison
- Historical storage
- User authentication
- Cloud deployment
- Advanced statistical metrics

---

# MVP Definition of Done

The MVP is complete when:

- A user inputs text
- Generated text appears
- Token logprobs appear in a table
- Perplexity is calculated correctly
- Line chart renders correctly
- No API key leakage occurs