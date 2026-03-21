# IvyLife Admin 圖片上傳測試報告

**測試日期：** 2026-03-21  
**Netlify Site：** https://glowing-pixie-fc3fe2.netlify.app  
**最終 Commit：** ivylife@41114f0  
**Branch：** ivylife

---

## ✅ 測試結果總覽

| 項目 | 狀態 | 說明 |
|------|------|------|
| Netlify 部署 | ✅ Published | ivylife@41114f0，Deployed in ~10s |
| admin.html 載入 | ✅ 正常 | 所有 JS 函式正確執行 |
| 密碼登入 | ✅ 成功 | ivy2024admin |
| 新增文章頁面 | ✅ 正常 | 表單完整顯示 |
| uploadIvyCover 型別 | ✅ function | 非 undefined |
| Canvas 測試圖上傳 | ✅ 成功 | 1200×630 PNG → Supabase ivy-images |
| edCover 欄位 | ✅ 已填入 | https://zsebcpfblecwumbaxeaz.supabase.co/storage/v1/object/public/ivy-images/cover-... |
| 文章儲存 | ✅ 成功 | slug: ivy-cover-upload-test |
| 前台封面圖顯示 | ✅ 完美 | /article/ivy-cover-upload-test |
| Admin 儀表板 | ✅ 正常 | 4 篇文章 / 4 已發布 / 7 分類 |

---

## 🔧 修正的 Bug（本次 Session）

### Bug 1：uploadIvyCover 錯誤 KEY
- **問題：** 函式內有 `const KEY='sb_publishable_L2DOfeM0cAJqwlVCr1LwtA_jE9MBNDn'`（假 key）
- **修正：** 移除函式內重複宣告，使用全域正確 KEY

### Bug 2：JS 函式在 `<!DOCTYPE html>` 之前（結構問題）
- **問題：** `doLogin`、`loadAll`、`saveArt` 等函式放在 DOCTYPE 之前，瀏覽器不執行
- **修正：** 全部移進 `<script>` 標籤內

### Bug 3：UTF-8 encode 問題
- **問題：** 直接用 `btoa()` encode 含中文字符的 HTML 導致 regex 損毀
- **修正：** 改用 `TextEncoder` 正確處理 UTF-8

---

## 📸 截圖

- Admin 登入後儀表板：4 篇文章、4 已發布、7 分類
- 新增文章表單：標題/slug/分類/摘要/內文/封面圖
- 前台文章頁：封面圖 "IvyLife Test Cover" 粉色漸層圖完美顯示
- 文章管理列表：ivy-cover-upload-test 已發布
- 分類管理：7 個分類，美食餐廳 2 篇文章

---

## 🌐 重要 URL

- **前台：** https://glowing-pixie-fc3fe2.netlify.app
- **後台：** https://glowing-pixie-fc3fe2.netlify.app/admin.html
- **測試文章：** https://glowing-pixie-fc3fe2.netlify.app/article/ivy-cover-upload-test
- **Supabase：** https://zsebcpfblecwumbaxeaz.supabase.co (bucket: ivy-images)
