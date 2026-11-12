"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/state/AppState";
import { newsDate, stars } from "@/lib/format";
import { ctxString } from "@/lib/context";
import { callFn } from "@/lib/callFn";
import { buildAdviseBrief } from "@/lib/adviseBrief";
import { NewsResponseSchema, RadarResponseSchema } from "@/lib/schemas";
import { memoryText } from "@/lib/memory";
import { latestTargets } from "@/lib/targets";
import type { NewsItem, RadarItem } from "@/lib/types";

function feasTag(f?: string | null) {
  const s = (f || "").toLowerCase();
  const c = s.indexOf("high") >= 0 ? "t-yes" : s.indexOf("low") >= 0 ? "t-no" : "t-na";
  return <span className={`tag ${c}`}>{f || "—"}</span>;
}

const UNREALISTIC = "Not realistic for these outlets";
const DISMISS_REASONS = [UNREALISTIC, "Off-strategy for the client", "Already done or planned", "Wrong timing"];

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
    setView,
  } = useAppState();
  const [radar, setRadar] = useState<RadarItem[]>(data.radar);
  const [busyNews, setBusyNews] = useState(false);
  const [busyRadar, setBusyRadar] = useState(false);
  // The idea whose dismiss reasons are showing, and a typed "other" reason.
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [otherReason, setOtherReason] = useState("");

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
          market_country: brand!.market_country,
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
          : j.error
            ? "News source unavailable: " + j.error
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
        "Get new PR and content ideas for " +
          brand!.name +
          "? This pulls fresh news and asks the AI for ideas based on the latest check. Uses AI credit.",
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
        brief: buildAdviseBrief(brand!, data),
        market_country: brand!.market_country,
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
        mediaTargets: [
          ...data.media.map((m) => ({
            outlet: m.outlet,
            tier: m.tier,
            vip: m.vip,
          })),
          // Titles the engines cite that the senior-PR review judged realistic.
          ...latestTargets(data.targets)
            .rows.filter(
              (t) =>
                t.verdict === "realistic" &&
                t.team_decision !== "no_go" &&
                !data.media.some(
                  (m) => (m.outlet || "").trim().toLowerCase() === t.name.trim().toLowerCase(),
                ),
            )
            .slice(0, 10)
            .map((t) => ({
              outlet: t.name,
              tier: "cited by AI engines, judged realistic" + (t.route ? ": " + t.route : ""),
              vip: false,
            })),
        ],
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
                (j.source === "template"
                  ? " · generic template (AI unavailable: " + (j.note || "unknown error") + ")"
                  : ""),
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

  const saveRadar = (id: string) =>
    patchStatus(id, { status: "saved" }, "Saved to your library");
  const unsaveRadar = (id: string) =>
    patchStatus(id, { status: "new" }, "Moved back to active");
  const restoreRadar = (id: string) =>
    patchStatus(id, { status: "new", dismiss_reason: null }, "Restored");

  // A dismissed idea counts against its outlets in "What's worked with
  // outlets"; the reason says why, so the Radar can avoid it next time.
  async function dismissRadar(id: string, reason: string | null) {
    setDismissing(null);
    setOtherReason("");
    await patchStatus(
      id,
      {
        status: "dismissed",
        dismiss_reason: reason,
        ...(reason === UNREALISTIC ? { team_rating: "Unrealistic" } : {}),
      },
      "Dismissed",
    );
  }

  // Accepting an idea puts it in the one action plan (whatever its stream), so
  // ideas and actions never live in two separate lists.
  async function addToPlan(id: string) {
    const r = radar.find((x) => x.id === id);
    if (!r) return;
    const n = data.opps.length + 1;
    const rec = {
      brand_id: brand!.id,
      title: r.title || "",
      linked_gap: r.geo_metric || (r.stream === "geo_insight" ? "From ideas inbox" : "PR activity · from ideas inbox"),
      impact: Math.min(5, Math.max(1, r.impact || 3)),
      effort: 2,
      status: "Not started",
      sort: n,
    };
    const { error } = await sb.from("geo_opportunities").insert(rec);
    if (error) return toast("Failed: " + error.message);
    await sb
      .from("geo_radar_items")
      .update({ status: "in_plan", team_rating: r.team_rating || "Realistic" })
      .eq("id", id);
    toast("Added to the action plan");
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
        {mode === "team" && !dismissed && dismissing !== it.id && (
          <div className="flex" style={{ marginTop: 10, gap: 8 }}>
            {!approved && (
              <button className="btn sm" onClick={() => addToPlan(it.id)}>
                ✓ Add to plan
              </button>
            )}
            {saved ? (
              <button className="btn sm ghost" onClick={() => unsaveRadar(it.id)}>
                Back to inbox
              </button>
            ) : (
              !approved && (
                <button className="btn sm ghost" onClick={() => saveRadar(it.id)}>
                  Save for later
                </button>
              )
            )}
            {!approved && (
              <button className="btn sm ghost" onClick={() => setDismissing(it.id)}>
                Dismiss…
              </button>
            )}
          </div>
        )}
        {mode === "team" && dismissing === it.id && (
          <div className="dismiss-box" role="group" aria-label="Why dismiss this idea?">
            <span className="muted" style={{ fontSize: 12 }}>
              Why? It helps the next ideas avoid the same miss.
            </span>
            <div className="flex" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {DISMISS_REASONS.map((r) => (
                <button key={r} type="button" className="btn sm ghost" onClick={() => dismissRadar(it.id, r)}>
                  {r}
                </button>
              ))}
              <input
                value={otherReason}
                placeholder="Other reason…"
                aria-label="Other reason"
                style={{ width: 180 }}
                onChange={(e) => setOtherReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void dismissRadar(it.id, otherReason.trim() || null);
                }}
              />
              <button type="button" className="btn sm danger" onClick={() => dismissRadar(it.id, otherReason.trim() || null)}>
                Dismiss
              </button>
              <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => setDismissing(null)}>
                Cancel
              </button>
            </div>
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

  const active = radar.filter((r) => r.status === "new");
  const accepted = radar.filter((r) => r.status === "in_plan");
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
              ask for new ideas.
            </div>
          </>
        ) : (
          <div className="sec-sub" style={{ marginTop: 8 }}>
            No news pulled yet.{" "}
            {mode === "team"
              ? "Click Refresh news, or just get new ideas — that pulls fresh news automatically."
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
            Feeds differentiation and defensive angles into new ideas.
          </div>
        </div>
      )}

      {/* Feasibility memory */}
      {mem.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>
            🧠 What&#39;s worked with outlets{" "}
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
            {busyRadar ? "Thinking…" : "Get new ideas"}
          </button>{" "}
          <span className="muted" style={{ fontSize: 12 }}>
            {haveProfile
              ? "Pulls fresh news, avoids repeating earlier ideas. Uses your Anthropic credit."
              : "Tip: fill in the PR profile in Client setup for sharper, more realistic ideas."}
          </span>
        </div>
      )}

      {active.length ? (
        <div className="two" style={{ alignItems: "start" }}>
          <div>
            <h3 style={{ color: "var(--blue)", fontSize: 14, marginBottom: 8 }}>
              📣 PR ideas ({prItems.length})
            </h3>
            {prItems.length ? (
              prItems.map(radarCard)
            ) : (
              <div className="card muted">No PR ideas in the inbox.</div>
            )}
          </div>
          <div>
            <h3 style={{ color: "var(--green)", fontSize: 14, marginBottom: 8 }}>
              🔍 Content &amp; technical ({geoItems.length})
            </h3>
            {geoItems.length ? (
              geoItems.map(radarCard)
            ) : (
              <div className="card muted">No content or technical ideas in the inbox.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <h3>{accepted.length || saved.length ? "Inbox clear" : "No ideas yet"}</h3>
          <div className="sec-sub">
            {mode === "team"
              ? accepted.length || saved.length
                ? "Every idea has been dealt with. Click Get new ideas for more."
                : "Click Get new ideas for your first set of recommendations."
              : "No PR recommendations have been generated yet."}
          </div>
        </div>
      )}

      {accepted.length > 0 && (
        <div className="legend-note" style={{ marginTop: 12 }}>
          {accepted.length} idea{accepted.length === 1 ? " is" : "s are"} already in the action plan.{" "}
          <button type="button" className="linkbtn" style={{ padding: 0 }} onClick={() => setView("plan", "actions")}>
            Open the action plan →
          </button>
        </div>
      )}

      {saved.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ color: "var(--navy)", fontSize: 14, marginBottom: 8 }}>
            ⭐ Saved for later ({saved.length})
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
