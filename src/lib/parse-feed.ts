import { z } from "zod";
import { FeedError } from "./feed-error";
import { type Area, areaSchema, type StationView, stationSchema, toView } from "./schema";

export interface FeedData {
  stations: StationView[];
  areas: Area[];
}

/** Shared by the worker and the compatibility fallback; never trust the raw feed. */
export function parseFeed<K extends keyof FeedData>(kind: K, source: string): FeedData[K] {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch (error) {
    throw new FeedError("資料格式不是 JSON", error);
  }
  if (kind === "areas") {
    const parsed = z.array(areaSchema).safeParse(json);
    return (parsed.success ? parsed.data : []) as FeedData[K];
  }
  const parsed = z.array(stationSchema).safeParse(json);
  if (!parsed.success) {
    throw new FeedError("站點資料格式驗證失敗（feed 格式可能已變動）");
  }
  return parsed.data
    .filter(
      (s) => Number.isFinite(Number.parseFloat(s.lat)) && Number.isFinite(Number.parseFloat(s.lng)),
    )
    .map(toView) as FeedData[K];
}
