import { ArrowsDownUp, BellRinging, NavigationArrow, Star, Trash, X } from "@phosphor-icons/react";
import { formatDistance, getDistanceMeters } from "../../lib/distance";
import { bikeCounts } from "../../lib/format";
import { navigateToStation } from "../../lib/navigation";
import { routeId, type SavedRoute } from "../../lib/routes";
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
  routes: SavedRoute[];
  routeStatus: string;
  onSwap: () => void;
  onClear: () => void;
  onToggleRoute: (startId: string, endId: string) => void;
  onRemoveRoute: (id: string) => void;
  onUseRoute: (route: SavedRoute) => void;
}

const BADGE_CLASS: Record<TripCheck, string> = {
  ok: "good",
  low: "low",
  none: "none",
  offline: "offline",
  missing: "offline",
};

/** Compact "一般 3 · 電輔 2" for pills and alternative rows. */
function bikeShort(station: StationView): string {
  const { regular, electric } = bikeCounts(station);
  return `一般 ${regular} · 電輔 ${electric}`;
}

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
  const bikes = station ? bikeCounts(station) : null;

  return (
    <div className="trip-leg">
      <span className="trip-role">{roleLabel}</span>
      <h3>{station?.name ?? `站點 ${stationId}`}</h3>
      {station && bikes && isActive && (
        <div className="trip-metrics">
          <div className={role === "start" ? "primary" : undefined}>
            <span>一般車</span>
            <strong className="available">{bikes.regular}</strong>
          </div>
          <div className={role === "start" ? "primary" : undefined}>
            <span>電輔車</span>
            <strong className="electric">{bikes.electric}</strong>
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
                  <div className="trip-alt-info">
                    <span className="trip-alt-name" title={alt.name}>
                      {alt.name}
                    </span>
                    <span className="trip-alt-meta">
                      <span className="trip-alt-count">
                        {role === "start" ? bikeShort(alt) : `空位 ${alt.empty}`}
                      </span>
                      <span className="muted">{formatDistance(distance)}</span>
                    </span>
                  </div>
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

function SavedRoutes({
  routes,
  byId,
  activeId,
  routeStatus,
  onRemoveRoute,
  onUseRoute,
}: {
  routes: SavedRoute[];
  byId: Map<string, StationView>;
  activeId: string | null;
  routeStatus: string;
  onRemoveRoute: (id: string) => void;
  onUseRoute: (route: SavedRoute) => void;
}) {
  return (
    <div className="saved-routes">
      <span className="trip-alt-title">收藏路線 · 按一下套用並通知起點車輛與終點空位</span>
      <ul>
        {routes.map((route) => {
          const start = byId.get(route.startId);
          const end = byId.get(route.endId);
          const startName = start?.name ?? route.startId;
          const endName = end?.name ?? route.endId;
          const startCheck = checkTripStation(start ?? null, "start");
          const endCheck = checkTripStation(end ?? null, "end");
          return (
            <li key={route.id} className={route.id === activeId ? "active" : undefined}>
              <button
                type="button"
                className="route-btn"
                aria-label={`套用路線並通知：${startName} 到 ${endName}`}
                onClick={() => onUseRoute(route)}
              >
                <span className="route-names">
                  {startName} → {endName}
                </span>
                <span className="route-counts">
                  <span className={`route-count ${BADGE_CLASS[startCheck]}`}>
                    {start?.status === 1 ? bikeShort(start) : "可借 —"}
                  </span>
                  <span className={`route-count ${BADGE_CLASS[endCheck]}`}>
                    空位 {end?.status === 1 ? end.empty : "—"}
                  </span>
                  <BellRinging size={15} weight="bold" aria-hidden="true" />
                </span>
              </button>
              <button
                type="button"
                className="route-remove"
                aria-label={`刪除收藏路線：${startName} 到 ${endName}`}
                onClick={() => onRemoveRoute(route.id)}
              >
                <X size={14} weight="bold" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {routeStatus && (
        <p className="trip-distance" aria-live="polite">
          {routeStatus}
        </p>
      )}
    </div>
  );
}

export function TripPlanner({
  trip,
  stations,
  routes,
  routeStatus,
  onSwap,
  onClear,
  onToggleRoute,
  onRemoveRoute,
  onUseRoute,
}: Props) {
  const byId = new Map(stations.map((station) => [station.id, station]));
  const start = trip.startId ? (byId.get(trip.startId) ?? null) : null;
  const end = trip.endId ? (byId.get(trip.endId) ?? null) : null;
  const hasAny = Boolean(trip.startId || trip.endId);
  const activeId = trip.startId && trip.endId ? routeId(trip.startId, trip.endId) : null;
  const isSaved = activeId !== null && routes.some((route) => route.id === activeId);

  return (
    <section className="panel" aria-labelledby="trip-title">
      <div className="panel-heading">
        <div className="panel-heading-copy">
          <h2 id="trip-title">起終點檢測</h2>
          <p>起點看可借車輛、終點看可停空位；不足時列出附近替代站點。</p>
        </div>
        {hasAny && (
          <div className="panel-actions">
            {trip.startId && trip.endId && (
              <button
                type="button"
                className="locate-btn"
                aria-pressed={isSaved}
                onClick={() =>
                  trip.startId && trip.endId && onToggleRoute(trip.startId, trip.endId)
                }
              >
                <Star size={16} weight={isSaved ? "fill" : "bold"} aria-hidden="true" />
                <span>{isSaved ? "已收藏" : "收藏路線"}</span>
              </button>
            )}
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
      {routes.length > 0 && (
        <SavedRoutes
          routes={routes}
          byId={byId}
          activeId={activeId}
          routeStatus={routeStatus}
          onRemoveRoute={onRemoveRoute}
          onUseRoute={onUseRoute}
        />
      )}
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
          在站點清單或地圖所選站點按「設為起點」「設為終點」即可開始檢測；設好後可「收藏路線」。
        </p>
      )}
    </section>
  );
}
