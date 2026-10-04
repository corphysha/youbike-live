import { useCallback, useEffect, useState } from "react";
import { clearFavorites, loadFavorites, toggleFavorite } from "../lib/favorites";

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  const onToggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => toggleFavorite(prev, id));
  }, []);

  const onClearFavorites = useCallback(() => {
    setFavorites(clearFavorites());
  }, []);

  return { favorites, onToggleFavorite, onClearFavorites };
}
