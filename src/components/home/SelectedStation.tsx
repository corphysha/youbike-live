import { NavigationArrow, Star } from "@phosphor-icons/react";
import { formatDistance } from "../../lib/distance";
import { navigateToStation } from "../../lib/navigation";
import type { StationView } from "../../lib/schema";
import { TripButtons } from "../TripButtons";

interface Props {
  station: StationView;
  isFav: boolean;
  distanceMeters: number | null;
  tripRole: "start" | "end" | null;
  onToggleFavorite: (id: string) => void;
  onToggleTripStation: (role: "start" | "end", id: string) => void;
}

export function SelectedStation({
  station,
  isFav,
  distanceMeters,
  tripRole,
  onToggleFavorite,
  onToggleTripStation,
}: Props) {
  return (
    <section className="selected-station" aria-live="polite" aria-label="地圖所選站點">
      <div className="selected-station-heading">
        <div className="selected-station-copy">
          <span className="selected-label">地圖所選站點</span>
          <h3>{station.name}</h3>
          <p>
            {station.district}
            {station.district && " · "}
            {station.address}
          </p>
        </div>
        <button
          type="button"
          className="fav-btn selected-fav"
          aria-pressed={isFav}
          aria-label={isFav ? `取消最愛：${station.name}` : `加入最愛：${station.name}`}
          onClick={() => onToggleFavorite(station.id)}
        >
          <Star size={19} weight={isFav ? "fill" : "regular"} />
        </button>
      </div>
      <div className="selected-metrics">
        <div>
          <span>可借車輛</span>
          <strong className="available">{station.status === 1 ? station.available : "—"}</strong>
        </div>
        <div>
          <span>剩餘空位</span>
          <strong>{station.status === 1 ? station.empty : "—"}</strong>
        </div>
        {distanceMeters !== null && (
          <div>
            <span>直線距離</span>
            <strong>{formatDistance(distanceMeters)}</strong>
          </div>
        )}
      </div>
      <TripButtons
        stationId={station.id}
        stationName={station.name}
        tripRole={tripRole}
        onToggleTripStation={onToggleTripStation}
        className="trip-buttons selected-trip-buttons"
      />
      <button
        type="button"
        className="selected-nav-button"
        aria-label={`開啟前往 ${station.name} 的步行導航`}
        title="Android 交由系統選擇地圖 App；iPhone/iPad 開啟 Apple 地圖；無法開啟時改用 Google 地圖"
        onClick={() => navigateToStation(station)}
      >
        <NavigationArrow size={18} weight="bold" aria-hidden="true" />
        <span>步行前往</span>
      </button>
    </section>
  );
}
