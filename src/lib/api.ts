import { FeedError } from "./feed-error";
import { parseFeedAsync } from "./feed-parser";
import type { Area, StationView } from "./schema";

export { FeedError } from "./feed-error";

const STATION_URL = "https://apis.youbike.com.tw/json/station-yb2.json";
const AREA_URL = "https://apis.youbike.com.tw/json/area-all.json";
const REQUEST_TIMEOUT_MS = 20_000;

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Fetch + validate the unified station feed; unknown extra fields are dropped. */
export async function fetchStations(signal?: AbortSignal): Promise<StationView[]> {
  const combinedSignal = requestSignal(signal);
  let res: Response;
  try {
    res = await fetch(STATION_URL, { signal: combinedSignal, cache: "no-store" });
  } catch (err) {
    throw new FeedError("無法連線到 YouBike 資料來源", err);
  }
  if (!res.ok) {
    throw new FeedError(`資料來源回應 ${res.status}`);
  }
  return parseFeedAsync("stations", await res.text(), combinedSignal);
}

/** Fetch + validate the area feed; returns [] when unavailable (non-fatal). */
export async function fetchAreas(signal?: AbortSignal): Promise<Area[]> {
  try {
    const combinedSignal = requestSignal(signal);
    const res = await fetch(AREA_URL, { signal: combinedSignal, cache: "default" });
    if (!res.ok) return [];
    return await parseFeedAsync("areas", await res.text(), combinedSignal);
  } catch {
    return [];
  }
}
