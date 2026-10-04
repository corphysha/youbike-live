import { FeedError } from "./feed-error";
import { parseFeedAsync } from "./feed-parser";
import { createRequest, throwIfAborted } from "./request";
import type { Area, StationView } from "./schema";

export { FeedError } from "./feed-error";

const STATION_URL = "https://apis.youbike.com.tw/json/station-yb2.json";
const AREA_URL = "https://apis.youbike.com.tw/json/area-all.json";
// The nationwide feed is several MB; allow slow connections to finish downloading it.
const STATION_TIMEOUT_MS = 90_000;
const AREA_TIMEOUT_MS = 20_000;

/** Fetch + validate the unified station feed; unknown extra fields are dropped. */
export async function fetchStations(signal?: AbortSignal): Promise<StationView[]> {
  const request = createRequest(STATION_TIMEOUT_MS, signal);
  try {
    throwIfAborted(request.signal);
    const res = await fetch(STATION_URL, { signal: request.signal, cache: "no-store" });
    if (!res.ok) throw new FeedError(`資料來源回應 ${res.status}`);
    return await parseFeedAsync("stations", await res.text(), request.signal);
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (request.timedOut || name === "TimeoutError") {
      throw new FeedError("站點資料載入逾時，請確認網路連線後再試", error);
    }
    if (signal?.aborted || name === "AbortError") {
      throw new FeedError("站點資料載入已取消", error);
    }
    if (error instanceof FeedError) throw error;
    throw new FeedError("無法連線到 YouBike 資料來源", error);
  } finally {
    request.dispose();
  }
}

/** Fetch + validate the area feed; returns [] when unavailable (non-fatal). */
export async function fetchAreas(signal?: AbortSignal): Promise<Area[]> {
  const request = createRequest(AREA_TIMEOUT_MS, signal);
  try {
    throwIfAborted(request.signal);
    const res = await fetch(AREA_URL, { signal: request.signal, cache: "default" });
    if (!res.ok) return [];
    return await parseFeedAsync("areas", await res.text(), request.signal);
  } catch {
    return [];
  } finally {
    request.dispose();
  }
}
