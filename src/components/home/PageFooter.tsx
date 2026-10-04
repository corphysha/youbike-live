export function PageFooter() {
  return (
    <footer className="footer-note">
      資料來源：YouBike 官方網站 JSON feed（每分鐘更新，非正式文件化 API，格式可能變動）。版權屬
      YouBike 微笑單車公司。頁面開啟時每 60 秒自動更新；最愛站點僅儲存在你的瀏覽器。
      <br />
      可安裝為 App：Android 可從瀏覽器選單安裝；iPhone 或 iPad 請在 Safari
      分享選單選「加入主畫面」。離線時可開啟介面，站點即時資料仍需要網路。
      <br />
      <a href="https://github.com/corphysha/youbike-live" rel="noopener noreferrer">
        GitHub 原始碼
      </a>
    </footer>
  );
}
