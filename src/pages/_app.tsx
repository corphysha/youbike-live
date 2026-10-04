import type { AppProps } from "next/app";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register("/youbike-live/sw.js", {
        scope: "/youbike-live/",
        updateViaCache: "none",
      })
      .catch(() => undefined);
  }, []);

  return <Component {...pageProps} />;
}
