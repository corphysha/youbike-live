import { ArrowsClockwise, Bicycle } from "@phosphor-icons/react";
import { ThemeToggle } from "../ThemeToggle";

interface Props {
  stationCount: number;
  lastFetch: Date | null;
  isUpdating: boolean;
  announceUpdate: boolean;
  onRefresh: () => Promise<void>;
}

export function PageHeader({
  stationCount,
  lastFetch,
  isUpdating,
  announceUpdate,
  onRefresh,
}: Props) {
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
            onClick={() => {
              if (!isUpdating) void onRefresh();
            }}
            aria-disabled={isUpdating}
            aria-label="重新整理站點資料"
          >
            <ArrowsClockwise
              size={14}
              className={isUpdating ? "spin" : undefined}
              aria-hidden="true"
            />
            <span className="refresh-label" aria-hidden="true">
              <span data-hidden={isUpdating || undefined}>
                <span className="refresh-label-full">重新整理</span>
                <span className="refresh-label-compact">更新</span>
              </span>
              <span data-hidden={!isUpdating || undefined}>更新中</span>
            </span>
          </button>
        </div>
      </div>
      <span className="sr-only" role="status">
        {announceUpdate ? "站點資料更新中" : ""}
      </span>
      {isUpdating && (
        <div className="feed-progress" aria-hidden="true">
          <span className="feed-progress-indicator" />
        </div>
      )}
    </header>
  );
}
