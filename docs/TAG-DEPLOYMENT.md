# 僅由版本 tag 發布已審閱日報

`frontend.yml` 只接受 `YYYY.MM.DD.N` 格式的 tag push。`N` 是從 1 開始、沒有前導零的正整數，日期必須有效；例如 `2026.10.03.1`。Tag 日期是發布版本日期，不必等於日報日期。推送 `main`、PR、排程及手動 workflow dispatch 都不啟動這個工作流程。

## 資料與權限界線

- 收集、全文閱讀、評分、選文與翻譯在發布前完成。CI 不執行 `digest`、來源收集器、翻譯器或任何模型 API。
- 已審閱的公開資料放在 `prepared-release/payload/`；`manifest.json` 固定允許路徑、位元組長度、SHA256、Git blob ID、預期的 `gh-pages` 基底及最新日報日期。
- 目前封包是 2026-09-30：933 個候選、932 筆評分、96 篇繁中導讀、95 組中英評分理由，另有一筆維持原始略過規則的模型發布。它保留 2026-10-02 為最新日報。
- 封包不含論文全文、來源請求、審閱工作區、憑證、SQLite 或私有快取。CI 驗證公開欄位及雜湊，不重新評分。
- 驗證工作只有 `contents: read`。發布工作只有 `contents: write`、`pages: write`，不申請管理員或新的永久憑證。

## 安全發布順序

1. 驗證 tag、公開封包及離線發布防護測試。
2. 使用鎖定依賴執行 frontend 的型別、lint、格式、測試與 build。
3. 讀取既有 `gh-pages`。HEAD 必須與封包的 `baseline_commit` 完全相同，而且工作目錄必須乾淨；不符即停止。
4. 只覆蓋封包列出的日報、審閱稽核、catalog、search，以及剛建置的網站外框。新舊 assets 可共存；不刪除其他歷史日報、週報／月報、舊 assets、CNAME 或較新的 `daily.json`。
5. 再讀取遠端基底，建立一般 commit 並 fast-forward push；不 force-push，不自動改用新基底覆蓋。
6. 明確要求既有 GitHub Pages 分支型網站進行 build，並確認完成的 commit 與本次推送 SHA 一致。API 失敗、build 錯誤或逾時都使工作失敗，不宣稱網站已更新。

GitHub 說明指出，使用 `GITHUB_TOKEN` 推送不會自行觸發 Pages build，因此不能把 push 成功當作發布成功。請參考[發布來源文件](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)與[Pages build API](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build)。工作流程不變更 Pages 設定或自訂網域。

## 本機檢查

發布驗證工具只使用 Python 標準函式庫，已在 Python 3.12 與 3.13 測試；完整後端仍依專案要求使用 Python 3.13。另需 Git，以及 frontend 指定版本的 Node.js／pnpm。這些命令不推送任何內容：

```bash
python3 scripts/release-prepared.py validate \
  --release-dir prepared-release --tag 2026.10.03.1
python3 -m unittest discover -s tests/release -p 'test_*.py' -v
cd frontend
pnpm install --frozen-lockfile
pnpm run verify
```

目前封包的 `gh-pages` 基底是 `0e11b9730c63ed41fa6a1c7904e4f336e6e66220`。若遠端已前進，先以最新歷史資料重新準備封包並驗證；不要只改掉基底 SHA。已完成的論文閱讀與評分不需要重跑。

## 人工推送 tag

先確認含新工作流程、驗證器與封包的來源 commit 已在遠端，並以實際驗證的完整 SHA 取代下方佔位文字。不要將 tag 指向舊 commit；舊版本仍可能保留不同的觸發規則。

```bash
git fetch origin main --tags
SOURCE_COMMIT='<已驗證的完整來源 commit SHA>'
TAG='2026.10.03.1'
git show --stat "$SOURCE_COMMIT"
git ls-remote --tags origin "refs/tags/$TAG"
# 上一行必須沒有同名 tag；有結果時請改用尚未使用的 N，不要覆寫。
git tag -a "$TAG" "$SOURCE_COMMIT" -m "Release $TAG"
git push origin "refs/tags/$TAG"
```

工作流程不替使用者建立 tag。推送後在 GitHub Actions 檢查該 tag 的兩個工作，以及最後的 Pages commit 驗證，再開啟 [9/30 日報](https://paper.dennysora.me/#/day/2026-09-30)。若 Git push 已成功但 Pages build 失敗，舊封包的基底已過期；重新準備對應現況的封包後使用新的 tag，不要盲目重跑或 force-push。

此修改不會停用其他電腦上的舊 Nano timers 或 cron。若那些程序仍會寫入 `gh-pages`，本流程的基底防護會拒絕過期封包；應另行確認它們的停用／遷移安排。
