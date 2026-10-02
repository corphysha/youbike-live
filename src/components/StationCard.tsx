import { Lightning, Star } from "@phosphor-icons/react";
import { ageMinutes, availabilityLevel, LEVEL_LABEL, shortTime } from "../lib/format";
import type { StationView } from "../lib/schema";

interface Props {
  station: StationView;
  isFav: boolean;
  now: Date;
  onToggleFav: (id: string) => void;
}

export function StationCard({ station, isFav, now, onToggleFav }: Props) {
  const level = availabilityLevel(station.available, station.empty, station.status);
  const age = ageMinutes(station.updatedAt, now);
  const detail = station.detail;

  return (
    <li className={`station-card${isFav ? " fav" : ""}`}>
      <div className="station-name">
        <button
          type="button"
          className="fav-btn"
          aria-pressed={isFav}
          aria-label={isFav ? `取消最愛：${station.name}` : `加入最愛：${station.name}`}
          onClick={() => onToggleFav(station.id)}
        >
          {isFav ? <Star size={18} weight="fill" /> : <Star size={18} />}
        </button>
        <span className="name-text">{station.name}</span>
        {detail.eyb > 0 && (
          <span title="有 YouBike 2.0E 電輔車" style={{ color: "var(--warn)", flex: "none" }}>
            <Lightning size={14} weight="fill" />
          </span>
        )}
      </div>
      <div className="station-name-en">
        {station.district}
        {station.district && " · "}
        {station.address}
      </div>

      <div className="station-nums">
        {level === "offline" ? (
          <span className="state-badge offline">
            <span className="state-dot" />
            {LEVEL_LABEL.offline}
          </span>
        ) : (
          <>
            <div className="num-block num-available">
              <div className="num">{station.available}</div>
              <div className="num-label">可借</div>
            </div>
            <div className="dock-gauge" aria-hidden="true">
              <div className="fill" style={{ height: `${Math.round(station.dockRatio * 100)}%` }} />
            </div>
            <div className="num-block num-empty">
              <div className="num">{station.empty}</div>
              <div className="num-label">空位</div>
            </div>
          </>
        )}
      </div>

      <div className="detail-line">
        <span className={`state-badge ${level}`}>
          <span className="state-dot" />
          {LEVEL_LABEL[level]}
        </span>
        <span>
          2.0 {detail.yb2} · 2.0E {detail.eyb}
          {detail.yb1 > 0 ? ` · 1.0 ${detail.yb1}` : ""}
        </span>
        <span className="muted">更新 {shortTime(station.updatedAt, now)}</span>
        {age !== null && age >= 20 && <span className="muted">（{age} 分鐘前）</span>}
      </div>
    </li>
  );
}
