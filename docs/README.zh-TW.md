# Daily Paper Report

本專案在 Nano 上以 Docker 執行每日論文收集、全文擷取、MiMo-V2.6-Pro 評分與繁中導讀，
再把通過驗證的報告資料（`api/`）推送到 `gh-pages`；React 閱讀器由 `Tagged reviewed report`
workflow 建置並部署到同一分支，由 GitHub Pages 提供網站服務。

- 選論文（評分）與週報／月報摘要：`xiaomi/mimo-v2.6-pro`（OpenRouter，`LLM_*` 設定）。
- 繁中標題與導讀翻譯：`deepseek-v4-flash`（DeepSeek 官方 API，`TRANSLATION_*` 設定），不使用 OpenRouter。
- 論文全文只保存在 Nano，不推送或公開。
- 每日 00:00、週一 00:30、每月 1 日 01:00 UTC 執行。
- SQLite 與小型 JSON cache 備份至 `state` branch。
- 僅有效的 `YYYY.MM.DD.N` tag push 會建置並發布已審閱的公開資料封包；`main`、PR 與手動觸發皆停用。CI 不收集、評分或翻譯。見 [tag 發布流程](TAG-DEPLOYMENT.md)。

完整開發、部署與操作命令請參考 [README](../README.md)，復原程序請參考
[RESET-GUIDE](RESET-GUIDE.md)。

若 SSH 帳號無法免密碼執行 sudo，可將專案放在 `~/daily-paper-report/app`，
再執行 `scripts/install-nano-user.sh`。此模式使用
使用者 crontab 與 uv 管理的 Python 3.13；dispatcher 每 30 分鐘喚醒一次，
但只會在上述精確 UTC 時間啟動任務。


歷史重跑可匯出完整候選，由離線審閱檔提供評分及繁中導讀，不呼叫模型 API；缺少審閱時停止。操作與限制見 [離線審閱流程](ASSISTANT-REVIEW.md)。
