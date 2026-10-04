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

全域與 Leaflet CSS 統一由 `src/pages/_app.tsx` 載入；瀏覽器 API 在 effect 或事件處理中使用，
讓 vinext 靜態匯出與 Next.js Pages Router 的伺服器渲染保持相容。

## CI 與部署

PR（目標分支為 `main`）和 `main` 的每次 push 都會執行 lint、型別檢查、單元測試與生產建置。CI 使用最新穩定版 Bun，所有 GitHub Actions 均使用最新 major 版本標籤。

`main` push 通過檢查後，會自動部署 `dist/pages-site` 至 GitHub Pages。也可在 Actions 手動執行工作流程；只有 `main` 會部署，PR 和其他分支只執行檢查。
