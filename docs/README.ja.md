# Daily Paper Report

Nano 上の Docker で論文収集、全文抽出、MiMo-V2.6-Pro 評価、繁体字中国語ガイドを実行し、
検証済みのレポートデータ（`api/`）を `gh-pages` に push します。React リーダーは
`Frontend` workflow がビルドして同じブランチに配置し、GitHub Pages から公開します。

- 論文の選定（評価）と週報・月報の要約：`xiaomi/mimo-v2.6-pro`（OpenRouter、`LLM_*` 設定）。
- 繁体字中国語のタイトルとガイドの翻訳：`deepseek-v4-flash`（DeepSeek 公式 API、`TRANSLATION_*` 設定）。OpenRouter は使いません。
- 論文全文は Nano にだけ保存し、GitHub には公開しません。
- UTC の毎日 00:00、月曜 00:30、毎月 1 日 01:00 に実行します。
- SQLite と小さな JSON cache は `state` branch にバックアップします。
- `main` の `frontend/` 変更は GitHub Actions が検証・配置し、`api/` には触れません。

開発・配置手順は [README](../README.md)、復旧手順は
[RESET-GUIDE](RESET-GUIDE.md) を参照してください。


過去の候補全体をエクスポートし、モデル API を呼ばずにオフラインの評価と繁体字中国語ガイドを適用できます。評価が不足している場合は停止します。手順と制約は [オフライン評価](ASSISTANT-REVIEW.md) を参照してください。
