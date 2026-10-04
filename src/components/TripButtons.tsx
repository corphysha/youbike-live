import { FlagCheckered, MapPin } from "@phosphor-icons/react";

interface Props {
  stationId: string;
  stationName: string;
  tripRole: "start" | "end" | null;
  onToggleTripStation: (role: "start" | "end", id: string) => void;
  className?: string;
}

export function TripButtons({
  stationId,
  stationName,
  tripRole,
  onToggleTripStation,
  className = "trip-buttons",
}: Props) {
  return (
    <div className={className}>
      <button
        type="button"
        className="trip-btn"
        aria-pressed={tripRole === "start"}
        aria-label={tripRole === "start" ? `取消起點：${stationName}` : `設為起點：${stationName}`}
        onClick={() => onToggleTripStation("start", stationId)}
      >
        <MapPin size={14} weight={tripRole === "start" ? "fill" : "bold"} aria-hidden="true" />
        <span>{tripRole === "start" ? "起點" : "設為起點"}</span>
      </button>
      <button
        type="button"
        className="trip-btn"
        aria-pressed={tripRole === "end"}
        aria-label={tripRole === "end" ? `取消終點：${stationName}` : `設為終點：${stationName}`}
        onClick={() => onToggleTripStation("end", stationId)}
      >
        <FlagCheckered size={14} weight={tripRole === "end" ? "fill" : "bold"} aria-hidden="true" />
        <span>{tripRole === "end" ? "終點" : "設為終點"}</span>
      </button>
    </div>
  );
}
