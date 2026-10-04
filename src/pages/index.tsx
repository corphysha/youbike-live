import Head from "next/head";
import { FeedStatus } from "../components/home/FeedStatus";
import { PageFooter } from "../components/home/PageFooter";
import { PageHeader } from "../components/home/PageHeader";
import { StationFilters } from "../components/home/StationFilters";
import { StationMapSection } from "../components/home/StationMapSection";
import { StationResults } from "../components/home/StationResults";
import { useFavorites } from "../hooks/useFavorites";
import { useMapCollapse } from "../hooks/useMapCollapse";
import { useStationFeed } from "../hooks/useStationFeed";
import { useStationSearch } from "../hooks/useStationSearch";
import { useUserLocation } from "../hooks/useUserLocation";

export default function Home() {
  const { state, errorMsg, stations, areas, lastFetch, now, load } = useStationFeed();
  const { favorites, onToggleFavorite, onClearFavorites } = useFavorites();
  const { mapCollapsed, toggleMap } = useMapCollapse();
  const { userLocation, locationStatus, locationMessage, requestLocation } = useUserLocation();
  const search = useStationSearch({ stations, areas, favorites, userLocation });

  const clearFavorites = () => {
    onClearFavorites();
    // Return to the station list so clearing favorites does not leave an empty favorites-only view.
    search.setFavOnly(false);
  };

  return (
    <>
      <Head>
        <title>YouBike 即時查詢 — 車輛與空位</title>
        <meta
          name="description"
          content="全台 YouBike 站點即時可借車輛數與可停空位數查詢，支援站名搜尋與最愛站點。"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      <a className="skip-link" href="#main-content">
        跳至站點內容
      </a>
      <PageHeader
        stationCount={stations.length}
        lastFetch={lastFetch}
        isLoading={state === "loading"}
        onRefresh={load}
      />

      <main className="shell" id="main-content">
        <StationFilters
          query={search.query}
          areaCode={search.areaCode}
          favOnly={search.favOnly}
          favoriteCount={favorites.length}
          areas={search.stationAreas}
          onQueryChange={search.setQuery}
          onShowAll={search.showAll}
          onToggleFavorites={search.toggleFavoritesOnly}
          onToggleArea={search.toggleArea}
          onClearFavorites={clearFavorites}
        />

        <FeedStatus state={state} errorMessage={errorMsg} onRetry={load} />

        {state === "ready" && (
          <>
            <StationMapSection
              stations={search.filtered}
              favorites={favorites}
              userLocation={userLocation}
              locationStatus={locationStatus}
              locationMessage={locationMessage}
              mapCollapsed={mapCollapsed}
              onRequestLocation={requestLocation}
              onToggleMap={toggleMap}
              onToggleFavorite={onToggleFavorite}
            />

            <StationResults
              shown={search.shown}
              stationCount={search.filtered.length}
              totalAvailable={search.totalAvailable}
              totalEmpty={search.totalEmpty}
              remainingCount={search.remainingCount}
              favorites={favorites}
              now={now}
              userLocation={userLocation}
              onToggleFavorite={onToggleFavorite}
              onLoadMore={search.loadMore}
            />
          </>
        )}

        <PageFooter />
      </main>
    </>
  );
}
