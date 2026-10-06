import { useCallback, useEffect, useRef, useState } from "react";
import { FeedError, fetchAreas, fetchStations } from "../lib/api";
import type { Area, StationView } from "../lib/schema";

const REFRESH_MS = 60_000;
export type LoadState = "loading" | "ready" | "error";
type RefreshMode = "foreground" | "background";
interface UpdateState {
  mode: RefreshMode | "idle";
  statusMessage: string;
}

/** Keep the last successful feed during failures; refresh only while the page is visible. */
export function useStationFeed() {
  const [state, setState] = useState<LoadState>("loading");
  const [updateState, setUpdateState] = useState<UpdateState>({
    mode: "foreground",
    statusMessage: "站點資料更新中",
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [stations, setStations] = useState<StationView[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());

  const inFlight = useRef<AbortController | null>(null);

  const areaInFlight = useRef<AbortController | null>(null);
  const areasLoaded = useRef(false);
  const loadAreas = useCallback(async () => {
    if (areasLoaded.current || areaInFlight.current) return;
    const controller = new AbortController();
    areaInFlight.current = controller;
    try {
      const nextAreas = await fetchAreas(controller.signal);
      if (controller.signal.aborted) return;
      if (nextAreas.length > 0) {
        areasLoaded.current = true;
        setAreas(nextAreas);
      }
    } finally {
      if (areaInFlight.current === controller) areaInFlight.current = null;
    }
  }, []);

  const load = useCallback(
    async (mode: RefreshMode) => {
      if (inFlight.current) return;
      const controller = new AbortController();
      inFlight.current = controller;
      setUpdateState({
        mode,
        statusMessage: mode === "foreground" ? "站點資料更新中" : "",
      });
      let statusMessage = "";
      setState((prev) => (prev === "error" ? "loading" : prev));
      // Retry missing area metadata independently; never hold up the live feed.
      void loadAreas();
      try {
        const s = await fetchStations(controller.signal);
        if (controller.signal.aborted) return;
        setStations(s);
        setLastFetch(new Date());
        setState("ready");
        setErrorMsg("");
        if (mode === "foreground") statusMessage = "站點資料已更新";
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof FeedError ? err.message : "載入失敗，請稍後再試";
        setErrorMsg(message);
        if (mode === "foreground") statusMessage = `更新失敗：${message}`;
        setState((prev) => (prev === "ready" ? "ready" : "error"));
      } finally {
        if (inFlight.current === controller) {
          inFlight.current = null;
          setUpdateState({ mode: "idle", statusMessage });
        }
      }
    },
    [loadAreas],
  );

  // UI callbacks accept no mode, so event handlers cannot pass a MouseEvent into load.
  const refresh = useCallback(() => load("foreground"), [load]);

  useEffect(() => {
    void load("foreground");
    return () => {
      inFlight.current?.abort();
      inFlight.current = null;
      setUpdateState({ mode: "idle", statusMessage: "" });
      areaInFlight.current?.abort();
      areaInFlight.current = null;
    };
  }, [load]);

  // refresh while visible
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") void load("background");
    }, REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void load("background");
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  // clock for relative timestamps
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  return {
    state,
    isUpdating: updateState.mode !== "idle",
    updateMessage: updateState.statusMessage,
    errorMsg,
    stations,
    areas,
    lastFetch,
    now,
    refresh,
  };
}
