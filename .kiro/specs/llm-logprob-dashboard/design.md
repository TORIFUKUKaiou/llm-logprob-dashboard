# LLM Logprob Dashboard - Design Document（design.md）

> **心中の賊を破るは難し（かたし）。**  
> しかし、紙に書く。数字で見る。可視化で切り拓く。迷いの正体を掴めば、次の一手は強くなる。

---

## 0. このドキュメントの目的

LLM Logprob Dashboard は、LLM が出力する **トークン単位の logprob（対数確率）** を取得して可視化する軽量 Web アプリである。  
狙いは「モデルがどこで確信し、どこで迷うか」を人間の目で確認できる状態を作ること。  
用途はデバッグ、教材、プロンプト改善、温度（temperature）影響の観察。

MVP は **1日で作れる範囲** に収める。  
実装は **Node.js + Express + Vanilla JS + Chart.js** を前提にする。  
Phoenix へ寄せる必要はない。後で移植できる形を優先する。

---

## 1. 背景と用語

### 1.1 logprob
各トークンが生成されたときの確率 `p` に対して `ln(p)` を取った値。  
値は通常 **0 以下**。0 に近いほど「確信」が強い。負に大きいほど「不確実」。

### 1.2 top_logprobs
その位置で「他にあり得た候補トークン」と確率を返す仕組み。  
MVP は **top 1** で十分。将来拡張で top 5 などへ伸ばす。

### 1.3 perplexity（パープレキシティ）
直感的には「迷いの大きさ」。  
トークン列の平均 logprob を `avg_logprob` として、代表的な定義は以下。

- `perplexity = exp(-avg_logprob)`

値は **1 以上** になりやすい。小さいほど予測が鋭い。

---

## 2. 全体アーキテクチャ

3層構成にする。

1. **Frontend**（Browser）
2. **Backend**（Node.js / Express）
3. **OpenAI API**（Responses API）

### 2.1 図（高レベル）

