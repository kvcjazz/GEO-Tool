"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/state/AppState";
import { StrategyBanner } from "@/components/ui";
import { newsDate, stars } from "@/lib/format";
import { ctxString } from "@/lib/context";
import { callFn } from "@/lib/callFn";
import { NewsResponseSchema, RadarResponseSchema } from "@/lib/schemas";
import type { MemoryOutlet, NewsItem, RadarItem } from "@/lib/types";

function feasTag(f?: string | null) {
  const s = (f || "").toLowerCase();
  const c = s.indexOf("high") >= 0 ? "t-yes" : s.indexOf("low") >= 0 ? "t-no" : "t-na";
  return <span className={`tag ${c}`}>{f || "—"}</span>;
}

function memoryText(memory: MemoryOutlet[] | null): string {
  const a = memory || [];
  if (!a.length) return "";
  const proven = a
    .filter((o) => o.score > 0)
    .slice(0, 10)
    .map(
      (o) =>
        o.outlet +
        (o.landed
          ? " (landed" + (o.cited ? "+cited by AI" : "") + ")"
          : o.up
            ? " (rated realistic)"
            : ""),
    )
    .join("; ");
  const avoid = a
    .filter((o) => o.score < 0)
    .slice(0, 8)
    .map((o) => o.outlet + " (rated unrealistic/dismissed)")
    .join("; ");
  let t = "";
  if (proven) t += "PROVEN / likely to work: " + proven + ". ";
  if (avoid) t += "AVOID / has not worked: " + avoid + ".";
  return t;
}

