import { MagnifyingGlass, Star, X } from "@phosphor-icons/react";

interface Props {
  query: string;
  areaCode: string | null;
  favOnly: boolean;
  favoriteCount: number;
  areas: { code: string; name: string }[];
  onQueryChange: (query: string) => void;
  onShowAll: () => void;
  onToggleFavorites: () => void;
  onToggleArea: (code: string) => void;
  onClearFavorites: () => void;
}

export function StationFilters({
  query,
  areaCode,
  favOnly,
  favoriteCount,
  areas,
  onQueryChange,
  onShowAll,
  onToggleFavorites,
  onToggleArea,
  onClearFavorites,
}: Props) {
  return (
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
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="搜尋站點"
          enterKeyHint="search"
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            aria-label="清除搜尋"
            onClick={() => onQueryChange("")}
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
          onClick={onShowAll}
        >
          全部
        </button>
        <button type="button" className="chip" aria-pressed={favOnly} onClick={onToggleFavorites}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Star size={12} weight={favOnly ? "fill" : "regular"} />
            最愛{favoriteCount > 0 ? ` ${favoriteCount}` : ""}
          </span>
        </button>
        {areas.map(({ code, name }) => (
          <button
            key={code}
            type="button"
            className="chip"
            aria-pressed={areaCode === code}
            onClick={() => onToggleArea(code)}
          >
            {name}
          </button>
        ))}
      </nav>

      {favOnly && favoriteCount === 0 && (
        <p className="filter-note">還沒有最愛站點 — 點站點旁的星星加入。</p>
      )}
      {favOnly && favoriteCount > 0 && (
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
          onClick={onClearFavorites}
        >
          清除全部最愛
        </button>
      )}
    </div>
  );
}
