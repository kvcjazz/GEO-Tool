"use client";

import { useAppState } from "@/state/AppState";
import { StrategyBanner, Kpi, MetricRow, DateFilter } from "@/components/ui";
import { Bar, Line, BAR_OPTS, LINE_OPTS, barOpts } from "@/components/charts";
import {
  brandMentionsTotal,
  computeAll,
  confLabel,
  metricWeights,
  prAttribution,
} from "@/lib/scoring";
import { r1, sum } from "@/lib/format";
import { reachSplit } from "@/lib/questions";
import { gapSources } from "@/lib/sources";
import type { Run } from "@/lib/types";
import type { DateRange } from "@/lib/types";

function monthsAgo(n: number, currentRun: Run | null): Date {
  const d = new Date(currentRun ? currentRun.run_date : Date.now());
  d.setMonth(d.getMonth() - n);
  return d;
}

function filterRuns(runs: Run[], dr: DateRange, currentRun: Run | null): Run[] {
  const m = dr.mode;
  if (m === "all") return runs;
  if (m === "custom") {
    const f = dr.from ? new Date(dr.from) : null;
    const t = dr.to ? new Date(dr.to) : null;
    return runs.filter((r) => {
      const d = new Date(r.run_date);
      return (!f || d >= f) && (!t || d <= t);
    });
  }
  const n = m === "1" ? 1 : m === "3" ? 3 : 12;
  const cut = monthsAgo(n, currentRun);
  return runs.filter((r) => new Date(r.run_date) >= cut);
}

