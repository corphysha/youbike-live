import { MagnifyingGlass } from "@phosphor-icons/react";
import { type GeoPoint, getDistanceMeters } from "../../lib/distance";
import { navigateToStation } from "../../lib/navigation";
import type { StationView } from "../../lib/schema";
import { getTripRole, type Trip } from "../../lib/trip";
import { StationCard } from "../StationCard";

interface Props {
  shown: StationView[];
  stationCount: number;
  totalAvailable: number;
  totalEmpty: number;
  remainingCount: number;
  favorites: string[];
  trip: Trip;
  now: Date;
  userLocation: GeoPoint | null;
  onToggleFavorite: (id: string) => void;
  onToggleTripStation: (role: "start" | "end", id: string) => void;
  onLoadMore: () => void;
}

export function StationResults({
  shown,
  stationCount,
  totalAvailable,
  totalEmpty,
  remainingCount,
  favorites,
  trip,
  now,
  userLocation,
  onToggleFavorite,
  onToggleTripStation,
  onLoadMore,
}: Props) {
  return (
    <>
      <div className="summary-line" aria-live="polite">
        <span>{stationCount.toLocaleString()} 個站點</span>
        <span>可借 {totalAvailable.toLocaleString()} 輛</span>
        <span>空位 {totalEmpty.toLocaleString()} 格</span>
      </div>

      {shown.length === 0 ? (
        <div className="empty-state">
          <div className="big-icon" aria-hidden="true">
            <MagnifyingGlass size={36} />
          </div>
          <p>沒有符合條件的站點</p>
        </div>
      ) : (
        <ul className="station-list">
          {shown.map((s) => (
            <StationCard
              key={s.id}
              station={s}
              isFav={favorites.includes(s.id)}
              now={now}
              distanceMeters={userLocation ? getDistanceMeters(userLocation, s) : undefined}
              onToggleFav={onToggleFavorite}
              onNavigateToStation={navigateToStation}
              tripRole={getTripRole(trip, s.id)}
              onToggleTripStation={onToggleTripStation}
            />
          ))}
        </ul>
      )}

      {remainingCount > 0 && (
        <button type="button" className="load-more" onClick={onLoadMore}>
          顯示更多（還有 {remainingCount.toLocaleString()} 站）
        </button>
      )}
    </>
  );
}
