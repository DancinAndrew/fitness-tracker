# Fitness Tracker

以照片及自然語言記錄飲食、訓練與身體量測的個人健康管理工具。

目前狀態：**規劃完成，應用程式尚未實作，尚未部署。**

- [第一版提案](openspec/changes/photo-first-health-tracking/proposal.md)
- [技術設計草案](openspec/changes/photo-first-health-tracking/design.md)
- [實作清單](openspec/changes/photo-first-health-tracking/tasks.md)
- [需求與情境](openspec/changes/photo-first-health-tracking/specs/daily-health-log/spec.md)
- [目前架構提案：Remote＋Sites 共用帳本](docs/adr/0002-shared-cloud-ledger-and-sites.md)
- [先前本機帳本提案](docs/adr/0001-photo-first-remote-entry.md)
- [驗收測試計畫](docs/acceptance-test-plan.md)

第一版由手機 Codex Remote 傳入照片／文字，Codex 整理結構化資料；新版提案由受保護的 Sites 後端驗證並寫入 D1 雲端資料庫，網站與 Remote 共用同一份正式帳本。前端提供今日摘要、紀錄與簡單補充、趨勢。所有已攝取累計、份量換算、日期歸屬及進階條件由後端程式計算。

原始照片及敏感交接背景先留在 Mac；網站先顯示分析結果，不提供照片縮圖。讀寫工具、雲端資料庫及網站均尚未建立或連接。

個人交接文件及 seed 是私人需求輸入，已排除 Git 追蹤；seed 不是資料庫 schema 或實際紀錄。GitHub 只放程式與去識別化規格。`.gitignore` 只能防止一般誤提交，不是加密或存取控制。

本 repository 不包含個人照片、實際健康紀錄、帳密或 API key。尚無可執行應用與應用測試；驗收文件中的案例均為待實作要求。