export default function DashboardView() {
  const { brand, data, dateRange, mode, setView, setAnswersFilter } = useAppState();
  if (!brand) return null;
  const { currentRun, responses, runs, pr, sov, history } = data;

  if (currentRun?.method === "v2" && !responses.length) {
    return (
      <>
        <StrategyBanner />
        <div className="card">
          <h3>Measuring the {currentRun.label.replace(" (Current)", "")} check…</h3>
          <div className="sec-sub">
            The AI engines are being asked this client&#39;s questions now. Results appear
            here as they come in — follow progress in <b>AI answers</b>.
          </div>
        </div>
      </>
    );
  }

  if (!currentRun || !responses.length) {
    const hasStrat = !!(brand.objective || brand.positioning);
    const hasPrompts = data.prompts.length > 0;
    return (
      <>
        <StrategyBanner />
        <div className="card">
          <h3>Get this client live</h3>
          <div className="sec-sub">
            No AI answers measured yet. Three steps to fill this page:
          </div>
          <ol className="steps">
            <li>
              {hasStrat ? "✅" : "⬜"} Set the strategy &amp; positioning{" "}
              <span className="muted">(Client setup)</span>
            </li>
            <li>
              {hasPrompts ? "✅" : "⬜"} Confirm the questions we track —{" "}
              {data.prompts.length} so far; refine them or use ✨ Suggest questions{" "}
              <span className="muted">(Client setup)</span>
            </li>
            <li>
              ⬜ Click <b>Run monthly check</b> above — every live AI engine is asked every
              question, and this page fills in over 10–20 minutes.
            </li>
          </ol>
        </div>
      </>
    );
  }

  const { perEngine, blended } = computeAll(brand, responses);
  // Scores are only comparable between runs measured the same way, so the
  // trend and baseline use runs of the current run's method. Each earlier run
  // is scored from its own responses with today's weights; runs without
  // responses (e.g. imported history) fall back to their stored score.
  const sameMethod = (r: Run) => (r.method ?? null) === (currentRun.method ?? null);
  const runScore = (r: Run): number | null =>
    r.is_current
      ? r1(blended.geo)
      : history[r.id]?.length
        ? r1(computeAll(brand, history[r.id]).blended.geo)
        : r.score;
  const comparable = [...runs]
    .filter(sameMethod)
    .sort((a, b) => new Date(a.run_date).getTime() - new Date(b.run_date).getTime());
  const baselineRun = comparable.find((r) => !r.is_current && runScore(r) != null);
  const baseline = baselineRun ? runScore(baselineRun) : null;
  const delta = baseline != null ? r1(blended.geo - baseline) : null;
  const methodChanged = runs.some((r) => !sameMethod(r));
  const firstOfMethod = comparable[0]?.run_date;
  const bm = brandMentionsTotal(responses);
  const sovRows = [
    { player: brand.name, mentions: bm, me: true },
    ...sov.map((s) => ({ player: s.player, mentions: s.mentions, me: false })),
  ].sort((a, b) => b.mentions - a.mentions);
  const sovTotal = sum(sovRows.map((s) => s.mentions));
  const prCited = pr.filter((p) => p.cited).length;
  const att = prAttribution(responses);
  const conf = confLabel(responses);
  const mw = metricWeights(brand);

  const rs = filterRuns(comparable, dateRange, currentRun);
  const prYM = pr.map((p) => (p.activity_date || "").slice(0, 7));
  const trendData = rs.map(runScore);
  const prMarks = rs.map((r) =>
    prYM.includes((r.run_date || "").slice(0, 7)) ? runScore(r) : null,
  );

  const client = mode === "client";
  const reach = reachSplit(brand, data.prompts, responses);
  const gaps = gapSources(brand, responses).slice(0, 3);
  const topActions = data.opps
    .filter((o) => o.status !== "Done")
    .map((o) => ({ ...o, prio: o.effort ? o.impact / o.effort : 0 }))
    .sort((a, b) => b.prio - a.prio)
    .slice(0, 3);
  const seeAnswers = (f: "unbranded" | "branded") => {
    setAnswersFilter(f);
    setView("answers", "answers");
  };

  return (
    <>
      <div className="reach-row">
        <div className="card reach">
          <h3 style={{ marginBottom: 0 }}>Found by new buyers</h3>
          {reach.newBuyers.answers ? (
            <>
              <div className={`num ${reach.newBuyers.pct < 20 ? "low" : ""}`}>
                {reach.newBuyers.pct}%
              </div>
              <p>
                Named in {reach.newBuyers.named} of {reach.newBuyers.answers} answers to the{" "}
                {reach.newBuyers.questions} questions that don&#39;t mention {brand.name}.
              </p>
              {!client && (
                <button type="button" className="linkbtn" onClick={() => seeAnswers("unbranded")}>
                  See these answers →
                </button>
              )}
            </>
          ) : (
            <p style={{ marginTop: 8 }}>
              Every tracked question names {brand.name}. Add category questions (“best … in
              …”) in Client setup to measure how new buyers find you.
            </p>
          )}
        </div>
        <div className="card reach">
          <h3 style={{ marginBottom: 0 }}>Recognised by name</h3>
          {reach.byName.answers ? (
            <>
              <div className={`num ${reach.byName.pct >= 80 ? "high" : ""}`}>
                {reach.byName.pct}%
              </div>
              <p>
                Named in {reach.byName.named} of {reach.byName.answers} answers to the{" "}
                {reach.byName.questions} questions that ask about {brand.name} directly.
              </p>
              {!client && (
                <button type="button" className="linkbtn" onClick={() => seeAnswers("branded")}>
                  See these answers →
                </button>
              )}
            </>
          ) : (
            <p style={{ marginTop: 8 }}>No tracked question asks about {brand.name} by name.</p>
          )}
        </div>
        <div className="card score-card">
          <h3>Luminous GEO Score</h3>
          <div className="score-big">
            {r1(blended.geo)}
            <small>/100</small>
          </div>
          {delta != null && (
            <div className="delta-up" style={delta < 0 ? { color: "#f0a3a3" } : undefined}>
              {delta < 0 ? `▼ ${delta}` : `▲ +${delta}`} pts since baseline ({baseline})
            </div>
          )}
          {conf && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#c4d2ee" }}>
              Confidence: <b style={{ color: conf.color }}>{conf.label}</b>{" "}
              <span
                title="Based on how consistently the AI engines gave the same answer across repeated samples"
              >
                · {conf.covered}/{conf.total} sampled
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="two">
        <div className="card">
          <h3>{client ? "What we're working on" : "Top actions"}</h3>
          {!client && gaps.length > 0 && (
            <div className="action-item">
              <span className="k" style={{ color: "#6e4a0c" }}>From this check</span>
              <b>Get onto the sites AI cites when it doesn&#39;t name {brand.name}</b>
              <span className="d">
                {gaps.map((g) => g.domain).join(", ")} — cited{" "}
                {gaps.map((g) => g.count).join(", ")} times in those answers.
              </span>
              <button type="button" className="linkbtn" onClick={() => setView("answers", "sources")}>
                See all sources →
              </button>
            </div>
          )}
          {topActions.map((o) => (
            <div className="action-item" key={o.id}>
              <span className="k">{o.status || "Not started"}</span>
              <b>{o.title}</b>
              {o.linked_gap && <span className="d">Moves {o.linked_gap}</span>}
            </div>
          ))}
          {!topActions.length && !gaps.length && (
            <p className="muted" style={{ fontSize: 13 }}>
              No open actions yet.
            </p>
          )}
          <button type="button" className="linkbtn" onClick={() => setView("plan", "actions")}>
            {client ? "See the full plan →" : "Open the action plan →"}
          </button>
        </div>
        <div className="card">
          <h3>GEO Score by engine</h3>
          <div className="chartbox">
            <Bar
              data={{
                labels: perEngine.map((p) => p.engine),
                datasets: [
                  {
                    data: perEngine.map((p) => r1(p.geo)),
                    backgroundColor: "#2E6CF0",
                    borderRadius: 6,
                  },
                ],
              }}
              options={BAR_OPTS}
            />
          </div>
        </div>
      </div>

      <div className="kpi-row">
        <Kpi l="Mention Rate" v={blended.mention} />
        <Kpi l="Share of Voice" v={blended.sov} />
        <Kpi l="Citation Share" v={blended.citation} />
        <Kpi l="Position / Prominence" v={blended.position} />
      </div>

      <div className="two">
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            <h3 style={{ margin: 0 }}>GEO Score over time</h3>
            <DateFilter />
          </div>
          <div className="chartbox">
            <Line
              data={{
                labels: rs.map((r) => r.label),
                datasets: [
                  {
                    data: trendData as number[],
                    borderColor: "#1E8E57",
                    backgroundColor: "rgba(30,142,87,.12)",
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: "#1E8E57",
                  },
                  {
                    data: prMarks as number[],
                    showLine: false,
                    pointRadius: 7,
                    pointHoverRadius: 9,
                    pointStyle: "rectRot",
                    backgroundColor: "#C9871B",
                    borderColor: "#C9871B",
                  },
                ],
              }}
              options={LINE_OPTS}
            />
          </div>
          <div className="legend-note">
            <span style={{ color: "#C9871B" }}>◆</span> marks months with logged PR
            activity — watch the score move after coverage lands.
            {methodChanged && currentRun.method === "v2" && (
              <>
                {" "}
                <b>New measurement method from {firstOfMethod}:</b> engines are asked
                the plain question with live web search, so earlier runs aren&#39;t
                comparable and this trend starts again from there.
              </>
            )}
          </div>
        </div>
        <div className="card">
          <h3>Share of voice vs competitors</h3>
          <div className="chartbox">
            <Bar
              data={{
                labels: sovRows.map((s) => s.player),
                datasets: [
                  {
                    data: sovRows.map((s) => s.mentions),
                    backgroundColor: sovRows.map((s) =>
                      s.me ? "#1A2B4A" : "#9db6e8",
                    ),
                    borderRadius: 6,
                  },
                ],
              }}
              options={barOpts({
                indexAxis: "y",
                scales: {
                  x: { beginAtZero: true, grid: { color: "#eef1f7" } },
                  y: { grid: { display: false } },
                },
              })}
            />
          </div>
          <div className="legend-note">
            {brand.name}: <b>{r1(sovTotal ? (bm / sovTotal) * 100 : 0)}%</b> of category
            mentions this check.
          </div>
        </div>
      </div>

      <div className="two">
        <div className="card">
          <h3>How the score is made up</h3>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Score</th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              <MetricRow l="Mention Rate" v={blended.mention} w={mw.mention} />
              <MetricRow l="Share of Voice" v={blended.sov} w={mw.sov} />
              <MetricRow l="Citation Share" v={blended.citation} w={mw.citation} />
              <MetricRow l="Position / Prominence" v={blended.position} w={mw.position} />
              <MetricRow l="Sentiment" v={blended.sentiment} w={mw.sentiment} />
              <MetricRow l="Accuracy" v={blended.accuracy} w={mw.accuracy} />
            </tbody>
          </table>
          <div className="legend-note">
            PR influence: <b>{prCited}</b> of {pr.length} placements cited by AI.{" "}
            <b>
              {att.attr} of {att.cited}
            </b>{" "}
            cited AI answers (<b>{att.pct}%</b>) are credited to earned PR — see{" "}
            <b>Coverage &amp; impact</b>.
          </div>
        </div>
        <div>
          <StrategyBanner />
        </div>
      </div>
    </>
  );
}
