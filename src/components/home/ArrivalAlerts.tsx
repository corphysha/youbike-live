import { Bell, BellRinging, BellSlash } from "@phosphor-icons/react";
import type { AlertPermission, ArrivalAlertRecord } from "../../hooks/useArrivalAlerts";
import { ARRIVAL_RADIUS_METERS } from "../../lib/arrival";
import { pad } from "../../lib/format";

interface Props {
  enabled: boolean;
  permission: AlertPermission;
  targetCount: number;
  watchError: string;
  lastAlert: ArrivalAlertRecord | null;
  testStatus: string;
  onEnable: () => Promise<void>;
  onDisable: () => void;
  onSendTest: () => Promise<void>;
}

function statusText({ enabled, permission, targetCount }: Props): string {
  if (permission === "unsupported") {
    return "此瀏覽器不支援通知或定位。iPhone/iPad 請先在 Safari 分享選單「加入主畫面」，再從主畫面開啟。";
  }
  if (permission === "denied") return "通知權限已被封鎖，請到瀏覽器的網站設定允許通知。";
  if (!enabled) return "開啟後會請求通知與定位權限。";
  if (targetCount === 0) return "已開啟，但還沒有最愛站點或起終點可監測。";
  return `正在監測 ${targetCount} 個站點。請保持本頁開啟（可切到背景）；關閉頁面後瀏覽器無法偵測位置。`;
}

export function ArrivalAlerts(props: Props) {
  const {
    enabled,
    permission,
    watchError,
    lastAlert,
    testStatus,
    onEnable,
    onDisable,
    onSendTest,
  } = props;
  const blocked = permission === "unsupported" || permission === "denied";

  return (
    <section className="panel" aria-labelledby="alerts-title">
      <div className="panel-heading">
        <div className="panel-heading-copy">
          <h2 id="alerts-title">抵達提醒</h2>
          <p>接近最愛站點或起終點 {ARRIVAL_RADIUS_METERS} 公尺內時，通知可借車輛與剩餘空位。</p>
        </div>
        <div className="panel-actions">
          <button
            type="button"
            className="locate-btn"
            aria-pressed={enabled}
            disabled={blocked && !enabled}
            onClick={() => (enabled ? onDisable() : void onEnable())}
          >
            {enabled ? (
              <BellSlash size={16} weight="bold" aria-hidden="true" />
            ) : (
              <Bell size={16} weight="bold" aria-hidden="true" />
            )}
            <span>{enabled ? "關閉提醒" : "開啟提醒"}</span>
          </button>
          <button
            type="button"
            className="locate-btn"
            disabled={blocked}
            onClick={() => void onSendTest()}
            title="立即以作業系統通知傳送起終點或最愛站點的車輛與空位"
          >
            <BellRinging size={16} weight="bold" aria-hidden="true" />
            <span>立即通知</span>
          </button>
        </div>
      </div>
      <p className={`panel-note${blocked ? " warn" : ""}`} role="status" aria-live="polite">
        {statusText(props)}
      </p>
      {enabled && watchError && <p className="panel-note warn">{watchError}</p>}
      {testStatus && (
        <p className="panel-note" aria-live="polite">
          {testStatus}
        </p>
      )}
      {lastAlert && (
        <div className="alert-record">
          <span className="muted">
            最近提醒 {pad(lastAlert.at.getHours())}:{pad(lastAlert.at.getMinutes())}
          </span>
          <strong>{lastAlert.title}</strong>
          <span>{lastAlert.body}</span>
        </div>
      )}
    </section>
  );
}
