import type { ArrivalRole, ArrivalTarget } from "./arrival";
import { bikeSummary } from "./format";
import type { SavedRoute } from "./routes";
import type { StationView } from "./schema";
import { checkTripStation, findAlternatives } from "./trip";

const ARRIVED_LABEL: Record<ArrivalRole, string> = {
  favorite: "已到達最愛站點",
  start: "已到達起點",
  end: "已到達終點",
};

/** Used when the user asks for the current status without having arrived. */
const STATUS_LABEL: Record<ArrivalRole, string> = {
  favorite: "最愛站點",
  start: "起點",
  end: "終點",
};

export interface ArrivalMessage {
  title: string;
  body: string;
}

export function buildArrivalMessage(
  { station, role }: ArrivalTarget,
  stations: StationView[] = [],
  { arrived = true } = {},
): ArrivalMessage {
  const title = `${(arrived ? ARRIVED_LABEL : STATUS_LABEL)[role]}：${station.name}`;
  if (station.status !== 1) return { title, body: "此站暫停營運，請改用附近站點。" };

  const bikes = bikeSummary(station);
  const docks = `空位 ${station.empty} 格`;
  const counts = role === "end" ? `${docks} · ${bikes}` : `${bikes} · ${docks}`;
  const lacking = role === "end" ? station.empty === 0 : station.available === 0;
  if (role === "favorite" || !lacking) return { title, body: counts };

  const [nearest] = findAlternatives(stations, station, role, { limit: 1 });
  const hint = nearest
    ? `附近「${nearest.station.name}」${
        role === "end" ? `空位 ${nearest.station.empty} 格` : bikeSummary(nearest.station)
      }（約 ${Math.round(nearest.distance)} 公尺）`
    : "500 公尺內沒有其他可用站點";
  return { title, body: `${counts}。${hint}` };
}

function legSummary(
  station: StationView | undefined,
  leg: "start" | "end",
  stations: StationView[],
): string {
  const label = leg === "start" ? "起點" : "終點";
  const check = checkTripStation(station ?? null, leg);
  if (!station || check === "missing") return `${label}站點資料不存在`;
  if (check === "offline") return `${label}暫停營運`;

  const count =
    leg === "start" ? `${label}${bikeSummary(station)}` : `${label}空位 ${station.empty} 格`;
  if (check !== "none") return count;

  const [nearest] = findAlternatives(stations, station, leg, { limit: 1 });
  if (!nearest) return `${count}（500 公尺內無替代站）`;
  const altCount =
    leg === "start" ? bikeSummary(nearest.station) : `空位 ${nearest.station.empty} 格`;
  return `${count}，附近「${nearest.station.name}」${altCount}（約 ${Math.round(nearest.distance)} 公尺）`;
}

/** One notification covering both ends: bikes at the start, docks at the end. */
export function buildRouteMessage(route: SavedRoute, stations: StationView[]): ArrivalMessage {
  const byId = new Map(stations.map((station) => [station.id, station]));
  const start = byId.get(route.startId);
  const end = byId.get(route.endId);
  return {
    title: `路線：${start?.name ?? route.startId} → ${end?.name ?? route.endId}`,
    body: `${legSummary(start, "start", stations)}\n${legSummary(end, "end", stations)}`,
  };
}
