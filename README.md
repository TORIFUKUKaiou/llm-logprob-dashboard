# LLM Logprob Dashboard

OpenAI Responses APIを利用し、生成テキストの各トークンに対応するlog probability（logprob）を取得・可視化する簡易分析ツール。

LLMの生成過程における「確信度」と「迷い」を数値および視覚情報として提示し、プロンプト改善やモデル挙動の理解を支援します。

## 特徴

- **トークンレベルの可視化**: 各トークンのlogprob値をテーブルとグラフで表示
- **迷いの可視化**: トークンごとの`top_logprobs`候補を確認可能
- **統計指標**: Perplexity（パープレキシティ）と平均logprobを自動計算
- **温度調整**: Temperature（0.0〜2.0）を調整して生成の多様性を制御
- **シンプルな構成**: Node.js + Express + Vanilla JavaScript
- **セキュア**: API Keyはサーバー側のみで管理

## 必要要件

- Node.js（v18以上推奨）
- OpenAI API Key（logprobs対応モデル: `gpt-4o-mini`）

## セットアップ

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd llm-logprob-dashboard
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env.example`をコピーして`.env`ファイルを作成し、OpenAI API Keyを設定します。

```bash
cp .env.example .env
```

`.env`ファイルを編集：

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
# Optional (default: gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini
```

**重要**: `.env`ファイルは`.gitignore`に含まれており、リポジトリにコミットされません。

### 4. サーバーの起動

```bash
npm start
```

サーバーが起動したら、ブラウザで以下にアクセス：

```
http://localhost:3000
```

## 使い方

1. **プロンプト入力**: テキストエリアに生成させたいプロンプトを入力
2. **温度調整**: スライダーで Temperature（0.0〜2.0）を調整
   - 低い値（0.0〜0.5）: より確定的で一貫性のある出力
   - 高い値（1.0〜2.0）: より創造的で多様な出力
3. **生成実行**: 「Generate」ボタンをクリック
4. **結果確認**:
   - 生成されたテキスト
   - Perplexity値（モデルの予測不確実性）
   - トークンごとのlogprob値（テーブル）
   - Logprobの推移グラフ
   - Top Logprobs Explorer（候補トークンの比較）

### Logprobの読み方

- **Logprob値**: 自然対数による確率値（通常は負の値）
  - 0に近い（例: -0.1）: 高い確信度
  - 負に大きい（例: -5.0）: 低い確信度、モデルが迷っている
- **ハイライト**: logprob < -2.0 のトークンは警告色で表示
- **Top Logprobs Explorer**: トークン行やグラフ点をクリックすると、その位置であり得た候補トークンと確率（近似）を表示

### Perplexityの読み方

- **定義**: `perplexity = exp(-average_logprob)`
- **値の意味**:
  - 低い値（1に近い）: モデルの予測が鋭い
  - 高い値: モデルの予測が不確実

## プロジェクト構成

```
llm-logprob-dashboard/
├── server.js              # Expressサーバー、OpenAI API統合
├── public/                # フロントエンド静的ファイル
│   ├── index.html         # メインUI
│   ├── app.js             # API連携/描画ロジック
│   └── styles.css         # スタイル
├── fixtures/
│   └── response.json      # OpenAIレスポンスfixture
├── tests/                 # バックエンドのユニット/統合テスト
├── package.json          # 依存関係とスクリプト
├── .env.example          # 環境変数テンプレート
├── .env                  # 環境変数（要作成、gitignore対象）
├── .gitignore            # Git除外設定
└── README.md             # このファイル
```

## API仕様

### POST `/api/generate`

プロンプトを送信し、logprob付きの生成結果を取得します。

**リクエスト**:

```json
{
  "prompt": "Hello, how are you?",
  "temperature": 0.7
}
```

**レスポンス（成功時）**:

```json
{
  "generatedText": "I'm doing well, thank you!",
  "tokens": [
    {
      "index": 0,
      "token": "I",
      "logprob": -0.1234
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
```

**レスポンス（エラー時）**:

```json
{
  "error": "エラーメッセージ",
  "code": "VALIDATION_ERROR | CONFIG_ERROR | OPENAI_ERROR | PARSE_ERROR"
}
```

## トラブルシューティング

### API Keyエラー

```
{
  "error": "OPENAI_API_KEY is not configured",
  "code": "CONFIG_ERROR"
}
```

→ `.env`に`OPENAI_API_KEY`を設定してサーバーを再起動してください。

### ポート競合

```
Error: Port 3000 is already in use
```

→ `.env`ファイルで`PORT`を別の値（例: 3001）に変更してください。

### Logprobsが返らない

→ 使用しているモデルがlogprobs対応か確認してください。本プロジェクトは`gpt-4o-mini`を使用しています。

## セキュリティ

- API Keyは**サーバー側のみ**で管理され、クライアントに露出しません
- API Keyはログに出力されません
- すべてのOpenAI APIリクエストはバックエンド経由で実行されます

## 将来の拡張アイデア

本MVPは1日で完成可能な最小構成です。以下の機能拡張が可能です：

### Phase 2候補

- **温度比較機能**: 同じプロンプトで複数の温度設定を並べて比較
- **Top Logprobs表示**: 各位置で「他にあり得た候補トークン」を表示（top 5など）
- **CSVエクスポート**: トークンとlogprobデータをCSV形式でダウンロード
- **履歴保存**: 過去の生成結果をブラウザに保存して再表示
- **プロンプトテンプレート**: よく使うプロンプトをテンプレート化
- **高度な統計**: エントロピー、条件付き確率などの追加指標
- **モデル選択UI**: 複数のモデルを切り替えて比較

### Phase 3候補

- **ユーザー認証**: 複数ユーザーでの利用
- **データベース統合**: 生成履歴の永続化
- **クラウドデプロイ**: Heroku、Vercel等へのデプロイ
- **リアルタイムストリーミング**: トークン生成をリアルタイム表示

## ライセンス

MIT

## 貢献

Issue、Pull Requestを歓迎します。

---

**心中の賊を破るは難し。しかし、紙に書く。数字で見る。可視化で切り拓く。**
