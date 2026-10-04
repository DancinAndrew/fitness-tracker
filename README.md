# 日常進度 · Fitness Tracker

以 Codex Remote 接收照片與自然語言、由私人 Sites 網站查看及補充的健康帳本。前端與 Remote 共用同一個 D1 資料庫；不需要維護兩套健康資料同步。

已實作今日課表、訓練與餐點紀錄、逐項份量修正、營養範圍累計、超商品類補足、體重／腰圍回顧與一般備註。照片判讀由正在執行的 Codex 完成；網站沒有額外的模型 API，也不需要 OpenAI API key。原始照片留在 Mac，網站先顯示結構化資料。

首次使用須連接此 Site 提供的私人 plugin，並用只讀工具驗證。未連接前不要把「程式已實作」當成 Remote 已能保存；部署、真機及測試範圍以交付說明為準。

## 日常操作

1. 在 iPhone Codex Remote 開啟此 Mac 專案，傳照片及一句說明，例如實際日期、飯剩多少或跑步機結束畫面。
2. Codex 只釐清會影響紀錄的未知資訊，保存後回報日期、紀錄編號與版本。
3. 網站刷新讀到同一筆紀錄。可以修改該餐各食物的攝取比例、補充量測與備註。
4. 每週查看趨勢。計畫调整需要明確確認；體重增加、漏報或建議不會自動改變熱量或訓練。

- [Remote 操作與資料範圍](docs/remote-workflow.md)
- [API 合約](docs/api-contract.md)
- [驗收要求](docs/acceptance-test-plan.md)／[合成測試證據與限制](tests/README.md)
- [架構決策](docs/adr/0002-shared-cloud-ledger-and-sites.md)
- [OpenSpec 規格](openspec/changes/photo-first-health-tracking/specs/daily-health-log/spec.md)

## 本機開發

使用 Node.js 26、Python 3.9+ 及現有 lockfile。

```sh
npm ci
npm run typecheck
npm test
npm run build
```

首次預覽需將 `drizzle/*.sql` 按順序套用到本機 D1；正式 Sites 發布由平台套用 migration。

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_ledger.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_expired_requests.sql
npm run dev -- --port 5178
```

本機 `/signin-with-chatgpt` 使用 Sites 的測試身分；正式環境使用平台登入。不要將本機預覽公開到網際網路。測試使用獨立記憶體 SQLite 或本機測試帳號，沒有真實健康 fixtures。

## 資料與限制

- D1 是正式帳本；每位登入者隔離。刪除紀錄連同版本與內容收據；去重標記不含健康內容。詳見 API 合約。
- `.private/` 是 Mac 的附件、待處理稿和匯出目錄，僅本人檔案權限。備份檔未另外加密，不上傳到 Git 或 Site。
- 起始日、目標日與器材級距未知時保持未知。私人 seed 只可選欄匯入自述設定，不能建立量測或已完成紀錄。
- 營養估計保留來源及範圍；未提供的營養不是零。建議不會變成吃過；課表不會變成做過。
- 首版只提出加重建議，沒有自動套用重量處方；沒有商品庫存／價格串接、背景照片分析或原照雲端縮圖。
- 提供者對話／附件、Mac 原照、雲端紀錄、匯出備份各自管理，刪一筆紀錄不代表其他範圍也刪除。

個人交接文件、seed、照片、真實紀錄、帳密均排除 Git。GitHub 只放程式與去識別化規格；`.gitignore` 是誤提交防線，不是加密。
