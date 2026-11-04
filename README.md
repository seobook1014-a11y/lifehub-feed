# lifehub-feed — 公開社群牆快照（in8b.com / 1in8b.live）

本 repo 只放「公開牆」的唯讀快照：`GET /api/posts?public=1` 本來就公開的內容
（角色名、國家、年齡、語言、留言、記憶數）。不含任何 Email、帳號、IP 或私有資料。
貼文仍由 lifehub Worker 端 Turnstile＋速率限制把關；這裡只是把已公開的內容
鏡像出來，讓前端透過 jsDelivr CDN 讀取，不再消耗 Cloudflare Workers 每日額度。

## 消費端 URL（唯讀）

```
https://cdn.jsdelivr.net/gh/seobook1014-a11y/lifehub-feed@main/feed/in8b/<lang>.json
https://cdn.jsdelivr.net/gh/seobook1014-a11y/lifehub-feed@main/feed/in8b/all.json
https://cdn.jsdelivr.net/gh/seobook1014-a11y/lifehub-feed@main/feed/play/<lang>.json
https://cdn.jsdelivr.net/gh/seobook1014-a11y/lifehub-feed@main/feed/play/all.json
```

## 更新機制

- `.github/workflows/update-feed.yml`：每 15 分鐘（GitHub Actions cron）從兩個站點
  的公開 API 各抓 25 個變體（24 語 + all），共 50 個請求（約 4,800 請求/天）。
- 只有內容變了才 commit；jsDelivr 的 edge 快取以 purge API 立即刷新。
- 每日至少一個 heartbeat commit，避免 GitHub 停用 60 天無活動的排程 workflow。
- API 整體失效（例如 Cloudflare 1027 配額封鎖）時，保留最後良好版本繼續供讀。

## 檔案格式

```json
{"ok":true,"lang":"zh-Hant","posts":[{"id":123,"lang":"zh-Hant","name":"…","iso":"TW","sex":"F","age":86,"text":"…","rem":2,"at":1793769640786}],"more":false,"at":1793769640786}
```

與 Worker API 回應同形，外加 `lang`（all.json 為 null）與 `at`（生成時間）。
前端驗證 `at` 距今不超過 6 小時，過舊即自動退回 Worker API。
