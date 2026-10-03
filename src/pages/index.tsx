import {
  ArrowsClockwise,
  Bicycle,
  MagnifyingGlass,
  Moon,
  Star,
  Sun,
  WifiSlash,
  X,
} from "@phosphor-icons/react";
import Head from "next/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../styles/globals.css";
import { StationCard } from "../components/StationCard";
import { FeedError, fetchAreas, fetchStations } from "../lib/api";
import { clearFavorites, loadFavorites, toggleFavorite } from "../lib/favorites";
import type { Area, StationView } from "../lib/schema";

const PAGE_SIZE = 40;
const REFRESH_MS = 60_000;
const THEME_STORAGE_KEY = "youbike-theme";

type ThemePreference = "system" | "light" | "dark";
type LoadState = "loading" | "ready" | "error";

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
    return stations.filter((s) => {
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
  }, [stations, favorites, favOnly, areaCode, q]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination when any filter changes
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, areaCode, favOnly]);

  const shown = filtered.slice(0, visible);
  const areaName = (code: string) => areaByCode.get(code)?.area_name_tw ?? code;

  const onToggleFav = useCallback((id: string) => {
    setFavorites((prev) => toggleFavorite(prev, id));
  }, []);

  const onClearFavs = useCallback(() => {
    setFavorites(clearFavorites());
    setFavOnly(false);
  }, []);

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

      <main className="shell">
        <div className="controls">
          <div className="search-row">
            <span className="search-icon" aria-hidden="true">
              <MagnifyingGlass size={17} />
            </span>
            <input
              type="search"
              className="search-input"
              placeholder="搜尋站名、地址或行政區…"
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
                    onToggleFav={onToggleFav}
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
          <a href="https://github.com/corphysha/youbike-live" rel="noopener noreferrer">
            GitHub 原始碼
          </a>
        </footer>
      </main>
    </>
  );
}
