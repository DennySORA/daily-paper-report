# 由 release 分支發布已審閱日報

`frontend.yml` 只接受 `release` 分支的 push。`main`、tag、PR、排程及手動 workflow dispatch 都不啟動發布。收集、全文閱讀、評分、選文與翻譯必須先完成；工作流程只驗證既有公開封包、建置網站外框及部署，不呼叫來源收集器或模型 API。

## 封包與權限

- `prepared-release/manifest.json` 固定公開路徑、長度、SHA256、Git blob ID、預期 `gh-pages` 基底及最新日報日期。
- `prepared-release/payload/` 不含全文、來源請求、私有快取、SQLite 或憑證。
- 目前封包為 2026-09-30：933 個候選、932 筆評分、96 篇繁中導讀、95 組中英評分理由，以及一筆依原規則略過評分的模型發布；最新日報仍是 2026-10-02。
- 驗證工作只有 `contents: read`；發布工作使用既有 `contents: write`、`pages: write`，不新增永久憑證或變更 Pages 設定。

## 發布與重播防護

1. 驗證確切事件與分支、封包雜湊、公開欄位及離線發布防護測試。
2. 按 lockfile 安裝 frontend 依賴，執行型別、lint、格式、測試及 build。
3. 讀取既有 Pages 設定，要求分支型發布來源為 `gh-pages` 根目錄、網域為 `paper.dennysora.me`；不符即停止，不自動修改設定。
4. 要求 Pages checkout 乾淨，檢查 CNAME、`.nojekyll`、最新日期與所有目的路徑。基底必須與 manifest 相同。
5. 唯一重播例外：若基底已前進，但所有封包和本次建置外框的位元組都已完全相同，回傳 `already_published: true`，不寫檔、不建立 commit。任何資料或外框差異仍拒絕過期基底；先重新準備完整封包，不能只改基底 SHA。
6. 只疊加允許的公開 JSON 與外框；保留其他日報、週報／月報、舊 assets、CNAME 及較新的 `daily.json`。推送前再比對遠端 SHA，使用一般 fast-forward push，絕不 force-push。
7. 明確要求 GitHub Pages build，並核對完成的 SHA 和目前遠端 SHA。重播也驗證 build，能恢復「推送成功但先前 Pages build 失敗」的情況。API 錯誤、build 失敗、被其他發布取代或逾時皆停止，不宣稱成功。

工作流程使用同一個序列化 concurrency 群組，不取消正在發布的工作。外部 Nano 發布器不受本次修改停用；若它改動資料，基底與遠端 SHA 防護會阻止舊封包覆蓋新資料。

## 本機驗證

以下命令不推送：

```bash
python3 scripts/release-prepared.py validate \
  --release-dir prepared-release --ref-name release
python3 -m unittest discover -s tests/release -p 'test_*.py' -v
cd frontend
pnpm install --frozen-lockfile
pnpm run verify
```

驗證工具只依賴 Python 標準函式庫；完整後端仍需 Python 3.13。Node.js 與 pnpm 版本依 frontend manifest 和 lockfile。

## 推送完成的版本

先確認來源 commit 已包含最新封包並完成本機驗證，再以該完整 SHA 更新 `release`。若分支已存在，更新必須是 fast-forward；不要覆寫其他人的來源提交。推送 `main` 本身不發布。

```bash
git fetch origin main release
SOURCE_COMMIT='<已驗證的完整來源 commit SHA>'
git show --stat "$SOURCE_COMMIT"
git push origin "$SOURCE_COMMIT:refs/heads/release"
```

第一次尚無 `release` 分支時，只 fetch `main`，再用相同 push 指令建立分支。完成後檢查該來源 SHA 的 Actions 結果、Pages SHA，以及 [9/30 日報](https://paper.dennysora.me/#/day/2026-09-30)。後續逐日發布仍需先完成該日全部候選審閱和原始選文程序。

GitHub 說明指出 `GITHUB_TOKEN` 推送本身不會觸發 Pages build，參考[發布來源文件](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)及 [Pages build API](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build)。
