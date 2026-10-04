# youbike-live

台灣 YouBike 微笑單車即時站點查詢。查任何站點目前的可借車輛數、可停空位數、狀態與最後更新時間。

地圖可瀏覽符合目前篩選條件的站點，點選標記會在地圖下方顯示站點資訊。按「定位我的位置」並授權後，地圖會移至目前位置，站點清單依直線距離由近到遠排列。定位座標只在瀏覽器端使用；顯示底圖時會向 OpenStreetMap 載入地圖圖磚。

線上版：<https://corphysha.github.io/youbike-live/>

## 資料來源

站點即時資料使用 YouBike 官方網站在用的 JSON feed（非正式文件化 API，格式可能變動，因此用 Zod 驗證後才顯示）：

- 站點資料：<https://apis.youbike.com.tw/json/station-yb2.json>（全台約 9,600 站）
- 區域資料：<https://apis.youbike.com.tw/json/area-all.json>

版權資料屬 YouBike 微笑單車公司。

## 技術

- vinext（Cloudflare 的 Next.js API on Vite）靜態匯出
- Bun 1.4.2 + TypeScript strict + Biome 2.5 + Zod 4
- React 19 + Phosphor Icons
- Leaflet + MarkerCluster（OpenStreetMap 底圖）
- 定位後依 Haversine 直線距離排序
- 最愛站點儲存在瀏覽器 localStorage

## 開發

```bash
bun install
bun run dev      # 開發伺服器
bun run build    # 生產建置 → dist/
bun run preview  # 預覽建置結果
bun run lint     # Biome 檢查
bun run typecheck
bun run test
bun run audit:responsive
```

首頁模組分工：

- `src/pages/index.tsx`：Pages Router 頁面、SEO 與模組組合。
- `src/components/home/`：頁首、搜尋篩選、地圖區塊、所選站點與清單等 UI。
- `src/components/ThemeToggle.tsx`：外觀切換、裝置外觀監聽與瀏覽器主題色。
- `src/hooks/`：資料更新、定位、最愛、地圖收合與搜尋分頁的狀態和生命週期。
- `src/lib/stations.ts`：不依賴瀏覽器的站點篩選、距離排序、縣市選項與統計。

全域 CSS 由 `src/pages/_app.tsx` 載入，Leaflet CSS 隨地圖延後載入；瀏覽器 API 在 effect 或事件處理中使用，
讓 vinext 靜態匯出與 Next.js Pages Router 的伺服器渲染保持相容。

## CI 與部署

PR（目標分支為 `main`）和 `main` 的每次 push 都會執行 lint、型別檢查、單元測試與生產建置。CI 使用最新穩定版 Bun，所有 GitHub Actions 均使用最新 major 版本標籤。

`main` push 通過檢查後，會自動部署 `dist/pages-site` 至 GitHub Pages。也可在 Actions 手動執行工作流程；只有 `main` 會部署，PR 和其他分支只執行檢查。

## 載入與地圖效能

官方 `station-yb2.json` 是全台靜態 JSON，沒有依定位只下載最近十站的查詢介面；
目前仍需下載完整站點資料，定位座標不會傳至資料來源。取得定位後先顯示最近 10 站，
「顯示更多」每次增加 40 站；搜尋、縣市、最愛與統計仍涵蓋完整資料。

區域名稱獨立載入並允許瀏覽器快取，不阻擋站點顯示；成功後不再重抓，失敗時在下一次
手動或自動更新重試，並避免重複請求。站點仍每分鐘更新（頁面隱藏時暫停）；全台資料
下載與解析最多等待 90 秒，區域資料為 20 秒。逾時、取消、連線失敗與 JSON 格式錯誤
分別處理，更新失敗保留上次成功資料。取消與逾時只依賴 AbortController，不要求
新版 AbortSignal.any、timeout 或 throwIfAborted；請求結束會清除計時器與事件監聽。

地圖在第一次展開且進入畫面時才初始化。收合只隱藏地圖，保留縮放、平移、選取與圖磚；
再次展開只校正尺寸並套用隱藏期間的新資料。標記先處理最近 10 站，再分批加入其餘站點，
更新時重用既有標記，避免每次重建全台標記。

瀏覽器回歸檢查（先執行 `bun run build`，需要 Chrome；可用 `CHROME_BIN` 指定執行檔）：

```bash
bun run audit:loading     # 10,000 站固定資料，涵蓋延遲、錯誤、定位、收合、搜尋與分批取消
bun run audit:responsive  # 320–1024px 排版、主題、定位、站點選取
```

`audit:loading` 已加入 CI，使用固定資料與圖磚回應，不依賴外部資料來源。
`audit:responsive` 預設使用即時資料；也可設定 `STATION_FEED_PATH` 為下載的官方 JSON，
以同一份資料重現檢查結果。

## 效能量測與預算

- 使用 module Web Worker 解析及驗證兩個 feed，讓大型 JSON 與 Zod 不阻塞 UI。
  瀏覽器不支援、政策阻擋或 worker 啟動失敗時，自動延後載入相同驗證程式作為備援。
- 搜尋使用 React `useDeferredValue`，優先回應輸入；結果仍由完整站點資料計算。
- Leaflet CSS 隨地圖載入，透過 CSS cascade layer 保留網站主題樣式的優先權。
- 載入畫面預留高度，避免站點出現時把頁尾大幅推離畫面。
- Service worker 對有建置雜湊的 `_next/static/` 資產採 cache-first；HTML 保持
  network-first，外部即時 feed 不經本站 service worker 快取。

```bash
bun run build
bun run audit:performance
# 可設定 REPORT_PATH=/tmp/performance.json 保存量測結果
```

效能 audit 使用 390×844 畫面、4 倍 CPU 降速、10,000 站（約 4.56 MB）的固定 feed，
回應延遲 300 ms，網頁資產由本機提供。它使用 PerformanceObserver 記錄 LCP、CLS、
long tasks 及可信任鍵盤輸入的 Event Timing。CI 強制檢查 CLS ≤ 0.1、主執行緒 JS
< 450 KB、初始 CSS < 20 KB（皆為解碼後大小），並確認兩個 feed 確實由 worker 處理。
時間量測會受執行機影響，因此 LCP、長任務與互動時間只作診斷，不設易波動的 CI 門檻。

相較此 PR 第一版，在相同本機情境下，主執行緒 JS 約 491 → 408 KB，初始 CSS 約
27.2 → 15.9 KB，載入 CLS 約 0.91 → 0.005。Worker 仍需下載自己的驗證程式；這是
移出 UI 執行緒，並非宣稱全部 JavaScript 下載量減少。站點下載大小也沒有改變。

這些是實驗室回歸量測，不能當作真實使用者 Core Web Vitals 或正式 INP。若要判斷
實際使用品質，應依裝置分組觀察真實流量第 75 百分位，目標為 LCP ≤ 2.5 s、
INP ≤ 200 ms、CLS ≤ 0.1；本專案沒有新增遠端效能追蹤或傳送定位資料。
