import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchStations } from "../lib/api";
import {
  type ArrivalMessage,
  type ArrivalState,
  type ArrivalTarget,
  buildArrivalMessage,
  collectArrivalTargets,
  detectArrivals,
  INITIAL_ARRIVAL_STATE,
} from "../lib/arrival";
import type { StationView } from "../lib/schema";
import type { Trip } from "../lib/trip";

const ENABLED_KEY = "youbike-live:arrival-alerts";
const ICON_URL = "/youbike-live/icons/icon-192.png";
const FRESH_FEED_TIMEOUT_MS = 8_000;

export type AlertPermission = NotificationPermission | "unsupported";

interface Options {
  stations: StationView[];
  favorites: string[];
  trip: Trip;
}

export interface ArrivalAlertRecord extends ArrivalMessage {
  at: Date;
}

function persistEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // choice still applies for this session
  }
}

/** Prefer the service worker so notifications also work on Android, where `new Notification` throws. */
async function showSystemNotification({ title, body }: ArrivalMessage, tag: string) {
  const options: NotificationOptions = {
    body,
    tag: `arrival-${tag}`,
    icon: ICON_URL,
    badge: ICON_URL,
    data: { url: "/youbike-live/" },
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
  } catch {
    // fall back to the page-level API below
  }
  try {
    new Notification(title, options);
  } catch {
    // the in-page record still shows the alert
  }
}

/**
 * Watches the device position while the page is open and notifies when the user comes within
 * range of a favorite station or the trip's start/end. Browsers cannot geofence a closed page.
 */
export function useArrivalAlerts({ stations, favorites, trip }: Options) {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<AlertPermission>("default");
  const [watchError, setWatchError] = useState("");
  const [lastAlert, setLastAlert] = useState<ArrivalAlertRecord | null>(null);

  const targets = useMemo(
    () => collectArrivalTargets(stations, favorites, trip),
    [stations, favorites, trip],
  );
  const targetsRef = useRef<ArrivalTarget[]>(targets);
  const stationsRef = useRef<StationView[]>(stations);
  const stateRef = useRef<ArrivalState>(INITIAL_ARRIVAL_STATE);
  targetsRef.current = targets;
  stationsRef.current = stations;

  useEffect(() => {
    if (!("Notification" in window) || !navigator.geolocation) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    try {
      if (
        window.localStorage.getItem(ENABLED_KEY) === "1" &&
        Notification.permission === "granted"
      ) {
        setEnabled(true);
      }
    } catch {
      // storage blocked — alerts start disabled
    }
  }, []);

  const notifyArrivals = useCallback(async (arrivals: ArrivalTarget[]) => {
    // A hidden page pauses feed refreshes, so fetch the latest counts before reporting them.
    let latest = stationsRef.current;
    try {
      latest = await fetchStations(AbortSignal.timeout(FRESH_FEED_TIMEOUT_MS));
    } catch {
      // report the last known counts instead
    }
    const byId = new Map(latest.map((station) => [station.id, station]));
    for (const arrival of arrivals) {
      const station = byId.get(arrival.station.id) ?? arrival.station;
      const message = buildArrivalMessage({ ...arrival, station }, latest);
      setLastAlert({ ...message, at: new Date() });
      await showSystemNotification(message, station.id);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    stateRef.current = INITIAL_ARRIVAL_STATE;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setWatchError("");
        const result = detectArrivals(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          targetsRef.current,
          stateRef.current,
          Date.now(),
        );
        stateRef.current = result.state;
        if (result.arrivals.length > 0) void notifyArrivals(result.arrivals);
      },
      (error) => {
        setWatchError(
          error.code === error.PERMISSION_DENIED
            ? "沒有定位權限，無法偵測是否抵達站點。"
            : "暫時無法取得位置，會持續重試。",
        );
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, notifyArrivals]);

  const enableAlerts = useCallback(async () => {
    if (!("Notification" in window) || !navigator.geolocation) return;
    const result =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") return;
    setEnabled(true);
    persistEnabled(true);
  }, []);

  const disableAlerts = useCallback(() => {
    setEnabled(false);
    setWatchError("");
    persistEnabled(false);
  }, []);

  return {
    alertsEnabled: enabled,
    alertPermission: permission,
    alertTargetCount: targets.length,
    alertWatchError: watchError,
    lastAlert,
    enableAlerts,
    disableAlerts,
  };
}
