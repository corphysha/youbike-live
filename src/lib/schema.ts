import { z } from "zod";

/**
 * YouBike official feed (unofficial/documentless):
 * https://apis.youbike.com.tw/json/station-yb2.json
 * Fields verified 2026-10-02. All counts are integers; lat/lng are strings.
 */
export const stationSchema = z.object({
  station_no: z.string(),
  name_tw: z.string(),
  name_en: z.string().catch(""),
  district_tw: z.string().catch(""),
  address_tw: z.string().catch(""),
  area_code: z.string(),
  country_code: z.string().catch("00"),
  /** 1 = active, others = suspended/closed */
  status: z.number().int(),
  type: z.number().int().catch(2),
  lat: z.string(),
  lng: z.string(),
  parking_spaces: z.number().int().nonnegative().catch(0),
  available_spaces: z.number().int().nonnegative(),
  empty_spaces: z.number().int().nonnegative(),
  forbidden_spaces: z.number().int().nonnegative().catch(0),
  available_spaces_detail: z
    .object({
      yb1: z.number().int().nonnegative().catch(0),
      yb2: z.number().int().nonnegative().catch(0),
      eyb: z.number().int().nonnegative().catch(0),
    })
    .catch({ yb1: 0, yb2: 0, eyb: 0 }),
  available_spaces_level: z.number().int().catch(0),
  time: z.string().catch(""),
  updated_at: z.string().catch(""),
});

export type Station = z.infer<typeof stationSchema>;

/** area-all.json entry */
export const areaSchema = z.object({
  area_code: z.string(),
  area_name_tw: z.string(),
  area_name_en: z.string().catch(""),
  area_english: z.string().catch(""),
  sort: z.number().int().catch(99),
});

export type Area = z.infer<typeof areaSchema>;

/** Parsed station with numeric coords and derived state */
export interface StationView {
  id: string;
  name: string;
  nameEn: string;
  district: string;
  address: string;
  areaCode: string;
  lat: number;
  lng: number;
  status: number;
  available: number;
  empty: number;
  total: number;
  detail: { yb1: number; yb2: number; eyb: number };
  /** ratio of empty/total for the dock gauge */
  dockRatio: number;
  updatedAt: string;
}

export function toView(s: Station): StationView {
  const total = s.parking_spaces || s.available_spaces + s.empty_spaces || 1;
  return {
    id: s.station_no,
    name: s.name_tw,
    nameEn: s.name_en,
    district: s.district_tw,
    address: s.address_tw,
    areaCode: s.area_code,
    lat: Number.parseFloat(s.lat),
    lng: Number.parseFloat(s.lng),
    status: s.status,
    available: s.available_spaces,
    empty: s.empty_spaces,
    total,
    detail: s.available_spaces_detail,
    dockRatio: total > 0 ? s.empty_spaces / total : 0,
    updatedAt: s.updated_at || s.time,
  };
}
