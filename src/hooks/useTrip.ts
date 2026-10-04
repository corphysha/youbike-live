import { useCallback, useEffect, useState } from "react";
import { EMPTY_TRIP, loadTrip, saveTrip, setTripStation, type Trip } from "../lib/trip";

export function useTrip() {
  const [trip, setTrip] = useState<Trip>(EMPTY_TRIP);

  useEffect(() => {
    setTrip(loadTrip());
  }, []);

  /** Pressing the same role again on the same station clears it. */
  const toggleTripStation = useCallback((role: "start" | "end", id: string) => {
    setTrip((prev) => {
      const current = role === "start" ? prev.startId : prev.endId;
      return saveTrip(setTripStation(prev, role, current === id ? null : id));
    });
  }, []);

  const swapTrip = useCallback(() => {
    setTrip((prev) => saveTrip({ startId: prev.endId, endId: prev.startId }));
  }, []);

  const clearTrip = useCallback(() => {
    setTrip(saveTrip(EMPTY_TRIP));
  }, []);

  return { trip, toggleTripStation, swapTrip, clearTrip };
}
