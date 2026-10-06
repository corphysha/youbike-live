import { Bicycle, WifiSlash } from "@phosphor-icons/react";
import type { LoadState } from "../../hooks/useStationFeed";

interface Props {
  state: LoadState;
  isUpdating: boolean;
  errorMessage: string;
  onRetry: () => Promise<void>;
}

export function FeedStatus({ state, isUpdating, errorMessage, onRetry }: Props) {
  return (
    <>
      {state === "loading" && !errorMessage && (
        <div className="empty-state feed-loading">
          <div className="big-icon" aria-hidden="true">
            <Bicycle size={36} />
          </div>
          <p>載入全台站點資料中…</p>
        </div>
      )}

      {errorMessage && (
        <div className="status-strip error">
          <WifiSlash size={16} className="status-icon" aria-hidden="true" />
          <span>
            {errorMessage}
            {state === "ready" && "；目前顯示上次成功更新的資料。"}
          </span>
          <button
            type="button"
            className="refresh-btn"
            onClick={() => {
              if (!isUpdating) void onRetry();
            }}
            aria-disabled={isUpdating}
            style={{ marginLeft: "auto" }}
          >
            重試
          </button>
        </div>
      )}
    </>
  );
}
