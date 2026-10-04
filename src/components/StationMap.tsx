import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { GeoPoint } from "../lib/distance";
import type { StationView } from "../lib/schema";

interface Props {
  active: boolean;
  stations: StationView[];
  selectedId: string | null;
  userLocation: GeoPoint | null;
  onSelectStation: (station: StationView) => void;
}

function stationIcon(
  leaflet: typeof import("leaflet"),
  selected: boolean,
  offline: boolean,
): Leaflet.DivIcon {
  const classes = ["station-pin", selected ? "is-selected" : "", offline ? "is-offline" : ""]
    .filter(Boolean)
    .join(" ");

  return leaflet.divIcon({
    className: "station-pin-icon",
    html: `<span class="${classes}" aria-hidden="true"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export function StationMap({ active, stations, selectedId, userLocation, onSelectStation }: Props) {
  const mapElement = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const clustersRef = useRef<Leaflet.MarkerClusterGroup | null>(null);
  const userLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, Leaflet.Marker>());
  const stationByIdRef = useRef(new Map<string, StationView>());
  const renderedStationsRef = useRef(new Map<string, StationView>());
  const completedStationsRef = useRef<StationView[] | null>(null);
  const onSelectRef = useRef(onSelectStation);
  const selectedIdRef = useRef(selectedId);
  const locationRef = useRef(userLocation);
  locationRef.current = userLocation;
  const lastLocationRef = useRef<GeoPoint | null>(null);
  const lastSelectedIdRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelectStation;
  }, [onSelectStation]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;

    const createMap = async () => {
      try {
        const leafletModule = await import("leaflet");
        const leaflet = (leafletModule.default ?? leafletModule) as typeof import("leaflet");
        await import("leaflet.markercluster");

        if (cancelled || !mapElement.current) return;

        const map = leaflet.map(mapElement.current, {
          center: locationRef.current
            ? [locationRef.current.lat, locationRef.current.lng]
            : [23.6978, 120.9605],
          zoom: locationRef.current ? 14 : 7,
          minZoom: 6,
          maxZoom: 19,
          scrollWheelZoom: false,
          zoomControl: false,
        });
        leaflet.control.zoom({ zoomInTitle: "放大地圖", zoomOutTitle: "縮小地圖" }).addTo(map);
        leaflet
          .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          })
          .addTo(map);

        const clusters = leaflet.markerClusterGroup({
          // Batches below are cancellable when filters change or the map is hidden.
          chunkedLoading: false,
          removeOutsideVisibleBounds: true,
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          iconCreateFunction: (cluster) => {
            const count = cluster.getChildCount();
            const size = count < 10 ? "small" : count < 100 ? "medium" : "large";
            return leaflet.divIcon({
              className: "station-cluster-icon",
              html: `<span class="station-cluster station-cluster--${size}">${count.toLocaleString()}</span>`,
              iconSize: [42, 42],
              iconAnchor: [21, 21],
            });
          },
        });
        map.addLayer(clusters);

        const userLayer = leaflet.layerGroup().addTo(map);
        leafletRef.current = leaflet;
        mapRef.current = map;
        clustersRef.current = clusters;
        userLayerRef.current = userLayer;
        setMapReady(true);
      } catch {
        if (!cancelled) setMapError(true);
      }
    };

    void createMap();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      clustersRef.current = null;
      userLayerRef.current = null;
      leafletRef.current = null;
      markersRef.current.clear();
      stationByIdRef.current.clear();
      renderedStationsRef.current.clear();
      completedStationsRef.current = null;
      lastLocationRef.current = null;
      lastSelectedIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !active) return;
    // A hidden map has no dimensions. Re-measure without changing its center or zoom.
    const frame = requestAnimationFrame(() => mapRef.current?.invalidateSize({ pan: false }));
    return () => cancelAnimationFrame(frame);
  }, [active, mapReady]);

  useEffect(() => {
    const clusters = clustersRef.current;
    const leaflet = leafletRef.current;
    if (!active || !mapReady || !clusters || !leaflet) return;
    if (completedStationsRef.current === stations) return;

    const markers = markersRef.current;
    const renderedStations = renderedStationsRef.current;
    const stationById = new Map(stations.map((station) => [station.id, station]));
    stationByIdRef.current = stationById;
    const removed: Leaflet.Marker[] = [];
    for (const [id, marker] of markers) {
      if (!stationById.has(id)) {
        removed.push(marker);
        markers.delete(id);
        renderedStations.delete(id);
      }
    }
    clusters.removeLayers(removed);

    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    const updateBatch = () => {
      // With GPS, stations arrive nearest-first. Paint those ten before the rest.
      const end = Math.min(index + (index === 0 ? 10 : 200), stations.length);
      const added: Leaflet.Marker[] = [];
      for (; index < end; index += 1) {
        const station = stations[index];
        if (!station) continue;
        const title = `${station.name}，可借 ${station.available} 輛，空位 ${station.empty} 格`;
        let marker = markers.get(station.id);
        if (!marker) {
          marker = leaflet.marker([station.lat, station.lng], {
            icon: stationIcon(leaflet, station.id === selectedIdRef.current, station.status !== 1),
            title,
            alt: station.name,
            keyboard: true,
          });
          marker.on("click", () => {
            const current = stationByIdRef.current.get(station.id);
            if (current) onSelectRef.current(current);
          });
          markers.set(station.id, marker);
          added.push(marker);
        } else {
          const position = marker.getLatLng();
          if (position.lat !== station.lat || position.lng !== station.lng) {
            clusters.removeLayer(marker);
            marker.setLatLng([station.lat, station.lng]);
            added.push(marker);
          }
          if (renderedStations.get(station.id)?.status !== station.status) {
            marker.setIcon(
              stationIcon(leaflet, station.id === selectedIdRef.current, station.status !== 1),
            );
          }
          marker.options.title = title;
          marker.options.alt = station.name;
          const element = marker.getElement();
          if (element) {
            element.title = title;
            element.setAttribute("alt", station.name);
          }
        }
        renderedStations.set(station.id, station);
      }
      clusters.addLayers(added);
      if (index < stations.length) timer = setTimeout(updateBatch, 16);
      else completedStationsRef.current = stations;
    };
    updateBatch();
    return () => clearTimeout(timer);
  }, [stations, mapReady, active]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    if (!active || !mapReady || !leaflet) return;
    if (lastSelectedIdRef.current === selectedId) return;

    for (const id of [lastSelectedIdRef.current, selectedId]) {
      if (!id) continue;
      const marker = markersRef.current.get(id);
      const station = stationByIdRef.current.get(id);
      if (!marker || !station) continue;
      marker.setIcon(stationIcon(leaflet, id === selectedId, station.status !== 1));
      marker.setZIndexOffset(id === selectedId ? 500 : 0);
    }
    lastSelectedIdRef.current = selectedId;
  }, [selectedId, mapReady, active]);

  useEffect(() => {
    const map = mapRef.current;
    const userLayer = userLayerRef.current;
    const leaflet = leafletRef.current;
    if (!active || !mapReady || !map || !userLayer || !leaflet || !userLocation) return;
    if (lastLocationRef.current === userLocation) return;
    lastLocationRef.current = userLocation;

    userLayer.clearLayers();
    leaflet
      .circle([userLocation.lat, userLocation.lng], {
        radius: 110,
        color: "#2563eb",
        weight: 1,
        opacity: 0.5,
        fillColor: "#2563eb",
        fillOpacity: 0.12,
        interactive: false,
      })
      .addTo(userLayer);
    leaflet
      .circleMarker([userLocation.lat, userLocation.lng], {
        radius: 7,
        className: "user-location-dot",
        color: "#ffffff",
        weight: 3,
        fillColor: "#2563eb",
        fillOpacity: 1,
      })
      .bindTooltip("目前位置")
      .addTo(userLayer);

    const nextZoom = Math.max(map.getZoom(), 14);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      map.setView([userLocation.lat, userLocation.lng], nextZoom);
    } else {
      map.flyTo([userLocation.lat, userLocation.lng], nextZoom, { duration: 0.7 });
    }
  }, [userLocation, mapReady, active]);

  return (
    <div className="map-canvas-wrap">
      <div
        ref={mapElement}
        className="map-canvas"
        role="application"
        aria-label="YouBike 站點地圖，可使用地圖上的站點標記查看站點資訊"
      />
      {!mapReady && (
        <div className="map-loading" role={mapError ? "alert" : "status"}>
          {mapError ? "地圖載入失敗，請重新整理頁面。" : "載入站點地圖…"}
        </div>
      )}
    </div>
  );
}