export default function PlanningView() {
  const {
    brand,
    data,
    mode,
    sb,
    toast,
    reload,
    memory,
    buildFeasibilityMemory,
  } = useAppState();
  const [radar, setRadar] = useState<RadarItem[]>(data.radar);
  const [busyNews, setBusyNews] = useState(false);
  const [busyRadar, setBusyRadar] = useState(false);

  useEffect(() => setRadar(data.radar), [data.radar]);
  useEffect(() => {
    if (memory === null) buildFeasibilityMemory();
  }, [memory, buildFeasibilityMemory]);

  if (!brand) return null;

  async function storeNews(
    brandId: string,
    news: { title?: string | null; url?: string | null; domain?: string | null; seendate?: string | null }[] | null | undefined,
    kind: "theme" | "competitor",
  ) {
    if (!news) return;
    try {
      await sb.from("geo_news").delete().eq("brand_id", brandId).eq("kind", kind);
      if (!news.length) return;
      const rows = news.slice(0, 20).map((n) => ({
        brand_id: brandId,
        title: n.title,
        url: n.url,
        domain: n.domain,
        seendate: n.seendate,
        kind,
      }));
      await sb.from("geo_news").insert(rows);
    } catch {
      /* ignore */
    }
  }

  async function refreshNews() {
    setBusyNews(true);
    try {
      const j = await callFn(
        "geo-news",
        {
          brand: brand!.name,
          themes: brand!.themes,
          sector: brand!.sector,
          pr_region: brand!.pr_region,
          competitors: data.competitors.map((c) => c.name),
        },
        NewsResponseSchema,
      );
      await storeNews(brand!.id, j.articles, "theme");
      await storeNews(brand!.id, j.competitorNews, "competitor");
      toast(
        j.articles && j.articles.length
          ? j.articles.length +
              " stories pulled" +
              (j.competitorNews && j.competitorNews.length
                ? " · " + j.competitorNews.length + " competitor"
                : "")
          : "No fresh stories found for these themes",
      );
      await reload();
    } catch (e) {
      toast("News error: " + String(e));
    }
    setBusyNews(false);
  }

  async function runRadar() {
    if (mode !== "team") return;
    if (
      !window.confirm(
        "Generate a Radar briefing for " +
          brand!.name +
          "? This pulls fresh news and calls the AI (uses your Anthropic credit).",
      )
    )
      return;
    setBusyRadar(true);
    try {
      const mem = await buildFeasibilityMemory();
      const existingTitles = radar
        .filter((r) => r.status !== "dismissed")
        .map((r) => r.title)
        .filter(Boolean);
      const payload = {
        brand: brand!.name,
        sector: brand!.sector,
        pr_region: brand!.pr_region,
        pr_journey: brand!.pr_journey,
        pr_objectives: brand!.pr_objectives,
        pr_expectations: brand!.pr_expectations,
        objective: brand!.objective,
        positioning: brand!.positioning,
        themes: brand!.themes,
        audience: brand!.audience,
        persona: brand!.pr_persona,
        pr_research_budget: brand!.pr_research_budget,
        pr_newsworthy: brand!.pr_newsworthy,
        website: brand!.website,
        context: ctxString(data.context),
        mediaTargets: data.media.map((m) => ({
          outlet: m.outlet,
          tier: m.tier,
          vip: m.vip,
        })),
        competitors: data.competitors.map((c) => c.name),
        opportunities: data.opps.map((o) => ({
          title: o.title,
          linked_gap: o.linked_gap,
        })),
        existingTitles,
        feasibilityMemory: memoryText(mem),
      };
      const j = await callFn("geo-radar", payload, RadarResponseSchema);
      await storeNews(brand!.id, j.news, "theme");
      await storeNews(brand!.id, j.competitorNews, "competitor");
      const items = j.items || [];
      const norm = (s?: string | null) =>
        (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const have = new Set(
        radar.filter((r) => r.status !== "dismissed").map((r) => norm(r.title)),
      );
      const fresh = items.filter((it) => {
        const n = norm(it.title);
        if (!n || have.has(n)) return false;
        have.add(n);
        return true;
      });
      if (!fresh.length) {
        toast(
          items.length
            ? "All suggestions duplicated earlier ideas — try again"
            : "No recommendations returned",
        );
      } else {
        const batch =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now());
        const rows = fresh.map((it) => ({
          brand_id: brand!.id,
          batch_id: batch,
          stream: it.stream === "geo_insight" ? "geo_insight" : "pr_activity",
          title: it.title,
          idea: it.idea,
          target_outlets: it.target_outlets,
          hook: it.hook,
          rationale: it.rationale,
          impact: +(it.impact || 3) || 3,
          geo_metric: it.geo_metric,
          feasibility: it.feasibility,
          score: +(it.impact || 3) || 3,
          status: "new",
        }));
        const { error } = await sb.from("geo_radar_items").insert(rows);
        const dups = items.length - fresh.length;
        toast(
          error
            ? "Save failed: " + error.message
            : rows.length +
                " new ideas added" +
                (dups > 0 ? " · " + dups + " duplicates skipped" : "") +
                (j.source === "template" ? " · template" : ""),
        );
      }
      await reload();
    } catch (e) {
      toast("Radar error: " + String(e));
    }
    setBusyRadar(false);
  }

  async function patchStatus(id: string, patch: Partial<RadarItem>, msg: string) {
    const { error } = await sb.from("geo_radar_items").update(patch).eq("id", id);
    setRadar((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    toast(error ? "Failed" : msg);
  }

  const rateRadar = (id: string, val: string) =>
    patchStatus(id, { team_rating: val }, "Rated: " + val);
  const approveRadar = (id: string) =>
    patchStatus(id, { status: "in_plan" }, "Added to plan");
  const saveRadar = (id: string) =>
    patchStatus(id, { status: "saved" }, "Saved to your library");
  const unsaveRadar = (id: string) =>
    patchStatus(id, { status: "new" }, "Moved back to active");
  const restoreRadar = (id: string) =>
    patchStatus(id, { status: "new", dismiss_reason: null }, "Restored");

  async function dismissRadar(id: string) {
    const reason = window.prompt(
      "Why dismiss this? (optional — helps the system learn what won't work)",
    );
    await patchStatus(id, { status: "dismissed", dismiss_reason: reason }, "Dismissed");
  }

  async function radarToBacklog(id: string) {
    const r = radar.find((x) => x.id === id);
    if (!r) return;
    const n = data.opps.length + 1;
    const rec = {
      brand_id: brand!.id,
      title: r.title || "",
      linked_gap: r.geo_metric || "From PR Radar",
      impact: Math.min(5, Math.max(1, r.impact || 3)),
      effort: 2,
      status: "Not started",
      sort: n,
    };
    const { error } = await sb.from("geo_opportunities").insert(rec);
    if (error) return toast("Failed: " + error.message);
    await sb.from("geo_radar_items").update({ status: "in_plan" }).eq("id", id);
    toast("Added to GEO backlog");
    await reload();
  }

  function radarCard(it: RadarItem) {
    const dismissed = it.status === "dismissed";
    const saved = it.status === "saved";
    const approved = it.status === "in_plan";
    return (
      <div
        key={it.id}
        className="card"
        style={{
          marginBottom: 10,
          opacity: dismissed ? 0.65 : 1,
          borderLeft: `4px solid ${it.stream === "geo_insight" ? "var(--green)" : "var(--blue)"}`,
        }}
      >
        <b style={{ fontSize: 15, color: "var(--navy)" }}>{it.title || ""}</b>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          Impact <span style={{ color: "#C9871B" }}>{stars(it.impact)}</span> ·
          Feasibility {feasTag(it.feasibility)}
          {it.geo_metric && (
            <>
              {" "}
              · Moves <b>{it.geo_metric}</b>
            </>
          )}
          {approved && (
            <>
              {" "}
              · <span className="tag t-yes">In plan</span>
            </>
          )}
          {saved && (
            <>
              {" "}
              · <span className="badge">⭐ Saved</span>
            </>
          )}
          {it.team_rating && (
            <>
              {" "}
              · You rated: <b>{it.team_rating}</b>
            </>
          )}
        </div>
        <div style={{ margin: "8px 0", fontSize: 13, lineHeight: 1.5 }}>{it.idea || ""}</div>
        {it.target_outlets && (
          <div style={{ fontSize: 12 }}>
            <b>Target:</b> {it.target_outlets}
          </div>
        )}
        {it.hook && (
          <div style={{ fontSize: 12 }}>
            <b>Hook:</b> {it.hook}
          </div>
        )}
        {it.rationale && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {it.rationale}
          </div>
        )}
        {mode === "team" && !dismissed && (
          <div className="flex" style={{ marginTop: 10 }}>
            <button
              className="btn sm ghost"
              onClick={() => rateRadar(it.id, "Realistic")}
            >
              👍 Realistic
            </button>
            <button
              className="btn sm ghost"
              onClick={() => rateRadar(it.id, "Unrealistic")}
            >
              👎 Unrealistic
            </button>
            {!approved && (
              <button className="btn sm" onClick={() => approveRadar(it.id)}>
                ✓ Add to plan
              </button>
            )}
            {saved ? (
              <button className="btn sm ghost" onClick={() => unsaveRadar(it.id)}>
                Move to active
              </button>
            ) : (
              <button className="btn sm ghost" onClick={() => saveRadar(it.id)}>
                ⭐ Save for later
              </button>
            )}
            {it.stream === "geo_insight" && (
              <button className="btn sm ghost" onClick={() => radarToBacklog(it.id)}>
                ★ Send to GEO backlog
              </button>
            )}
            <button className="btn sm danger" onClick={() => dismissRadar(it.id)}>
              Dismiss
            </button>
          </div>
        )}
        {dismissed && (
          <div className="legend-note">
            Dismissed{it.dismiss_reason ? ": " + it.dismiss_reason : ""}.{" "}
            <a style={{ cursor: "pointer" }} onClick={() => restoreRadar(it.id)}>
              Restore
            </a>
          </div>
        )}
      </div>
    );
  }

  const active = radar.filter((r) => r.status === "new" || r.status === "in_plan");
  const saved = radar.filter((r) => r.status === "saved");
  const dismissed = radar.filter((r) => r.status === "dismissed");
  const prItems = active
    .filter((r) => r.stream !== "geo_insight")
    .sort((a, b) => (b.impact || 0) - (a.impact || 0));
  const geoItems = active
    .filter((r) => r.stream === "geo_insight")
    .sort((a, b) => (b.impact || 0) - (a.impact || 0));
  const haveProfile = !!(
    brand.pr_objectives ||
    brand.pr_region ||
    brand.pr_newsworthy
  );
  const news = data.news || [];
  const compNews = data.compNews || [];
  const mem = memory || [];

  const NewsRow = ({ n }: { n: NewsItem }) => (
    <div
      style={{ fontSize: 12, padding: "5px 0", borderBottom: "1px solid var(--line)" }}
    >
      {n.url ? (
        <a href={n.url} target="_blank" rel="noreferrer">
          {n.title}
        </a>
      ) : (
        n.title
      )}{" "}
      <span className="muted">
        · {n.domain || ""}
        {newsDate(n.seendate) ? " · " + newsDate(n.seendate) : ""}
      </span>
    </div>
  );

  return (
    <>
      <StrategyBanner />
      <div className="sec-title">PR Planning — {brand.name}</div>
      <div className="sec-sub">
        The Opportunity Radar scans breaking news plus this client&#39;s profile and GEO
        data, then pushes ranked, feasible recommendations — split into PR activity and
        GEO-supporting insight. Rate them to teach the system; save the good ones for
        later.
      </div>

      {/* Breaking news */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <h3 style={{ margin: 0 }}>
            📰 Breaking news radar{" "}
            <span className="muted" style={{ textTransform: "none", fontWeight: 500 }}>
              — last 14 days, matched to this client
            </span>
          </h3>
          {mode === "team" && (
            <button className="btn sm ghost" onClick={refreshNews} disabled={busyNews}>
              {busyNews ? "↻ Fetching…" : "↻ Refresh news"}
            </button>
          )}
        </div>
        {news.length ? (
          <>
            <div style={{ marginTop: 8, maxHeight: 210, overflow: "auto" }}>
              {news.slice(0, 12).map((n) => (
                <NewsRow key={n.id} n={n} />
              ))}
            </div>
            <div className="legend-note">
              These headlines feed the Radar&#39;s newsjacking suggestions when you
              generate a briefing.
            </div>
          </>
        ) : (
          <div className="sec-sub" style={{ marginTop: 8 }}>
            No news pulled yet.{" "}
            {mode === "team"
              ? "Click Refresh news, or just generate a briefing — it pulls fresh news automatically."
              : ""}
          </div>
        )}
      </div>

      {/* Competitor news */}
      {compNews.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>
            🥊 Competitor news{" "}
            <span className="muted" style={{ textTransform: "none", fontWeight: 500 }}>
              — last 14 days
            </span>
          </h3>
          <div style={{ maxHeight: 170, overflow: "auto", marginTop: 6 }}>
            {compNews.slice(0, 8).map((n) => (
              <NewsRow key={n.id} n={n} />
            ))}
          </div>
          <div className="legend-note">
            Feeds differentiation and defensive angles into the briefing.
          </div>
        </div>
      )}

      {/* Feasibility memory */}
      {mem.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>
            🧠 Outlet feasibility memory{" "}
            <span className="muted" style={{ textTransform: "none", fontWeight: 500 }}>
              — what the system has learned
            </span>
          </h3>
          <div className="legend-note">
            Built from your 👍/👎 ratings and logged PR outcomes across all clients. The
            Radar prefers proven outlets and avoids ones rated unrealistic.
          </div>
          <div className="two" style={{ marginTop: 8 }}>
            <div>
              <b style={{ color: "var(--green)", fontSize: 13 }}>Proven / likely</b>
              {mem.filter((o) => o.score > 0).length ? (
                mem
                  .filter((o) => o.score > 0)
                  .slice(0, 8)
                  .map((o) => (
                    <div key={o.outlet} style={{ fontSize: 12, padding: "3px 0" }}>
                      {o.outlet}{" "}
                      <span className="muted">
                        {o.landed ? "· landed " + o.landed : ""}
                        {o.cited ? " · cited " + o.cited : ""}
                        {o.up ? " · 👍" + o.up : ""}
                      </span>
                    </div>
                  ))
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>
                  Nothing yet — rate ideas and log PR to teach it.
                </div>
              )}
            </div>
            <div>
              <b style={{ color: "var(--red)", fontSize: 13 }}>Avoid / unproven</b>
              {mem.filter((o) => o.score < 0).length ? (
                mem
                  .filter((o) => o.score < 0)
                  .slice(0, 8)
                  .map((o) => (
                    <div key={o.outlet} style={{ fontSize: 12, padding: "3px 0" }}>
                      {o.outlet} <span className="muted">· 👎{o.down}</span>
                    </div>
                  ))
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>
                  Nothing flagged yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {mode === "team" && (
        <div style={{ marginBottom: 14 }}>
          <button className="btn" onClick={runRadar} disabled={busyRadar}>
            {busyRadar ? "📡 Thinking…" : "📡 Generate Radar briefing"}
          </button>{" "}
          <span className="muted" style={{ fontSize: 12 }}>
            {haveProfile
              ? "Pulls fresh news, avoids repeating earlier ideas. Uses your Anthropic credit."
              : "Tip: complete the Client PR Profile in Settings for sharper, more feasible results."}
          </span>
        </div>
      )}

      {active.length ? (
        <div className="two" style={{ alignItems: "start" }}>
          <div>
            <h3 style={{ color: "var(--blue)", fontSize: 14, marginBottom: 8 }}>
              📣 PR activity ({prItems.length})
            </h3>
            {prItems.length ? (
              prItems.map(radarCard)
            ) : (
              <div className="card muted">No PR-activity ideas yet.</div>
            )}
          </div>
          <div>
            <h3 style={{ color: "var(--green)", fontSize: 14, marginBottom: 8 }}>
              🔍 GEO-supporting insight ({geoItems.length})
            </h3>
            {geoItems.length ? (
              geoItems.map(radarCard)
            ) : (
              <div className="card muted">No GEO-insight items yet.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <h3>No active ideas yet</h3>
          <div className="sec-sub">
            {mode === "team"
              ? "Click Generate Radar briefing for your first set of recommendations."
              : "No PR recommendations have been generated yet."}
          </div>
        </div>
      )}

      {saved.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ color: "var(--navy)", fontSize: 14, marginBottom: 8 }}>
            ⭐ Saved ideas ({saved.length}) — your library for later
          </h3>
          {saved.map(radarCard)}
        </div>
      )}

      {dismissed.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Dismissed ({dismissed.length})</h3>
          {dismissed.map(radarCard)}
        </div>
      )}
    </>
  );
}
