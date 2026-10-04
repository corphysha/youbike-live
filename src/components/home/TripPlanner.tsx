import { ArrowsDownUp, NavigationArrow, Trash } from "@phosphor-icons/react";
import { formatDistance, getDistanceMeters } from "../../lib/distance";
import { navigateToStation } from "../../lib/navigation";
import type { StationView } from "../../lib/schema";
import {
  checkTripStation,
  findAlternatives,
  TRIP_CHECK_LABEL,
  type Trip,
  type TripCheck,
} from "../../lib/trip";

interface Props {
  trip: Trip;
  stations: StationView[];
  onSwap: () => void;
  onClear: () => void;
}

const BADGE_CLASS: Record<TripCheck, string> = {
  ok: "good",
  low: "low",
  none: "none",
  offline: "offline",
  missing: "offline",
};

function TripLeg({
  leg: role,
  stationId,
  station,
  stations,
}: {
  leg: "start" | "end";
  stationId: string | null;
  station: StationView | null;
  stations: StationView[];
}) {
  const roleLabel = role === "start" ? "起點" : "終點";
  if (!stationId) {
    return (
      <div className="trip-leg unset">
        <span className="trip-role">{roleLabel}</span>
        <p className="trip-hint">尚未設定{roleLabel}</p>
      </div>
    );
  }

  const check = checkTripStation(station, role);
  const alternatives = station && check !== "ok" ? findAlternatives(stations, station, role) : [];
  const isActive = station?.status === 1;

  return (
    <div className="trip-leg">
      <span className="trip-role">{roleLabel}</span>
      <h3>{station?.name ?? `站點 ${stationId}`}</h3>
      {station && isActive && (
        <div className="trip-metrics">
          <div className={role === "start" ? "primary" : undefined}>
            <span>可借車輛</span>
            <strong className="available">{station.available}</strong>
          </div>
          <div className={role === "end" ? "primary" : undefined}>
            <span>剩餘空位</span>
            <strong>{station.empty}</strong>
          </div>
        </div>
      )}
      <span className={`state-badge ${BADGE_CLASS[check]}`}>
        <span className="state-dot" />
        {TRIP_CHECK_LABEL[role][check]}
      </span>
      {station && check !== "ok" && (
        <div className="trip-alternatives">
          <span className="trip-alt-title">
            {alternatives.length > 0
              ? `500 公尺內可${role === "start" ? "借車" : "還車"}的站點`
              : "500 公尺內沒有其他可用站點"}
          </span>
          {alternatives.length > 0 && (
            <ul>
              {alternatives.map(({ station: alt, distance }) => (
                <li key={alt.id}>
                  <span className="trip-alt-name">{alt.name}</span>
                  <span className="trip-alt-count">
                    {role === "start" ? `可借 ${alt.available}` : `空位 ${alt.empty}`}
                  </span>
                  <span className="muted">{formatDistance(distance)}</span>
                  <button
                    type="button"
                    className="station-nav-button"
                    aria-label={`開啟前往 ${alt.name} 的步行導航`}
                    onClick={() => navigateToStation(alt)}
                  >
                    <NavigationArrow size={14} weight="bold" aria-hidden="true" />
                    <span>導航</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function TripPlanner({ trip, stations, onSwap, onClear }: Props) {
  const byId = new Map(stations.map((station) => [station.id, station]));
  const start = trip.startId ? (byId.get(trip.startId) ?? null) : null;
  const end = trip.endId ? (byId.get(trip.endId) ?? null) : null;
  const hasAny = Boolean(trip.startId || trip.endId);

  return (
    <section className="panel" aria-labelledby="trip-title">
      <div className="panel-heading">
        <div className="panel-heading-copy">
          <h2 id="trip-title">起終點檢測</h2>
          <p>起點看可借車輛、終點看可停空位；不足時列出附近替代站點。</p>
        </div>
        {hasAny && (
          <div className="panel-actions">
            <button
              type="button"
              className="locate-btn"
              onClick={onSwap}
              aria-label="對調起點與終點"
            >
              <ArrowsDownUp size={16} weight="bold" aria-hidden="true" />
              <span>對調</span>
            </button>
            <button type="button" className="locate-btn" onClick={onClear} aria-label="清除起終點">
              <Trash size={16} weight="bold" aria-hidden="true" />
              <span>清除</span>
            </button>
          </div>
        )}
      </div>
      {hasAny ? (
        <div className="trip-body" aria-live="polite">
          <TripLeg leg="start" stationId={trip.startId} station={start} stations={stations} />
          <TripLeg leg="end" stationId={trip.endId} station={end} stations={stations} />
          {start && end && (
            <p className="trip-distance">
              起終點直線距離 {formatDistance(getDistanceMeters(start, end))}
            </p>
          )}
        </div>
      ) : (
        <p className="panel-note">
          在站點清單或地圖所選站點按「設為起點」「設為終點」即可開始檢測。
        </p>
      )}
    </section>
  );
}
