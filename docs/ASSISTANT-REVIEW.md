# 不透過模型 API 的歷史重跑

此流程保留既有來源資料、StoryLinker、六項評分權重、擷取品質折扣、StoryRanker、配額與 JsonRenderer。評分及繁體中文導讀改由離線 JSON 審閱結果提供，程式不建立模型 API 用戶端，也不會在缺件時回退到舊 API 分數。

## 步驟

在專案根目錄使用既有 Python 環境：

```bash
python -m src.cli.assistant_review export --workspace runtime/review --state runtime/snapshots/DAY.sqlite --archive runtime/public/api/day/DAY.json
python -m src.cli.assistant_review fetch --workspace runtime/review
python -m src.cli.assistant_review select --workspace runtime/review --date DAY
python -m src.cli.assistant_review render --workspace runtime/review --date DAY --out runtime/staging
```

`DAY` 是既有報表的日期，並非任意改寫的論文發表日。每份 SQLite 必須是該次執行完成後的歷史快照。匯出使用原始執行開始時間往前 24 小時的發表時間條件，並要求連結後候選數與既有報表一致；數量不同時停止。既有收集總數僅作為歷史來源紀錄保留，不能稱為重新抓取所得的觀察數。

匯出會保存所有候選，而非只有先前入選論文。相同故事及來源內容才共用審閱；來源內容不同的同 ID 故事保留不同候選鍵。設定檔雜湊固定收集、主題及排序設定。`fetch` 可接續執行，使用原 FullTextService、下載節流、全文壓縮及摘要備援規則。全文及請求檔留在私有工作目錄，不放入發布目錄。

## 審閱契約

對每個 `requests/KEY.json`，在完整閱讀實際提供的內容後，寫入 `reviews/KEY.json`：

- `key`、`id`：原候選鍵及精確故事 ID
- `producer`：`assistant-native-review`
- `request_sha256`：完整請求檔案位元組的 SHA-256
- `fulltext_sha256`：請求文件的 SHA-256；原流程沒有文件時為空字串
- `components`：`preference_relevance`、`novelty`、`rigor`、`evidence_strength`、`generalizability`、`reproducibility`，各為有限的 0–1 數值
- `rationale`、`topics`、`evidence`：有根據的評語、主題及段落／頁碼證據

程式按原權重重新計算總分，並套用原擷取品質折扣；不採用檔案中自行填寫的總分。完整性檢查不能證明閱讀真的發生，閱讀與引文查核仍是審閱責任。不可把工具輸出截斷當成全文已讀。

全部可評分候選完成後才可 `select`。入選結果寫入 `selected/DAY.json`。每個入選項目需有來源綁定的 `title_zh` 與 350–600 字元 `summary_zh`，可放在同一審閱檔或 `guides/KEY.json`。後者也須包含 ID、producer、request_sha256、fulltext_sha256。只被原規則排除評分的非論文項目可僅有導讀；不得因此跳過可評分論文。英文／原文標題與摘要保留原始來源，繁中導讀涵蓋問題、方法、證據、限制與意義。

## 發布與限制

先在獨立 staging 保留全部既有 `api/` 歷史，再替換完成審閱的日期。不要用空報表取代尚未收集的日期。重播的目前執行時間與處理數量放在 `run_info`；原始執行資料、來源狀態觀察時間、快照及設定雜湊另保存在 `api/review_runs/DAY.json`。來源狀態保留歷史觀察，不宣稱重新連線檢查。共享分數快取合併保留既有歷史，每日輸出直接使用該日的審閱版本。

渲染不會自動覆寫 `daily.json`、推送 Git 或部署；應先確認整個目標範圍完成、最新日期對應正確，以及非目標歷史未變更，再執行既有索引與發布程序。週報／月報亦須以完整的新日期資料重新產生，不能把混合新舊評分稱為完整重跑。

重播以既有報表中每篇的發表時間與非模型新近度分數，反算原排序時間；所有可反算項目必須得到相同時間，否則停止。這不重用舊模型評分。無可用新近度證據時才以原 `finished_at` 作為明確備援基準；公式與配額不變。

已知原規則差異：提示要求不相關領域總分至多 0.20，但原解析器只使用六項加權分數，未另施加領域上限。本流程保留既有程式行為，不偷偷改變研究品質分項或新增上限；審閱可另保存 `out_of_scope`、`scope_capped_score` 作為稽核資訊。
