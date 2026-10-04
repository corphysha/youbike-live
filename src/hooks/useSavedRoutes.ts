import { useCallback, useEffect, useState } from "react";
import { loadRoutes, removeRoute, type SavedRoute, toggleRoute } from "../lib/routes";

export function useSavedRoutes() {
  const [routes, setRoutes] = useState<SavedRoute[]>([]);

  useEffect(() => {
    setRoutes(loadRoutes());
  }, []);

  const onToggleRoute = useCallback((startId: string, endId: string) => {
    setRoutes((prev) => toggleRoute(prev, startId, endId));
  }, []);

  const onRemoveRoute = useCallback((id: string) => {
    setRoutes((prev) => removeRoute(prev, id));
  }, []);

  return { routes, onToggleRoute, onRemoveRoute };
}
