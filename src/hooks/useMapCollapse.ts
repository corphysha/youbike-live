import { useCallback, useEffect, useState } from "react";

const MAP_STORAGE_KEY = "youbike-map-collapsed";

export function useMapCollapse() {
  const [mapCollapsed, setMapCollapsed] = useState(false);

  useEffect(() => {
    try {
      setMapCollapsed(window.localStorage.getItem(MAP_STORAGE_KEY) === "1");
    } catch {
      // storage blocked — map stays expanded
    }
  }, []);

  const toggleMap = useCallback(() => {
    setMapCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MAP_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // choice still applies for this session
      }
      return next;
    });
  }, []);

  return { mapCollapsed, toggleMap };
}
