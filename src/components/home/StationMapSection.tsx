import { CaretDown, CaretUp, Crosshair } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { LocationStatus } from "../../hooks/useUserLocation";
import { type GeoPoint, getDistanceMeters } from "../../lib/distance";
import type { StationView } from "../../lib/schema";
import { StationMap } from "../StationMap";
import { SelectedStation } from "./SelectedStation";

interface Props {
  stations: StationView[];
  favorites: string[];
  userLocation: GeoPoint | null;
  locationStatus: LocationStatus;
  locationMessage: string;
  mapCollapsed: boolean;
  onRequestLocation: () => void;
  onToggleMap: () => void;
  onToggleFavorite: (id: string) => void;
}

export function StationMapSection({
  stations,
  favorites,
  userLocation,
  locationStatus,
  locationMessage,
  mapCollapsed,
  onRequestLocation,
  onToggleMap,
  onToggleFavorite,
}: Props) {
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const selectedStation = stations.find((station) => station.id === selectedStationId) ?? null;
  const selectedDistance =
    selectedStation && userLocation ? getDistanceMeters(userLocation, selectedStation) : null;

  useEffect(() => {
    if (selectedStationId && !selectedStation) setSelectedStationId(null);
  }, [selectedStationId, selectedStation]);

  return (
    <section className="map-section" aria-labelledby="map-title">
      <div className="map-heading">
        <div className="map-heading-copy">
          <h2 id="map-title">站點地圖</h2>
          <p>
            {userLocation
              ? "地圖顯示目前篩選的站點，清單已按距離排序。"
              : "允許定位後會移至附近站點；下次開啟自動更新位置與距離排序。"}
          </p>
        </div>
        <div className="map-actions">
          <button
            type="button"
            className="locate-btn"
            onClick={onRequestLocation}
            disabled={locationStatus === "loading"}
            aria-label={userLocation ? "重新取得位置並移動地圖" : "取得定位並移動地圖"}
          >
            <Crosshair size={17} weight="bold" aria-hidden="true" />
            <span>
              {locationStatus === "loading"
                ? "定位中…"
                : userLocation
                  ? "重新定位"
                  : "定位我的位置"}
            </span>
          </button>
          <button
            type="button"
            className="locate-btn map-toggle"
            onClick={onToggleMap}
            aria-expanded={!mapCollapsed}
            aria-controls="map-body"
          >
            {mapCollapsed ? (
              <CaretDown size={17} weight="bold" aria-hidden="true" />
            ) : (
              <CaretUp size={17} weight="bold" aria-hidden="true" />
            )}
            <span>{mapCollapsed ? "展開地圖" : "收起地圖"}</span>
          </button>
        </div>
      </div>
      {locationMessage && (
        <p className={`location-message ${locationStatus}`} role="status" aria-live="polite">
          {locationMessage}
        </p>
      )}
      {!mapCollapsed && (
        <div id="map-body">
          <StationMap
            stations={stations}
            selectedId={selectedStationId}
            userLocation={userLocation}
            onSelectStation={(station) => setSelectedStationId(station.id)}
          />
          {selectedStation && (
            <SelectedStation
              station={selectedStation}
              isFav={favorites.includes(selectedStation.id)}
              distanceMeters={selectedDistance}
              onToggleFavorite={onToggleFavorite}
            />
          )}
        </div>
      )}
    </section>
  );
}
