import { z } from "zod";
import { type Area, areaSchema, type StationView, stationSchema, toView } from "./schema";

const STATION_URL = "https://apis.youbike.com.tw/json/station-yb2.json";
const AREA_URL = "https://apis.youbike.com.tw/json/area-all.json";

export class FeedError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FeedError";
  }
}

/** Fetch + validate the unified station feed; unknown extra fields are dropped. */
export async function fetchStations(signal?: AbortSignal): Promise<StationView[]> {
  let res: Response;
  try {
    res = await fetch(STATION_URL, { signal, cache: "no-store" });
  } catch (err) {
    throw new FeedError("無法連線到 YouBike 資料來源", err);
  }
  if (!res.ok) {
    throw new FeedError(`資料來源回應 ${res.status}`);
  }
  const json: unknown = await res.json().catch((err) => {
    throw new FeedError("資料格式不是 JSON", err);
  });
  const parsed = z.array(stationSchema).safeParse(json);
  if (!parsed.success) {
    throw new FeedError("站點資料格式驗證失敗（feed 格式可能已變動）");
  }
  return parsed.data
    .filter(
      (s) => Number.isFinite(Number.parseFloat(s.lat)) && Number.isFinite(Number.parseFloat(s.lng)),
    )
    .map(toView);
}

/** Fetch + validate the area feed; returns [] when unavailable (non-fatal). */
export async function fetchAreas(signal?: AbortSignal): Promise<Area[]> {
  try {
    const res = await fetch(AREA_URL, { signal, cache: "no-store" });
    if (!res.ok) return [];
    const json: unknown = await res.json();
    const parsed = z.array(areaSchema).safeParse(json);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
