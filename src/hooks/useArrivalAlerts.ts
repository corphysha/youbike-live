import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchStations } from "../lib/api";
import {
  type ArrivalMessage,
  type ArrivalMonitor,
  type ArrivalTarget,
  buildArrivalMessage,
  collectArrivalTargets,
  createArrivalMonitor,
} from "../lib/arrival";
import { buildRouteMessage, type SavedRoute } from "../lib/routes";
import type { StationView } from "../lib/schema";
import type { Trip } from "../lib/trip";

const ENABLED_KEY = "youbike-live:arrival-alerts";
const ICON_URL = "/icons/icon-192.png";
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

/** `renotify` is missing from TypeScript's DOM lib but Chromium still honors it. */
type AlertNotificationOptions = NotificationOptions & { renotify?: boolean };

/**
 * Hand the message to the OS notification center (Windows/macOS/Android/iOS).
 * Prefer the service worker so it also works on Android, where `new Notification` throws.
 * Web pages cannot set an OS priority; `urgent` keeps the notification on screen until dismissed
 * (Chromium desktop) instead.
 */
async function showSystemNotification(
  { title, body }: ArrivalMessage,
  tag: string,
  { urgent = false }: { urgent?: boolean } = {},
) {
  const options: AlertNotificationOptions = {
    body,
    tag: `arrival-${tag}`,
    // Replacing a same-tag notification is silent unless renotify is set.
    renotify: true,
    requireInteraction: urgent,
    icon: ICON_URL,
    badge: ICON_URL,
    data: { url: "/" },
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return true;
    }
  } catch {
    // fall back to the page-level API below
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    // the in-page record still shows the alert
    return false;
  }
}

/** Trip stations first: they are the ones a test notification is most useful for. */
const TEST_ROLE_ORDER: Record<ArrivalTarget["role"], number> = { start: 0, end: 1, favorite: 2 };

async function requestNotificationPermission(): Promise<AlertPermission> {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission === "granted" ? "granted" : Notification.requestPermission();
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
  const [testStatus, setTestStatus] = useState("");
  const [routeStatus, setRouteStatus] = useState("");

  const targets = useMemo(
    () => collectArrivalTargets(stations, favorites, trip),
    [stations, favorites, trip],
  );
  const targetsRef = useRef<ArrivalTarget[]>(targets);
  const stationsRef = useRef<StationView[]>(stations);
  const monitorRef = useRef<ArrivalMonitor | null>(null);
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

  /**
   * Returns how many notifications the OS accepted. Watch-triggered calls pass `isActive` so a
   * delivery still waiting on the feed is dropped once alerts are turned off or the page unmounts.
   */
  const notifyArrivals = useCallback(
    async (
      arrivals: ArrivalTarget[],
      {
        arrived = true,
        isActive = () => true,
      }: { arrived?: boolean; isActive?: () => boolean } = {},
    ) => {
      // A hidden page pauses feed refreshes, so fetch the latest counts before reporting them.
      let latest = stationsRef.current;
      try {
        latest = await fetchStations(AbortSignal.timeout(FRESH_FEED_TIMEOUT_MS));
      } catch {
        // report the last known counts instead
      }
      const byId = new Map(latest.map((station) => [station.id, station]));
      let shown = 0;
      for (const arrival of arrivals) {
        if (!isActive()) break;
        const station = byId.get(arrival.station.id) ?? arrival.station;
        const message = buildArrivalMessage({ ...arrival, station }, latest, { arrived });
        setLastAlert({ ...message, at: new Date() });
        // Trip start/end alerts stay on screen; favorites are informational.
        const urgent = arrival.role !== "favorite";
        if (await showSystemNotification(message, station.id, { urgent })) shown += 1;
      }
      return shown;
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    const monitor = createArrivalMonitor(
      () => targetsRef.current,
      (arrivals, isActive) => void notifyArrivals(arrivals, { isActive }),
    );
    monitorRef.current = monitor;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setWatchError("");
        monitor.update({ lat: position.coords.latitude, lng: position.coords.longitude });
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
    return () => {
      navigator.geolocation.clearWatch(watchId);
      monitor.stop();
      if (monitorRef.current === monitor) monitorRef.current = null;
    };
  }, [enabled, notifyArrivals]);

  // The first fix can arrive before the feed loads; re-check it whenever the targets change.
  useEffect(() => {
    if (targets.length > 0) monitorRef.current?.recheck();
  }, [targets]);

  const enableAlerts = useCallback(async () => {
    if (!("Notification" in window) || !navigator.geolocation) return;
    const result =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") return;
    setEnabled(true);
    persistEnabled(true);
  }, []);

  /**
   * Send the current counts of the trip stations (or first favorite) as an OS notification right
   * away, without waiting for a location change — desktops never "arrive" anywhere.
   */
  const sendTestAlert = useCallback(async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result !== "granted") {
      setTestStatus(result === "denied" ? "通知權限被拒絕，無法傳送。" : "");
      return;
    }
    const picks = [...targetsRef.current]
      .sort((a, b) => TEST_ROLE_ORDER[a.role] - TEST_ROLE_ORDER[b.role])
      .filter((target, index) => target.role !== "favorite" || index === 0);
    setTestStatus("傳送中…");
    const shown =
      picks.length > 0
        ? await notifyArrivals(picks, { arrived: false })
        : Number(
            await showSystemNotification(
              {
                title: "YouBike 即時查詢通知已啟用",
                body: "加入最愛站點或設定起終點後，通知會顯示可借車輛與剩餘空位。",
              },
              "test",
            ),
          );
    setTestStatus(
      shown > 0
        ? `已送出 ${shown} 則系統通知。沒看到的話，請檢查作業系統的通知設定是否允許此瀏覽器、以及是否開啟勿擾模式。`
        : "瀏覽器無法顯示系統通知。",
    );
  }, [notifyArrivals]);

  /** Notify the saved route's start bikes and end docks in one OS notification. */
  const sendRouteAlert = useCallback(async (route: SavedRoute) => {
    // Ask first, while the click still counts as a user gesture for the permission prompt.
    const result = await requestNotificationPermission();
    setPermission(result);
    setRouteStatus("查詢中…");
    let latest = stationsRef.current;
    try {
      latest = await fetchStations(AbortSignal.timeout(FRESH_FEED_TIMEOUT_MS));
    } catch {
      // report the last known counts instead
    }
    const message = buildRouteMessage(route, latest);
    setLastAlert({ ...message, at: new Date() });
    if (result !== "granted") {
      setRouteStatus(
        result === "unsupported"
          ? "此瀏覽器不支援系統通知，結果顯示在「最近提醒」。"
          : "未取得通知權限，結果顯示在「最近提醒」。",
      );
      return;
    }
    const shown = await showSystemNotification(message, route.id);
    setRouteStatus(shown ? "已送出系統通知。" : "瀏覽器無法顯示系統通知，結果顯示在「最近提醒」。");
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
    testStatus,
    routeStatus,
    enableAlerts,
    sendTestAlert,
    sendRouteAlert,
    disableAlerts,
  };
}
