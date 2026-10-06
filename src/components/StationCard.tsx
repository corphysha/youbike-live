import { Bicycle, Lightning, NavigationArrow, Star } from "@phosphor-icons/react";
import { formatDistance } from "../lib/distance";
import { ageMinutes, availabilityLevel, bikeCounts, LEVEL_LABEL, shortTime } from "../lib/format";
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
  const bikes = bikeCounts(station);

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
            <div className="bike-split">
              <div className={`num-block num-regular${bikes.regular === 0 ? " zero" : ""}`}>
                <div className="num">{bikes.regular}</div>
                <div className="num-label">
                  <Bicycle size={12} weight="bold" aria-hidden="true" />
                  一般車
                </div>
              </div>
              <div className={`num-block num-electric${bikes.electric === 0 ? " zero" : ""}`}>
                <div className="num">{bikes.electric}</div>
                <div className="num-label">
                  <Lightning size={12} weight="fill" aria-hidden="true" />
                  電輔車
                </div>
              </div>
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
        {level !== "offline" && <span>共可借 {station.available} 輛</span>}
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
