import { useCallback, useEffect, useRef, useState } from "react";
import { FeedError, fetchAreas, fetchStations } from "../lib/api";
import type { Area, StationView } from "../lib/schema";

const REFRESH_MS = 60_000;
export type LoadState = "loading" | "ready" | "error";

/** Keep the last successful feed during failures; refresh only while the page is visible. */
export function useStationFeed() {
  const [state, setState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [stations, setStations] = useState<StationView[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());

  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [s, a] = await Promise.all([fetchStations(), fetchAreas()]);
      setStations(s);
      setAreas(a);
      setLastFetch(new Date());
      setState("ready");
      setErrorMsg("");
    } catch (err) {
      setErrorMsg(err instanceof FeedError ? err.message : "載入失敗，請稍後再試");
      setState((prev) => (prev === "ready" ? "ready" : "error"));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // refresh while visible
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
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

  return { state, errorMsg, stations, areas, lastFetch, now, load };
}
