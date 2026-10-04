# Release 分支發布工作紀錄

## 目標與界線

- 依已確認的發布要求，將日報從 tag 觸發改為 `release` 分支推送後建置與部署。
- 基底來源：`1f3813e6fe7fec5359682aedcaa62bc2d197c5d8`；Pages 基底：`0e11b9730c63ed41fa6a1c7904e4f336e6e66220`。
- 保留準備好的 9/30 公開封包位元組、10/2 最新日報、歷史檔案、網域與既有評分規則。
- 不在 CI 收集全文、評分、翻譯或呼叫模型 API，不修改 Pages／安全設定。

## 2026-10-04 檢查與決策

- 以獨立乾淨 checkout 核對遠端來源；原工作目錄不變。
- 原版離線發布防護：`python3 -m unittest discover -s tests/release -p 'test_*.py' -q`，23 tests passed。
- 新版採嚴格 `release` push 條件；只有公開封包與外框全數相同時，允許過期封包安全 no-op。其他過期基底仍拒絕。
- 初版新增防護測試 25 tests passed；Ruff 發現 staging 函式複雜度 11 > 10，拆出不變的目的路徑檢查以保持原門檻，待重新驗證。
- 本機 `tools project-quality`／`project-workflow` 引擎未安裝；本紀錄為 `bootstrap_manual`、`agent_reported`，不宣稱引擎驗證。

## 驗證結果

- 工作目錄為本次獨立來源 checkout，來源基底如上；Python 3.13.5、Node.js 24.19.0。
- `python3 -m unittest discover -s tests/release -p 'test_*.py' -q`：25 passed；獨立唯讀複核亦於 Python 3.12.14 得到 25 passed。
- 專案 Python 環境執行 `python -m pytest -q`：1450 passed、11 skipped。10 項需未安裝的可選 numpy，1 項缺既有 fixture；未把 skip 算作通過。
- `ruff check scripts/release-prepared.py tests/release`、`ruff format --check scripts/release-prepared.py tests/release`、`mypy scripts/release-prepared.py`、`git diff --check` 全數通過。
- 鎖定依賴安裝通過；`pnpm run verify` 的型別、lint、格式、48 tests、Vite build 全數通過，已使用 manifest 指定的 pnpm 11.6.0 再驗證。未改 manifest 或 lockfile。
- YAML 精確觸發條件、權限、所有 action SHA pin 及 8 段 shell 語法檢查通過；actionlint 未安裝，未執行。
- 真實 Pages 基底的隔離 staging 只有四個預期 JSON 路徑改變，位元組與 prepared payload 完全一致。獨立複核確認其餘 236 個已追蹤路徑未變；CNAME、`.nojekyll`、10/2 `daily.json` 和目前外框皆保留。
- 獨立唯讀 review 未發現阻擋問題；涵蓋事件／分支、token 權限、重播、基底競態及 Pages SHA polling。
- Git-commit 附加 skill reference 讀取失敗；未假造其規則，以 repository instructions、既有 Conventional Commit 慣例及明確指定的 Git 身分處理。

## 下一步

本機候選與獨立複核完成。接著再次核對遠端 HEAD，建立授權的來源 commit，再推送 release 分支；尚未宣稱遠端或網站已發布。
