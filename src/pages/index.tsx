import {
  ArrowsClockwise,
  Bicycle,
  Crosshair,
  MagnifyingGlass,
  Moon,
  NavigationArrow,
  Star,
  Sun,
  WifiSlash,
  X,
} from "@phosphor-icons/react";
import Head from "next/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "../styles/globals.css";
import { StationCard } from "../components/StationCard";
import { StationMap } from "../components/StationMap";
import { FeedError, fetchAreas, fetchStations } from "../lib/api";
import { formatDistance, type GeoPoint, getDistanceMeters } from "../lib/distance";
import { clearFavorites, loadFavorites, toggleFavorite } from "../lib/favorites";
import { readLocationPermission, shouldRequestLocationAutomatically } from "../lib/location";
import { navigateToStation } from "../lib/navigation";
import type { Area, StationView } from "../lib/schema";

const PAGE_SIZE = 40;
const REFRESH_MS = 60_000;
const THEME_STORAGE_KEY = "youbike-theme";

type ThemePreference = "system" | "light" | "dark";
type LoadState = "loading" | "ready" | "error";
type LocationStatus = "idle" | "loading" | "ready" | "error";

function updateBrowserThemeColor(isDark: boolean) {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", isDark ? "#131612" : "#f7f6f2");
}

function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = useState(false);
  const preferenceRef = useRef<ThemePreference>("system");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => {
      setSystemDark(media.matches);
      if (preferenceRef.current === "system") updateBrowserThemeColor(media.matches);
    };

    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);

    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") {
        preferenceRef.current = stored;
        setPreference(stored);
        document.documentElement.dataset.theme = stored;
        updateBrowserThemeColor(stored === "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    } catch {
      document.documentElement.removeAttribute("data-theme");
    }

    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  const isDark = preference === "system" ? systemDark : preference === "dark";
  const label =
    preference === "system"
      ? `跟隨裝置外觀（目前${isDark ? "深色" : "淺色"}），點擊切換至${isDark ? "淺色" : "深色"}模式`
      : preference === "light"
        ? "淺色模式，點擊切換至深色模式"
        : "深色模式，點擊恢復跟隨裝置外觀";

  const cycleTheme = () => {
    const next: ThemePreference =
      preference === "system"
        ? systemDark
          ? "light"
          : "dark"
        : preference === "light"
          ? "dark"
          : "system";

    preferenceRef.current = next;
    setPreference(next);

    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
      try {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } catch {
        // The system preference still applies for this session if storage is unavailable.
      }
      updateBrowserThemeColor(systemDark);
      return;
    }

    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The selected theme still applies for this session if storage is unavailable.
    }
    updateBrowserThemeColor(next === "dark");
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={cycleTheme}
    >
      {isDark ? <Moon size={17} weight="fill" /> : <Sun size={17} weight="fill" />}
      <span className="theme-mode">
        {preference === "system" ? "自動" : isDark ? "深色" : "淺色"}
      </span>
    </button>
  );
}

