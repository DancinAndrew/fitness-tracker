# ADR 0001：先使用 Remote，將健康帳本與輸入入口分開

日期：2026-10-04。狀態：**已由 [ADR 0002](0002-shared-cloud-ledger-and-sites.md) 新版提案取代**。使用者新增第一版 Sites 前端及網站補充紀錄需求，因此重新選擇正式帳本位置；下文保留當時的提案與取捨，尚未曾實作。ADR 是架構決策紀錄，用來保留選擇理由、替代方案及代價。

## Context

使用者希望手機拍照即可記錄，已確認使用 iPhone，且 Mac 可保持開機連網。當前 repository 無程式或架構可沿用。私人初始化文件描述了紀錄、計算與確認規則，並非資料庫合約。

## Proposed decision

先使用官方 Codex Remote 作手機入口，讓 Codex 解析照片與文字；以 Python 本機帳本指令驗證並寫入 SQLite。固定查讀持久資料，每次寫入均有記錄識別碼與讀回結果。

以 ChatGPT 登入的 Codex 使用訂閱方案權益，仍受方案用量限制；首版不額外呼叫模型 API。不能把 Codex 認證憑證搬到網站當通用 API key。Local data 只描述資料保存位置，不表示照片不會傳送 OpenAI。

## Alternatives and consequences

| 方案 | 優點 | 代價／限制 | 判斷 |
|---|---|---|---|
| Remote＋本機帳本 | 沿用手機 ChatGPT 介面及現有 Codex，少一套模型服務 | Mac 必須醒著連網；受方案限額；真機圖片保存需驗證 | 第一版建議 |
| Sites／獨立手機網頁＋私有後端 | 可建立相機入口、自動填欄位及圖表，雲端部署可不依賴 Mac | 需身分存取、持久儲存、分析服務與營運；付費方式需確認 | 有實際需求再選 |
| 一般 ChatGPT 對話 | 現成拍照與分析介面 | 沒有寫入工具時，對話不構成可確定重算的健康帳本 | 可臨時分析，不作正式儲存 |

Sites 支援 D1 結構化儲存及 R2 檔案儲存，所以「網站不能自動保存／一定得手填」不成立；仍需實作辨識、驗證、確認及寫入流程。託管本身不代表每次影像分析都自動沿用 Codex 額度。

另有官方 Sign in with ChatGPT 的 plan usage 預覽，可讓合適的開源／本機應用請求使用者方案來執行符合條件的模型請求；遠端託管／商用應用有另外申請路徑。這不是普通網站登入就自動獲得的能力，也未在本帳號驗證。首版不因此增加登入系統與整合範圍。

Sites 文件禁止處理 Protected Health Information（受特定規範保護的健康資訊），且不提供資料／推論地域保證。此處不判定所有個人運動飲食紀錄都屬於該法律類別；敏感背景也沒有上傳 Sites 的必要。若未來採用 Sites，須先限定資料範圍與核對適用限制。

## Revisit conditions

- Mac 無法穩定保持可連線，或 Remote 方案額度不足。
- 手機實測不能可靠傳入／保存照片，或確認成本仍太高。
- 一週試用後確實需要獨立圖表、離線收件或多裝置同時操作。

重新選入口沿用帳本合約與歷史資料；不以 GitHub commits 作為每天的健康資料庫。

## Verified sources

查核日期：2026-10-04。能力文件不等於已在使用者帳號或裝置驗證。

- [Codex Remote](https://learn.chatgpt.com/docs/remote)：iOS 手機連接執行主機，主機需保持醒著且連網。
- [Remote 手機操作說明](https://developers.openai.com/blog/mastering-codex-remote-for-engineering)：照片、檔案及直接相機拍攝輸入。
- [Codex authentication](https://learn.chatgpt.com/docs/auth)：ChatGPT 訂閱登入與 API key 按量使用的區別。
- [Sites](https://learn.chatgpt.com/docs/sites)：持久儲存、檔案、存取及不支援用途。
- [ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source)：適用範圍與另外的遠端託管申請路徑。
- [Plan usage preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)：影像輸入與預覽限制。
