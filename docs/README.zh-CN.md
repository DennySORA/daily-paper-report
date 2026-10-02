# Daily Paper Report

项目在 Nano 上通过 Docker 执行论文收集、全文提取、MiMo-V2.6-Pro 评分和繁体中文导读，
验证后将报告数据（`api/`）推送到 `gh-pages`；React 阅读器由 `Frontend` workflow
构建并部署到同一分支，由 GitHub Pages 提供网站服务。

- 选论文（评分）与周报／月报摘要：`xiaomi/mimo-v2.6-pro`（OpenRouter，`LLM_*` 设置）。
- 繁体中文标题与导读翻译：`deepseek-v4-flash`（DeepSeek 官方 API，`TRANSLATION_*` 设置），不使用 OpenRouter。
- 论文全文只保存在 Nano，不推送或公开。
- 每日 00:00、周一 00:30、每月 1 日 01:00 UTC 执行。
- SQLite 和小型 JSON 缓存备份到 `state` branch。
- `main` 上的 `frontend/` 变更由 GitHub Actions 验证并部署，不修改 `api/`。

开发与部署命令见 [README](../README.md)，恢复步骤见 [RESET-GUIDE](RESET-GUIDE.md)。


历史重跑可导出完整候选，通过离线审阅文件提供评分与繁体中文导读，不调用模型 API；缺少审阅时停止。操作与限制见 [离线审阅流程](ASSISTANT-REVIEW.md)。
