# Daily Paper Report

Nano 上の Docker で論文収集、全文抽出、DeepSeek 評価、繁体字中国語ガイドを実行し、
検証済みのレポートデータ（`api/`）を `gh-pages` に push します。React リーダーは
`Frontend` workflow がビルドして同じブランチに配置し、GitHub Pages から公開します。

- LLM は 1M context 対応の `deepseek-v4-flash` のみです。
- 論文全文は Nano にだけ保存し、GitHub には公開しません。
- UTC の毎日 00:00、月曜 00:30、毎月 1 日 01:00 に実行します。
- SQLite と小さな JSON cache は `state` branch にバックアップします。
- `main` の `frontend/` 変更は GitHub Actions が検証・配置し、`api/` には触れません。

開発・配置手順は [README](../README.md)、復旧手順は
[RESET-GUIDE](RESET-GUIDE.md) を参照してください。
