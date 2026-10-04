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

  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const s = await fetchStations(controller.signal);
      if (controller.signal.aborted) return;
      setStations(s);
      setLastFetch(new Date());
      setState("ready");
      setErrorMsg("");
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorMsg(err instanceof FeedError ? err.message : "載入失敗，請稍後再試");
      setState((prev) => (prev === "ready" ? "ready" : "error"));
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [load]);

  // Area names change infrequently and must never delay the live station results.
  useEffect(() => {
    const controller = new AbortController();
    void fetchAreas(controller.signal).then((nextAreas) => {
      if (!controller.signal.aborted) setAreas(nextAreas);
    });
    return () => controller.abort();
  }, []);

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
