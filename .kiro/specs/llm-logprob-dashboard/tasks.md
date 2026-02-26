# Implementation Plan: LLM Logprob Dashboard (MVP)

> 迷いを可視化せよ。  
> logprob は嘘をつかない。  
> 1日で動くものを作る。その後に磨く。

---

## Overview

本タスクリストは、OpenAI **Responses API** を利用し、トークンレベルの logprob を取得・可視化する Web アプリケーションを実装するための計画である。

技術スタック:

- Node.js + Express（Backend）
- Vanilla JavaScript（Frontend）
- Chart.js（可視化）
- OpenAI Responses API

スコープは **1日で完成可能なMVP** に限定する。

---

# 実装フェーズ構成

- Phase 1: バックエンド完成（午前）
- Phase 2: フロントエンド実装（午後前半）
- Phase 3: 可視化と仕上げ（午後後半）
- Phase 4: ドキュメント整備

---

# CORE TASKS（必須）

---

## 1. プロジェクトセットアップ

- [x] ディレクトリ構造作成
- [x] `package.json` 作成（express, dotenv）
- [x] `.env.example` 作成（OPENAI_API_KEY, PORT）
- [x] `.gitignore` 作成（node_modules, .env）
- [x] `README.md` ベース作成（セットアップ・実行方法）

---

## 2. バックエンド基盤

### 2.1 Express サーバー構築

- [x] `server.js` 作成
- [x] `dotenv` 読み込み
- [x] `OPENAI_API_KEY` 存在チェック（未設定なら起動時エラー）
- [x] `express.json()` 設定
- [x] `public/` 静的配信設定
- [x] サーバ起動処理

---

## 3. OpenAI Responses API 統合

### 3.1 OpenAI 呼び出し実装

- [x] `/v1/responses` を呼ぶ関数実装
- [x] model: `gpt-4o-mini`
- [x] include: `["message.output_text.logprobs"]`
- [x] temperature を受け取る
- [x] エラー分類（401, 429, 5xx → OPENAI_ERROR）

---

### 3.2 実レスポンス固定

- [x] 実際の OpenAI レスポンスを `fixtures/response.json` に保存
- [x] その構造に合わせて抽出ロジックを実装

---

### 3.3 Logprob 抽出ロジック

- [x] 出力テキスト抽出
- [x] トークン配列抽出（token, logprob）
- [x] 順序保持
- [x] logprobs 欠落時は `PARSE_ERROR`

---

## 4. 統計計算

### 4.1 メトリクス計算

- [x] average_logprob = Σ/N
- [x] perplexity = exp(-average_logprob)
- [x] 小数精度制御（perplexity: 2桁 / logprob: 4桁）
- [x] 空配列処理

---

## 5. API エンドポイント

### 5.1 POST `/api/generate`

- [x] prompt 空チェック
- [x] temperature 範囲チェック（0.0–2.0）
- [x] OpenAI 呼び出し
- [x] 抽出処理
- [x] 統計計算
- [x] レスポンス整形

返却形式:

```json
{
  "generatedText": "...",
  "tokens": [...],
  "statistics": {...},
  "meta": {...}
}

	•	エラーコード統一定義
	•	VALIDATION_ERROR
	•	CONFIG_ERROR
	•	OPENAI_ERROR
	•	PARSE_ERROR

⸻

6. Backend Checkpoint
	•	curl または Postman で動作確認
	•	logprob が返ること確認
	•	perplexity が計算されること確認

⸻

フロントエンド

⸻

7. HTML + CSS
	•	public/index.html
	•	prompt textarea
	•	temperature slider
	•	submit button
	•	出力表示領域
	•	テーブル領域
	•	グラフ canvas
	•	Chart.js CDN 追加
	•	ハイライト用CSS（logprob < -2.0）

⸻

8. 基本 JS 実装
	•	public/app.js
	•	フォーム送信処理
	•	temperature 値表示更新
	•	prompt 空チェック（クライアント側）
	•	ローディング表示

⸻

9. API連携
	•	fetch('/api/generate')
	•	エラー表示処理
	•	生成テキスト表示（改行保持）

⸻

10. 統計表示
	•	Perplexity を強調表示
	•	Average logprob 併記

⸻

11. テーブル生成
	•	token 行生成
	•	index / token / logprob 表示
	•	logprob < -2.0 ハイライト

⸻

12. Chart.js 可視化
	•	折れ線グラフ生成
	•	X軸: index
	•	Y軸: logprob
	•	軸ラベル表示
	•	既存 Chart を destroy してから再描画

⸻

13. Frontend Checkpoint
	•	UI動作確認
	•	グラフ描画確認
	•	エラー時の表示確認

⸻

仕上げ

⸻

14. README 完成
	•	セットアップ手順
	•	環境変数説明
	•	npm install
	•	npm start
	•	使用例
	•	将来拡張案（温度比較、top_logprobs表示）

⸻

15. 最終チェック
	•	APIキーがフロントに露出していない
	•	コード 500行以内（依存除く）
	•	MVP動作確認

⸻

OPTIONAL TASKS（時間があれば）
	•	統計関数ユニットテスト
	•	APIエンドポイント統合テスト
	•	top_logprobs表示
	•	直近3件比較機能
	•	CSVエクスポート

⸻

Notes
	•	実装は「動くものを最速で」。
	•	テストは統計関数のみ必須。
	•	実レスポンス固定 → 抽出実装 が最短ルート。
	•	セキュリティ最優先（API Keyはサーバ側のみ）。

⸻

MVP Definition of Done
	•	prompt 入力 → 生成される
	•	token + logprob が見える
	•	perplexity が表示される
	•	折れ線グラフが描画される
	•	エラー時に崩れない

⸻

迷わず行けよ。
logprob を見よ。
行けば、わかる。

