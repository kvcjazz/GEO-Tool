"use client";

import { useAppState } from "@/state/AppState";
import { r1 } from "@/lib/format";
import type { DateRange } from "@/lib/types";

export function StrategyBanner() {
  const { brand } = useAppState();
  if (!brand) return null;
  if (!brand.objective && !brand.positioning) return null;
  return (
    <div className="strategy-banner">
      <div className="lbl">Visibility strategy</div>
      <div className="obj">{brand.objective || brand.positioning}</div>
      <div className="meta">
        {brand.positioning && (
          <>
            <b>Positioning:</b> {brand.positioning} &nbsp;·&nbsp;{" "}
          </>
        )}
        {brand.audience && (
          <>
            <b>Audience:</b> {brand.audience} &nbsp;·&nbsp;{" "}
          </>
        )}
        {brand.themes && (
          <>
            <b>Themes:</b> {brand.themes}
          </>
        )}
      </div>
    </div>
  );
}

export function Kpi({ l, v }: { l: string; v: number }) {
  return (
    <div className="card kpi">
      <div className="v">{r1(v)}</div>
      <div className="l">{l}</div>
      <div className="bar">
        <i style={{ width: `${Math.min(100, v)}%` }} />
      </div>
    </div>
  );
}

export function MetricRow({ l, v, w }: { l: string; v: number; w: number }) {
  return (
    <tr>
      <td>{l}</td>
      <td>
        <b>{r1(v)}</b>
      </td>
      <td className="muted">{w}%</td>
    </tr>
  );
}

const DR_OPTS: [DateRange["mode"], string][] = [
  ["all", "All time"],
  ["1", "Last month"],
  ["3", "Last quarter"],
  ["12", "Last 12 months"],
  ["custom", "Custom"],
];

export function DateFilter() {
  const { dateRange, setDateRange } = useAppState();
  return (
    <div className="flex" style={{ gap: 6 }}>
      <select
        style={{ width: "auto", fontSize: 12 }}
        value={dateRange.mode}
        onChange={(e) => {
          const mode = e.target.value as DateRange["mode"];
          setDateRange(
            mode === "custom"
              ? { ...dateRange, mode }
              : { mode, from: null, to: null },
          );
        }}
      >
        {DR_OPTS.map((o) => (
          <option key={o[0]} value={o[0]}>
            {o[1]}
          </option>
        ))}
      </select>
      {dateRange.mode === "custom" && (
        <>
          <input
            type="date"
            style={{ width: "auto", fontSize: 12 }}
            value={dateRange.from || ""}
            onChange={(e) =>
              setDateRange({ ...dateRange, from: e.target.value || null })
            }
          />
          <input
            type="date"
            style={{ width: "auto", fontSize: 12 }}
            value={dateRange.to || ""}
            onChange={(e) =>
              setDateRange({ ...dateRange, to: e.target.value || null })
            }
          />
        </>
      )}
    </div>
  );
}