export default function Home() {
  const [state, setState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [stations, setStations] = useState<StationView[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());

  const [query, setQuery] = useState("");
  const [areaCode, setAreaCode] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationMessage, setLocationMessage] = useState("");
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [s, a] = await Promise.all([fetchStations(), fetchAreas()]);
      setStations(s);
      setAreas(a);
      setLastFetch(new Date());
      setState("ready");
      setErrorMsg("");
    } catch (err) {
      setErrorMsg(err instanceof FeedError ? err.message : "載入失敗，請稍後再試");
      setState((prev) => (prev === "ready" ? "ready" : "error"));
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    setFavorites(loadFavorites());
    void load();
  }, [load]);

  // refresh while visible
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  // clock for relative timestamps
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const areaByCode = useMemo(() => {
    const m = new Map<string, Area>();
    for (const a of areas) m.set(a.area_code, a);
    return m;
  }, [areas]);

  const areaCodesWithData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stations) counts.set(s.areaCode, (counts.get(s.areaCode) ?? 0) + 1);
    return new Map(
      [...counts.entries()].sort(
        (x, y) => (areaByCode.get(x[0])?.sort ?? 99) - (areaByCode.get(y[0])?.sort ?? 99),
      ),
    );
  }, [stations, areaByCode]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const favSet = new Set(favorites);
    // 台/臺 usage varies across station names — match either form
    const q2 = q.replace(/台/g, "臺");
    const norm = (t: string) => t.toLowerCase().replace(/台/g, "臺");
    const matches = stations.filter((s) => {
      if (favOnly && !favSet.has(s.id)) return false;
      if (areaCode && s.areaCode !== areaCode) return false;
      if (!q2) return true;
      return (
        norm(s.name).includes(q2) ||
        s.nameEn.toLowerCase().includes(q2) ||
        norm(s.district).includes(q2) ||
        norm(s.address).includes(q2) ||
        s.id.includes(q2)
      );
    });
    if (!userLocation) return matches;

    return matches
      .map((station) => ({ station, distance: getDistanceMeters(userLocation, station) }))
      .sort((a, b) => a.distance - b.distance)
      .map(({ station }) => station);
  }, [stations, favorites, favOnly, areaCode, q, userLocation]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination when any filter changes
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, areaCode, favOnly]);

  const shown = filtered.slice(0, visible);
  const selectedStation = filtered.find((station) => station.id === selectedStationId) ?? null;
  const selectedDistance =
    selectedStation && userLocation ? getDistanceMeters(userLocation, selectedStation) : null;
  const areaName = (code: string) => areaByCode.get(code)?.area_name_tw ?? code;

  const onToggleFav = useCallback((id: string) => {
    setFavorites((prev) => toggleFavorite(prev, id));
  }, []);

  const onClearFavs = useCallback(() => {
    setFavorites(clearFavorites());
    setFavOnly(false);
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationMessage("此瀏覽器不支援定位；仍可用縣市篩選與搜尋站點。");
      return;
    }

    setLocationStatus("loading");
    setLocationMessage("正在取得定位…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(nextLocation);
        setLocationStatus("ready");
        setLocationMessage(
          "已依直線距離由近到遠排序。座標留在本機；本站不會接收，底圖由 OpenStreetMap 提供。",
        );
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "尚未取得定位權限；可在瀏覽器設定允許定位，或繼續搜尋站點。"
            : error.code === error.POSITION_UNAVAILABLE
              ? "目前無法判定位置；請稍後再試，或繼續搜尋站點。"
              : "定位逾時；請確認裝置定位已開啟後再試。";
        setLocationStatus("error");
        setLocationMessage(message);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    const locateOnStartup = async () => {
      const permission = await readLocationPermission(
        navigator.permissions?.query
          ? async () => {
              const status = await navigator.permissions.query({ name: "geolocation" });
              return status.state;
            }
          : undefined,
      );
      if (cancelled) return;

      if (!shouldRequestLocationAutomatically(permission)) {
        setLocationStatus("error");
        setLocationMessage(
          "定位權限已在瀏覽器中封鎖。請到此網站的權限設定開啟定位，再重新載入；你仍可搜尋站點。",
        );
        return;
      }

      requestLocation();
    };

    void locateOnStartup();
    return () => {
      cancelled = true;
    };
  }, [requestLocation]);

  useEffect(() => {
    if (selectedStationId && !selectedStation) setSelectedStationId(null);
  }, [selectedStationId, selectedStation]);

  const totalAvailable = useMemo(
    () => filtered.reduce((sum, s) => sum + (s.status === 1 ? s.available : 0), 0),
    [filtered],
  );
  const totalEmpty = useMemo(
    () => filtered.reduce((sum, s) => sum + (s.status === 1 ? s.empty : 0), 0),
    [filtered],
  );

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
      <header className="masthead">
        <div className="masthead-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <Bicycle size={19} weight="bold" color="#231f20" />
            </span>
            <span className="brand-name">YouBike 即時查詢</span>
            <span className="brand-sub">全台 {stations.length.toLocaleString()} 站</span>
          </div>
          <div className="header-spacer" />
          {lastFetch && (
            <span className="updated-note">
              更新{" "}
              {`${String(lastFetch.getHours()).padStart(2, "0")}:${String(lastFetch.getMinutes()).padStart(2, "0")}`}
            </span>
          )}
          <div className="header-actions">
            <ThemeToggle />
            <button
              type="button"
              className="refresh-btn"
              onClick={() => void load()}
              disabled={state === "loading"}
              aria-label="重新整理站點資料"
            >
              <ArrowsClockwise
                size={14}
                className={state === "loading" ? "spin" : undefined}
                aria-hidden="true"
              />
              <span className="refresh-label-full">重新整理</span>
              <span className="refresh-label-compact" aria-hidden="true">
                更新
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="shell" id="main-content">
        <div className="controls">
          <div className="search-row">
            <span className="search-icon" aria-hidden="true">
              <MagnifyingGlass size={17} />
            </span>
            <input
              type="search"
              className="search-input"
              placeholder="搜尋站名、地址或行政區…"
              name="station-search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="搜尋站點"
              enterKeyHint="search"
            />
            {query && (
              <button
                type="button"
                className="search-clear"
                aria-label="清除搜尋"
                onClick={() => setQuery("")}
              >
                <X size={15} />
              </button>
            )}
          </div>

          <nav className="chip-row" aria-label="縣市篩選">
            <button
              type="button"
              className="chip"
              aria-pressed={!areaCode && !favOnly}
              onClick={() => {
                setAreaCode(null);
                setFavOnly(false);
              }}
            >
              全部
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={favOnly}
              onClick={() => setFavOnly((v) => !v)}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Star size={12} weight={favOnly ? "fill" : "regular"} />
                最愛{favorites.length > 0 ? ` ${favorites.length}` : ""}
              </span>
            </button>
            {[...areaCodesWithData.keys()].map((code) => (
              <button
                key={code}
                type="button"
                className="chip"
                aria-pressed={areaCode === code}
                onClick={() => setAreaCode((prev) => (prev === code ? null : code))}
              >
                {areaName(code)}
              </button>
            ))}
          </nav>

          {favOnly && favorites.length === 0 && (
            <p className="filter-note">還沒有最愛站點 — 點站點旁的星星加入。</p>
          )}
          {favOnly && favorites.length > 0 && (
            <button
              type="button"
              className="filter-note"
              style={{
                background: "none",
                border: 0,
                padding: 0,
                cursor: "pointer",
                textDecoration: "underline",
              }}
              onClick={onClearFavs}
            >
              清除全部最愛
            </button>
          )}
        </div>

        {state === "loading" && (
          <div className="empty-state">
            <div className="big-icon" aria-hidden="true">
              <Bicycle size={36} />
            </div>
            <p>載入全台站點資料中…</p>
          </div>
        )}

        {state === "error" && (
          <div className="status-strip error" role="alert">
            <WifiSlash size={16} />
            <span>{errorMsg}</span>
            <button
              type="button"
              className="refresh-btn"
              onClick={() => void load()}
              style={{ marginLeft: "auto" }}
            >
              重試
            </button>
          </div>
        )}

        {state === "ready" && (
          <>
            <section className="map-section" aria-labelledby="map-title">
              <div className="map-heading">
                <div className="map-heading-copy">
                  <h2 id="map-title">站點地圖</h2>
                  <p>
                    {userLocation
                      ? "地圖顯示目前篩選的站點，清單已按距離排序。"
                      : "允許定位後會移至附近站點；下次開啟自動更新位置與距離排序。"}
                  </p>
                </div>
                <button
                  type="button"
                  className="locate-btn"
                  onClick={requestLocation}
                  disabled={locationStatus === "loading"}
                  aria-label={userLocation ? "重新取得位置並移動地圖" : "取得定位並移動地圖"}
                >
                  <Crosshair size={17} weight="bold" aria-hidden="true" />
                  <span>
                    {locationStatus === "loading"
                      ? "定位中…"
                      : userLocation
                        ? "重新定位"
                        : "定位我的位置"}
                  </span>
                </button>
              </div>
              {locationMessage && (
                <p
                  className={`location-message ${locationStatus}`}
                  role="status"
                  aria-live="polite"
                >
                  {locationMessage}
                </p>
              )}
              <StationMap
                stations={filtered}
                selectedId={selectedStationId}
                userLocation={userLocation}
                onSelectStation={(station) => setSelectedStationId(station.id)}
              />
              {selectedStation && (
                <section className="selected-station" aria-live="polite" aria-label="地圖所選站點">
                  <div className="selected-station-heading">
                    <div className="selected-station-copy">
                      <span className="selected-label">地圖所選站點</span>
                      <h3>{selectedStation.name}</h3>
                      <p>
                        {selectedStation.district}
                        {selectedStation.district && " · "}
                        {selectedStation.address}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="fav-btn selected-fav"
                      aria-pressed={favorites.includes(selectedStation.id)}
                      aria-label={
                        favorites.includes(selectedStation.id)
                          ? `取消最愛：${selectedStation.name}`
                          : `加入最愛：${selectedStation.name}`
                      }
                      onClick={() => onToggleFav(selectedStation.id)}
                    >
                      <Star
                        size={19}
                        weight={favorites.includes(selectedStation.id) ? "fill" : "regular"}
                      />
                    </button>
                  </div>
                  <div className="selected-metrics">
                    <div>
                      <span>可借車輛</span>
                      <strong className="available">
                        {selectedStation.status === 1 ? selectedStation.available : "—"}
                      </strong>
                    </div>
                    <div>
                      <span>剩餘空位</span>
                      <strong>{selectedStation.status === 1 ? selectedStation.empty : "—"}</strong>
                    </div>
                    {selectedDistance !== null && (
                      <div>
                        <span>直線距離</span>
                        <strong>{formatDistance(selectedDistance)}</strong>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="selected-nav-button"
                    aria-label={`開啟前往 ${selectedStation.name} 的步行導航`}
                    title="Android 交由系統選擇地圖 App；iPhone/iPad 開啟 Apple 地圖；無法開啟時改用 Google 地圖"
                    onClick={() => navigateToStation(selectedStation)}
                  >
                    <NavigationArrow size={18} weight="bold" aria-hidden="true" />
                    <span>步行前往</span>
                  </button>
                </section>
              )}
            </section>

            <div className="summary-line" aria-live="polite">
              <span>{filtered.length.toLocaleString()} 個站點</span>
              <span>可借 {totalAvailable.toLocaleString()} 輛</span>
              <span>空位 {totalEmpty.toLocaleString()} 格</span>
            </div>

            {shown.length === 0 ? (
              <div className="empty-state">
                <div className="big-icon" aria-hidden="true">
                  <MagnifyingGlass size={36} />
                </div>
                <p>沒有符合條件的站點</p>
              </div>
            ) : (
              <ul className="station-list">
                {shown.map((s) => (
                  <StationCard
                    key={s.id}
                    station={s}
                    isFav={favorites.includes(s.id)}
                    now={now}
                    distanceMeters={userLocation ? getDistanceMeters(userLocation, s) : undefined}
                    onToggleFav={onToggleFav}
                    onNavigateToStation={navigateToStation}
                  />
                ))}
              </ul>
            )}

            {visible < filtered.length && (
              <button
                type="button"
                className="load-more"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
              >
                顯示更多（還有 {(filtered.length - visible).toLocaleString()} 站）
              </button>
            )}
          </>
        )}

        <footer className="footer-note">
          資料來源：YouBike 官方網站 JSON feed（每分鐘更新，非正式文件化 API，格式可能變動）。版權屬
          YouBike 微笑單車公司。頁面開啟時每 60 秒自動更新；最愛站點僅儲存在你的瀏覽器。
          <br />
          可安裝為 App：Android 可從瀏覽器選單安裝；iPhone 或 iPad 請在 Safari
          分享選單選「加入主畫面」。離線時可開啟介面，站點即時資料仍需要網路。
          <br />
          <a href="https://github.com/corphysha/youbike-live" rel="noopener noreferrer">
            GitHub 原始碼
          </a>
        </footer>
      </main>
    </>
  );
}
