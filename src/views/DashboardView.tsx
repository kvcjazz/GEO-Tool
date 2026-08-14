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
  const { brand, data, dateRange } = useAppState();
  if (!brand) return null;
  const { currentRun, responses, runs, pr, sov } = data;

  if (!currentRun || !responses.length) {
    const hasStrat = !!(brand.objective || brand.positioning);
    const hasPrompts = data.prompts.length > 0;
    return (
      <>
        <StrategyBanner />
        <div className="card">
          <h3>Get this client live</h3>
          <div className="sec-sub">
            No AI responses captured yet — complete these steps to populate the
            dashboard:
          </div>
          <ol className="steps">
            <li>
              {hasStrat ? "✅" : "⬜"} Set the visibility strategy &amp; positioning{" "}
              <span className="muted">(Settings)</span>
            </li>
            <li>
              {hasPrompts ? "✅" : "⬜"} Confirm the prompt set — {data.prompts.length}{" "}
              prompt(s); refine or use ✨ Suggest from strategy{" "}
              <span className="muted">(Settings)</span>
            </li>
            <li>
              ⬜ Generate the capture grid{" "}
              <span className="muted">(Settings → Data tools)</span>
            </li>
            <li>
              ⬜ Enter the AI answers in <b>Response Capture</b> (or seed illustrative
              data)
            </li>
          </ol>
          <div className="legend-note">
            Note: fully automatic population — the system querying the AI engines for
            you — is the live-API step on the roadmap. For now responses are captured
            manually or seeded.
          </div>
        </div>
      </>
    );
  }

  const { perEngine, blended } = computeAll(brand, responses);
  const hist = runs.filter((r) => !r.is_current);
  const baseline = hist.length ? hist[0].score : null;
  const delta = baseline != null ? r1(blended.geo - baseline) : null;
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

  const rs = filterRuns(
    [...runs].sort(
      (a, b) => new Date(a.run_date).getTime() - new Date(b.run_date).getTime(),
    ),
    dateRange,
    currentRun,
  );
  const prYM = pr.map((p) => (p.activity_date || "").slice(0, 7));
  const trendData = rs.map((r) => (r.is_current ? r1(blended.geo) : r.score));
  const prMarks = rs.map((r) =>
    prYM.includes((r.run_date || "").slice(0, 7))
      ? r.is_current
        ? r1(blended.geo)
        : r.score
      : null,
  );

  return (
    <>
      <StrategyBanner />
      <div className="kpi-row">
        <div className="card score-card">
          <h3>Luminous GEO Score</h3>
          <div className="score-big">
            {r1(blended.geo)}
            <small>/100</small>
          </div>
          {delta != null && (
            <div className="delta-up">
              ▲ +{delta} pts since baseline ({baseline})
            </div>
          )}
          {conf && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#9fb3da" }}>
              Confidence:{" "}
              <b style={{ color: conf.color }}>{conf.label}</b>{" "}
              <span
                className="muted"
                style={{ color: "#8b9bc0" }}
                title="Based on how consistently the AI engines gave the same answer across repeated samples"
              >
                · {conf.covered}/{conf.total} sampled
              </span>
            </div>
          )}
        </div>
        <Kpi l="Mention Rate" v={blended.mention} />
        <Kpi l="Share of Voice" v={blended.sov} />
        <Kpi l="Citation Share" v={blended.citation} />
      </div>

      <div className="two">
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
          </div>
        </div>
      </div>

      <div className="two">
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
            mentions this run.
          </div>
        </div>
        <div className="card">
          <h3>Metric breakdown (blended)</h3>
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
            cited AI answers (<b>{att.pct}%</b>) are attributed to earned PR — see{" "}
            <b>PR &amp; Influence</b>.
          </div>
        </div>
      </div>
    </>
  );
}