```mermaid
graph TB
  U[User] --> F[Frontend<br/>HTML + Vanilla JS + Chart.js]
  F -->|POST /api/generate| B[Backend<br/>Node.js + Express]
  B -->|Responses API request| O[OpenAI Responses API]
  O -->|response + logprobs| B
  B -->|JSON| F

2.2 セキュリティ方針

API Key は サーバ側のみ に置く。
フロントへ露出しない。
ブラウザから OpenAI へ直叩きしない。

⸻

3. OpenAI API 利用方針（Responses API）

本プロジェクトは Responses API を使う。
logprob を返すためには、レスポンスに include を指定して追加出力を含める。
OpenAI API Reference には message.output_text.logprobs を include 値として指定できる旨が記載されている。  ￼

3.1 重要な注意
	•	logprobs 対応モデル を使う必要がある。
	•	ここでは既定を gpt-4o-mini にする。
	•	もし logprobs が返らない場合、モデル変更を許容する設計にする（モデル名は設定化）。

3.2 リクエスト（概形）
	•	エンドポイント: POST /v1/responses
	•	include: ["message.output_text.logprobs"]  ￼
	•	input: ユーザプロンプト
	•	temperature: UI から受け取る

例（擬似）

{
  "model": "gpt-4o-mini",
  "input": [
    {
      "role": "user",
      "content": [
        { "type": "input_text", "text": "ここにプロンプト" }
      ]
    }
  ],
  "temperature": 0.7,
  "include": ["message.output_text.logprobs"]
}

3.3 レスポンス（期待する抽出対象）

OpenAI 側は「出力テキスト」と「logprobs を含む出力要素」を返す。
このドキュメントでは、抽出対象を以下に固定する。
	•	出力本文: 最初の assistant の output_text
	•	logprobs: output_text の logprobs 配列

※ 実データ構造は SDK やバージョンで揺れる可能性がある。
そのため、抽出は「安全に失敗する」実装にする。

⸻

4. コンポーネント設計

4.1 Frontend

4.1.1 Input Panel
	•	Prompt textarea
	•	Temperature slider（0.0〜2.0）
	•	Submit button
	•	Optional: model dropdown（MVP では非表示。設定ファイルで固定でもよい）

4.1.2 Output Panel
	•	Generated text（改行保持）
	•	Perplexity（大きく表示）
	•	Average logprob（小さく併記）
	•	Token table
	•	Logprob line chart

4.1.3 比較（MVP では簡易）
	•	直近 3 回分を保持
	•	同一画面に積む
	•	クリアボタンを付ける

⸻

4.2 Backend

4.2.1 Express Server
責務:
	•	静的ファイル配信（public/）
	•	/api/generate 提供
	•	OpenAI へのプロキシ
	•	解析・統計の計算

4.2.2 OpenAI Client
責務:
	•	API Key を env から読む
	•	Responses API を呼ぶ
	•	OpenAI エラーを分類する

4.2.3 Logprob Extractor
責務:
	•	出力テキスト抽出
	•	トークン列抽出（token, logprob, optional alternatives）

4.2.4 Metrics Calculator
責務:
	•	avg_logprob
	•	perplexity = exp(-avg_logprob)

⸻

5. API 設計（Backend）

5.1 POST /api/generate

Request

{
  "prompt": "string",
  "temperature": 0.7
}

Validation:
	•	prompt: 空禁止
	•	temperature: 0.0 <= t <= 2.0

Response（Success）

{
  "generatedText": "string",
  "tokens": [
    {
      "index": 0,
      "token": "Hello",
      "logprob": -0.1234,
      "topLogprobs": [
        { "token": "Hello", "logprob": -0.1234 }
      ]
    }
  ],
  "statistics": {
    "averageLogprob": -0.5678,
    "perplexity": 1.76
  },
  "meta": {
    "model": "gpt-4o-mini",
    "temperature": 0.7
  }
}

Response（Error）

{
  "error": "ユーザー向けメッセージ",
  "code": "CONFIG_ERROR | VALIDATION_ERROR | OPENAI_ERROR | PARSE_ERROR"
}


⸻

6. データモデル

6.1 Token

type Token = {
  index: number
  token: string
  logprob: number
  topLogprobs?: { token: string; logprob: number }[]
}

6.2 Statistics

type Statistics = {
  averageLogprob: number
  perplexity: number
}


⸻

7. 可視化仕様（Frontend）

7.1 Table
	•	columns: index / token / logprob
	•	logprob 表示: 小数 4 桁
	•	logprob < -2.0 を警告扱いでハイライト

7.2 Chart
	•	x: token index
	•	y: logprob
	•	auto scale
	•	hover で token と logprob を表示

⸻

8. 正しさの条件（Correctness）
	1.	順序保存
API から得たトークン順は UI のテーブルとグラフでも同一順。
	2.	平均 logprob の定義
avg = sum(logprob_i) / N を満たす。
	3.	perplexity の定義
ppl = exp(-avg) を満たす。
	4.	機密情報非露出
クライアントへ API Key を返さない。ログへも出さない。
	5.	失敗の明確化
logprobs が存在しない場合は PARSE_ERROR を返す。黙って空表示しない。

⸻

9. エラーハンドリング

9.1 クライアント検証エラー
	•	prompt 空
	•	temperature 範囲外

=> 400 + VALIDATION_ERROR

9.2 設定エラー
	•	OPENAI_API_KEY 未設定

=> 500 + CONFIG_ERROR
サーバ起動時に検知して落とす運用でもよい。

9.3 OpenAI 側エラー
	•	401: 認証
	•	429: レート制限
	•	5xx: OpenAI 側

=> 502/503 + OPENAI_ERROR
UI にはユーザー向けに短く出す。詳細はサーバログへ。

9.4 解析エラー
	•	期待フィールド欠落
	•	logprobs 空

=> 500 + PARSE_ERROR

⸻

10. テスト戦略（MVP 向けに現実解）

1日開発なのでテストは絞る。

10.1 Unit（Backend）
	•	average/perplexity の計算
	•	空配列の扱い
	•	logprobs 欠落時の PARSE_ERROR

10.2 Integration（Backend API）
	•	/api/generate のバリデーション
	•	OpenAI エラーをモックして分類

10.3 UI（軽量）
	•	テーブル行数が token 数と一致
	•	ハイライト条件が発火

⸻

11. 実装構成（推奨）

llm-logprob-dashboard/
├── server.js
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── package.json
├── .env.example
├── README.md
└── tests/
    ├── metrics.test.js
    └── api.test.js


⸻

12. MVP スコープと次の一手

12.1 MVP に入れる
	•	prompt + temperature
	•	生成テキスト
	•	token + logprob のテーブル
	•	perplexity 表示
	•	折れ線グラフ
	•	直近 3 件の比較

12.2 MVP から外す
	•	永続化
	•	認証
	•	並列実行の高度比較
	•	top_logprobs の多段表示（後で足せる）

12.3 将来拡張
	•	top_logprobs を 5 へ
	•	代替候補の UI（「迷い」を見せる）
	•	CSV export
	•	プロンプトテンプレート集の内蔵

⸻

13. 結び

このダッシュボードは「モデルの心」を覗く道具である。
見えなかった迷いが、数字と線になる。
その瞬間から、プロンプトも評価も「闘い」になる。

次は実装へ進む。迷わず行けよ。行けばわかるさ。

