import { ArrowsClockwise, Bicycle } from "@phosphor-icons/react";
import { ThemeToggle } from "../ThemeToggle";

interface Props {
  stationCount: number;
  lastFetch: Date | null;
  isUpdating: boolean;
  onRefresh: () => Promise<void>;
}

export function PageHeader({ stationCount, lastFetch, isUpdating, onRefresh }: Props) {
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Bicycle size={19} weight="bold" color="#231f20" />
          </span>
          <span className="brand-name">YouBike 即時查詢</span>
          <span className="brand-sub">全台 {stationCount.toLocaleString()} 站</span>
        </div>
        <div className="header-spacer" />
        {lastFetch && (
          <span className="updated-note">
            更新{" "}
            {`${String(lastFetch.getHours()).padStart(2, "0")}:${String(lastFetch.getMinutes()).padStart(2, "0")}`}
          </span>
        )}
        <div className="header-actions">
          <ThemeToggle />
          <button
            type="button"
            className="refresh-btn"
            onClick={() => void onRefresh()}
            disabled={isUpdating}
            aria-busy={isUpdating}
            aria-label={isUpdating ? "更新中，正在重新整理站點資料" : "重新整理站點資料"}
          >
            <ArrowsClockwise
              size={14}
              className={isUpdating ? "spin" : undefined}
              aria-hidden="true"
            />
            <span className="refresh-label-full">{isUpdating ? "更新中" : "重新整理"}</span>
            <span className="refresh-label-compact" aria-hidden="true">
              {isUpdating ? "更新中" : "更新"}
            </span>
          </button>
        </div>
      </div>
      <span className="sr-only" role="status">
        {isUpdating ? "站點資料更新中" : ""}
      </span>
      {isUpdating && (
        <div className="feed-progress">
          <progress className="sr-only" aria-label="站點資料更新中" />
          <span className="feed-progress-indicator" aria-hidden="true" />
        </div>
      )}
    </header>
  );
}
