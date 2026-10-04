import { useCallback, useEffect, useState } from "react";
import type { GeoPoint } from "../lib/distance";
import { readLocationPermission, shouldRequestLocationAutomatically } from "../lib/location";

export type LocationStatus = "idle" | "loading" | "ready" | "error";

export function useUserLocation() {
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationMessage, setLocationMessage] = useState("");

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationMessage("此瀏覽器不支援定位；仍可用縣市篩選與搜尋站點。");
      return;
    }

    setLocationStatus("loading");
    setLocationMessage("正在取得定位…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(nextLocation);
        setLocationStatus("ready");
        setLocationMessage(
          "已依直線距離由近到遠排序。座標留在本機；本站不會接收，底圖由 OpenStreetMap 提供。",
        );
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "尚未取得定位權限；可在瀏覽器設定允許定位，或繼續搜尋站點。"
            : error.code === error.POSITION_UNAVAILABLE
              ? "目前無法判定位置；請稍後再試，或繼續搜尋站點。"
              : "定位逾時；請確認裝置定位已開啟後再試。";
        setLocationStatus("error");
        setLocationMessage(message);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    const locateOnStartup = async () => {
      const permission = await readLocationPermission(
        navigator.permissions?.query
          ? async () => {
              const status = await navigator.permissions.query({ name: "geolocation" });
              return status.state;
            }
          : undefined,
      );
      if (cancelled) return;

      if (!shouldRequestLocationAutomatically(permission)) {
        setLocationStatus("error");
        setLocationMessage(
          "定位權限已在瀏覽器中封鎖。請到此網站的權限設定開啟定位，再重新載入；你仍可搜尋站點。",
        );
        return;
      }

      requestLocation();
    };

    void locateOnStartup();
    return () => {
      cancelled = true;
    };
  }, [requestLocation]);

  return { userLocation, locationStatus, locationMessage, requestLocation };
}
