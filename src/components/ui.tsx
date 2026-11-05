"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppState } from "@/state/AppState";
import {
  formatSummary,
  hasStrategy,
  parseSummary,
  saveSummary,
  strategySource,
  summaryState,
  writeSummary,
} from "@/lib/strategySummary";
import { r1 } from "@/lib/format";
import type { DateRange } from "@/lib/types";

/**
 * The visibility strategy at the top of the Overview: a short AI summary of the
 * strategy and PR profile in Client setup, written automatically and editable
 * by the team. An AI summary is rewritten when Client setup changes; one the
 * team has edited is kept and flagged as out of date instead.
 */
export function StrategyBanner() {
  const { brand, data, sb, mode, patchBrand, toast, setView } = useAppState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Auto-writes at most once per client + strategy version on this screen.
  const tried = useRef<string>("");
  // The client on screen now, so a reply that lands after a switch isn't shown
  // on the wrong client.
  const current = useRef(brand?.id);
  useEffect(() => {
    current.current = brand?.id;
  }, [brand?.id]);

  const team = mode === "team";
  const state = brand ? summaryState(brand) : "ok";
  const show = !!brand && hasStrategy(brand);

  const regenerate = useCallback(async () => {
    if (!brand) return;
    setBusy(true);
    setError("");
    const out = await writeSummary(brand, data);
    if (out.patch) {
      // Saved for everyone if this account can edit the client, and shown here
      // either way.
      const saved = await saveSummary(sb, brand.id, out.patch);
      if (current.current === brand.id) {
        patchBrand(out.patch);
        if (!saved.ok && team) toast("Summary not saved: " + saved.error);
      }
    } else if (current.current === brand.id) {
      setError(out.error || "unknown error");
    }
    setBusy(false);
  }, [brand, data, sb, patchBrand, toast, team]);

  useEffect(() => {
    if (!brand || !show || editing) return;
    if (state !== "missing" && state !== "stale") return;
    const key = brand.id + "|" + strategySource(brand);
    if (tried.current === key) return;
    tried.current = key;
    void regenerate();
  }, [brand, show, state, editing, regenerate]);

  if (!brand || !show) return null;

  async function saveEdit() {
    const text = draft
      .split("\n")
      .map((l) => l.trimEnd())
      .join("\n")
      .trim();
    if (!text) return;
    const patch = {
      strategy_summary: text,
      strategy_summary_source: strategySource(brand!),
      strategy_summary_edited: true,
    };
    const saved = await saveSummary(sb, brand!.id, patch);
    if (!saved.ok) return toast("Not saved: " + saved.error);
    patchBrand(patch);
    setEditing(false);
    toast("Strategy summary saved");
  }

  function openSetup() {
    setView("setup");
    setTimeout(
      () =>
        document
          .getElementById("setup-strategy")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  }

  const summary = brand.strategy_summary?.trim()
    ? parseSummary(brand.strategy_summary)
    : null;

  return (
    <div className="strategy-banner">
      <div className="lbl">
        Visibility strategy
        {busy && <span className="sb-status"> · summarising…</span>}
      </div>

      {editing ? (
        <div className="stack" style={{ marginTop: 8 }}>
          <textarea
            rows={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Strategy summary"
          />
          <div className="legend-note" style={{ marginTop: 0 }}>
            The first line is the headline. Start a line with “- ” to make it a bullet.
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <button className="btn sm" onClick={saveEdit} disabled={!draft.trim()}>
              Save summary
            </button>
            <button className="btn sm ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : summary ? (
        <>
          <div className="obj">{summary.headline}</div>
          {summary.points.length > 0 && (
            <ul className="sb-points">
              {summary.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </>
      ) : (
        // No summary yet (being written, or the AI call failed): the raw fields.
        <>
          <div className="obj">{brand.objective || brand.positioning}</div>
          <div className="meta">
            {brand.positioning && brand.objective && (
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
        </>
      )}

      {team && !editing && (
        <>
          {state === "outdated-edit" && !busy && (
            <div className="sb-warn">
              Client setup has changed since this summary was edited.{" "}
              <button type="button" className="sb-link" onClick={regenerate}>
                Rewrite it from Client setup
              </button>
            </div>
          )}
          {error && (
            <div className="sb-warn">
              Couldn&#39;t write the summary: {error}{" "}
              <button type="button" className="sb-link" onClick={regenerate}>
                Try again
              </button>
            </div>
          )}
          <div className="sb-actions">
            <span>
              {summary
                ? brand.strategy_summary_edited
                  ? "Edited by the team"
                  : "AI summary of Client setup"
                : ""}
            </span>
            <button
              type="button"
              className="sb-link"
              onClick={() => {
                setDraft(
                  brand.strategy_summary ||
                    formatSummary(
                      brand.objective || brand.positioning || "",
                      [brand.objective ? brand.positioning : null, brand.audience, brand.themes]
                        .filter((x): x is string => !!x),
                    ),
                );
                setEditing(true);
              }}
            >
              ✎ Edit
            </button>
            {!busy && summary && (
              <button type="button" className="sb-link" onClick={regenerate}>
                ✨ Rewrite
              </button>
            )}
            <button type="button" className="sb-link" onClick={openSetup}>
              Full strategy →
            </button>
          </div>
        </>
      )}
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

/**
 * Marks anything that comes from search data (SEO input) so it is never read
 * as an AI-visibility (GEO) result. Same teal chip everywhere it appears.
 */
export function SeoChip({ title, label = "SEO" }: { title?: string; label?: string }) {
  return (
    <span className="tag-seo" title={title}>
      🔍 {label}
    </span>
  );
}
