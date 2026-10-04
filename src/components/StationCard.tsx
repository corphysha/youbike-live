import { Lightning, NavigationArrow, Star } from "@phosphor-icons/react";
import { formatDistance } from "../lib/distance";
import { ageMinutes, availabilityLevel, LEVEL_LABEL, shortTime } from "../lib/format";
import type { StationView } from "../lib/schema";
import { TripButtons } from "./TripButtons";

interface Props {
  station: StationView;
  isFav: boolean;
  now: Date;
  distanceMeters?: number;
  onToggleFav: (id: string) => void;
  onNavigateToStation: (station: StationView) => void;
  tripRole?: "start" | "end" | null;
  onToggleTripStation?: (role: "start" | "end", id: string) => void;
}

export function StationCard({
  station,
  isFav,
  now,
  distanceMeters,
  onToggleFav,
  onNavigateToStation,
  tripRole = null,
  onToggleTripStation,
}: Props) {
  const level = availabilityLevel(station.available, station.empty, station.status);
  const age = ageMinutes(station.updatedAt, now);
  const detail = station.detail;

  return (
    <li className={`station-card${isFav ? " fav" : ""}`}>
      <div className="station-name">
        <button
          type="button"
          className="fav-btn"
          aria-pressed={isFav}
          aria-label={isFav ? `取消最愛：${station.name}` : `加入最愛：${station.name}`}
          onClick={() => onToggleFav(station.id)}
        >
          {isFav ? <Star size={18} weight="fill" /> : <Star size={18} />}
        </button>
        <span className="name-text">{station.name}</span>
        {detail.eyb > 0 && (
          <span title="有 YouBike 2.0E 電輔車" style={{ color: "var(--warn)", flex: "none" }}>
            <Lightning size={14} weight="fill" />
          </span>
        )}
        <button
          type="button"
          className="station-nav-button"
          aria-label={`開啟前往 ${station.name} 的步行導航`}
          title="開啟導航"
          onClick={() => onNavigateToStation(station)}
        >
          <NavigationArrow size={16} weight="bold" aria-hidden="true" />
          <span>導航</span>
        </button>
      </div>
      <div className="station-name-en">
        {station.district}
        {station.district && " · "}
        {station.address}
      </div>

      <div className="station-nums">
        {level === "offline" ? (
          <span className="state-badge offline">
            <span className="state-dot" />
            {LEVEL_LABEL.offline}
          </span>
        ) : (
          <>
            <div className="num-block num-available">
              <div className="num">{station.available}</div>
              <div className="num-label">可借</div>
            </div>
            <div className="dock-gauge" aria-hidden="true">
              <div className="fill" style={{ height: `${Math.round(station.dockRatio * 100)}%` }} />
            </div>
            <div className="num-block num-empty">
              <div className="num">{station.empty}</div>
              <div className="num-label">空位</div>
            </div>
          </>
        )}
      </div>

      <div className="detail-line">
        <span className={`state-badge ${level}`}>
          <span className="state-dot" />
          {LEVEL_LABEL[level]}
        </span>
        <span>
          2.0 {detail.yb2} · 2.0E {detail.eyb}
          {detail.yb1 > 0 ? ` · 1.0 ${detail.yb1}` : ""}
        </span>
        <span className="muted">更新 {shortTime(station.updatedAt, now)}</span>
        {age !== null && age >= 20 && <span className="muted">（{age} 分鐘前）</span>}
        {distanceMeters !== undefined && (
          <span className="station-distance" data-distance-meters={distanceMeters}>
            直線 {formatDistance(distanceMeters)}
          </span>
        )}
      </div>
      {onToggleTripStation && (
        <TripButtons
          stationId={station.id}
          stationName={station.name}
          tripRole={tripRole}
          onToggleTripStation={onToggleTripStation}
        />
      )}
    </li>
  );
}
