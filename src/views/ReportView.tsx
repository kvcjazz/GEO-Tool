"use client";

import { useAppState } from "@/state/AppState";
import { useV2Answers } from "@/state/useV2Answers";
import { ENGINES } from "@/lib/constants";
import { brandMentionsTotal, categoryBrands, computeAll } from "@/lib/scoring";
import { r1, sum } from "@/lib/format";
import { namesBrand, reachSplit } from "@/lib/questions";
import { gapSources, isTarget, KIND_LABELS } from "@/lib/sources";
import { checksOf, placementImpact } from "@/lib/prImpact";
import { compareChecks, previousCheck } from "@/lib/changes";

// The monthly client report: one printable page that answers "how visible are
// we in AI answers, what changed, what is PR doing about it, and is it
// working". Everything here is computed from the same data as the rest of the
// app — nothing is typed in by hand — so it can go to the client as it is.

function monthOf(d: string | null | undefined): string {
  const dt = new Date(d || Date.now());
  return dt.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function dateOf(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 100) : 0;
}

function Delta({ v, unit = "" }: { v: number | null; unit?: string }) {
  if (v == null) return null;
  const c = v > 0 ? "var(--green)" : v < 0 ? "var(--red)" : "var(--muted)";
  return (
    <span style={{ color: c, fontWeight: 700, fontSize: 13 }}>
      {v > 0 ? "▲ +" : v < 0 ? "▼ " : "■ "}
      {v}
      {unit}
    </span>
  );
}

export default function ReportView() {
  const { brand, data, mode, engines } = useAppState();
  const answers = useV2Answers();
  if (!brand) return null;
  const run = data.currentRun;
  if (!run || !data.responses.length) {
    return (
      <div className="card">
        No monthly check yet for {brand.name}. Run the monthly check first; the report is
        built from its results.
      </div>
    );
  }

  const responses = data.responses;
  const { perEngine, blended } = computeAll(brand, responses);
  const reach = reachSplit(brand, data.prompts, responses);

  // Previous check measured the same way, for "what changed" (shared with the
  // Overview so both say the same thing).
  const prevRun = previousCheck(run, data.runs, data.history);
  const prevScore = prevRun ? computeAll(brand, data.history[prevRun.id]).blended : null;
  const scoreDelta = prevScore ? r1(blended.geo - prevScore.geo) : null;
  const cmp = compareChecks(brand, run, prevRun, answers, data.prompts);
  const prevReach = cmp.prevReach;
  const gained = cmp.gained.map((q) => q.text);
  const lost = cmp.lost.map((q) => q.text);

  // Competitors.
  const bm = brandMentionsTotal(responses);
  const sovRows = [
    { player: brand.name, mentions: bm, me: true },
    ...data.sov.map((s) => ({ player: s.player, mentions: s.mentions, me: false })),
  ].sort((a, b) => b.mentions - a.mentions);
  const sovTotal = sum(sovRows.map((s) => s.mentions));
  // Share of voice v2 where answers have brand data: every brand the engines
  // name on questions that don't name the client, recommendations double.
  const named = categoryBrands(responses, brand.name);
  const topNamed = named.slice(0, 8);
  const meNamed = named.find((b) => b.client);
  if (meNamed && !topNamed.includes(meNamed)) topNamed[topNamed.length - 1] = meNamed;
  const shareRows = topNamed.length
    ? topNamed.map((b) => ({ player: b.name, pct: Math.round(b.share), me: b.client }))
    : sovRows.map((s) => ({ player: s.player, pct: pct(s.mentions, sovTotal), me: s.me }));

  // Biggest gaps: unbranded questions the client is missing from.
  const byPrompt = new Map<string, { named: number; n: number }>();
  for (const r of responses) {
    const g = byPrompt.get(r.prompt_id) || { named: 0, n: 0 };
    g.n++;
    if (r.mentioned) g.named++;
    byPrompt.set(r.prompt_id, g);
  }
  const missing = data.prompts
    .filter((p) => !namesBrand(p.text, brand) && byPrompt.get(p.id))
    .map((p) => ({ p, ...byPrompt.get(p.id)! }))
    .filter((x) => x.named / x.n < 0.5)
    .sort((a, b) => a.named / a.n - b.named / b.n)
    .slice(0, 6);
  const wins = data.prompts
    .filter((p) => !namesBrand(p.text, brand) && byPrompt.get(p.id))
    .map((p) => ({ p, ...byPrompt.get(p.id)! }))
    .filter((x) => x.named / x.n >= 0.5)
    .sort((a, b) => b.named / b.n - a.named / a.n)
    .slice(0, 4);
  const gaps = gapSources(brand, responses)
    .filter((g) => isTarget(g.domain, data.sourceKinds))
    .slice(0, 8);

  // PR this period and its impact.
  const checks = answers ? checksOf(answers) : [];
  const since = prevRun?.run_date || "0000";
  const recentPr = [...data.pr]
    .filter((p) => p.activity_date > since || p.cited)
    .sort((a, b) => b.activity_date.localeCompare(a.activity_date))
    .slice(0, 10);
  const impacts = answers
    ? recentPr.map((p) => placementImpact(p, answers, data.prompts, [brand.name, ...(brand.aliases || [])]))
    : [];

  const actions = data.opps
    .filter((o) => o.status !== "Parked")
    .map((o) => ({ ...o, prio: o.effort ? o.impact / o.effort : 0 }))
    .sort((a, b) => {
      const order = (s: string | null) => (s === "In progress" ? 0 : s === "Done" ? 2 : 1);
      return order(a.status) - order(b.status) || b.prio - a.prio;
    })
    .slice(0, 8);

  const promptText = new Map(data.prompts.map((p) => [p.id, p.text]));
  const errors = responses
    .filter((r) => r.mentioned && (r.accuracy === "Major error" || r.accuracy === "Minor error"))
    .sort((a, b) => (a.accuracy === "Major error" ? 0 : 1) - (b.accuracy === "Major error" ? 0 : 1))
    .slice(0, 8);
  const measured = ENGINES.filter((e) => perEngine.some((p) => p.engine === e));
  const notMeasured = ENGINES.filter((e) => !measured.includes(e as never) && !engines[e]);
  const questions = new Set(responses.map((r) => r.prompt_id)).size;

  return (
    <div className="report">
      {mode === "team" && (
        <div className="no-print legend-note" style={{ marginBottom: 12 }}>
          This page is built from the latest check and the logged PR. Check it reads
          right, then{" "}
          <button type="button" className="btn sm" onClick={() => window.print()}>
            Print / save as PDF
          </button>{" "}
          to send it to the client.
        </div>
      )}

      <div className="card report-head">
        <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          AI visibility report · {monthOf(run.run_date)}
        </div>
        <h2 style={{ margin: "4px 0" }}>{brand.name}</h2>
        <div className="muted" style={{ fontSize: 13 }}>
          Check of {dateOf(run.run_date)}: {questions} buyer questions asked to {measured.join(", ")} (
          {responses.length} answers, live web search on)
          {brand.pr_region ? ` · Market: ${brand.pr_region}` : ""}
          {prevRun ? ` · Compared with the check of ${dateOf(prevRun.run_date)}` : ""}.
        </div>
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div className="card kpi">
          <div className="v">
            {r1(blended.geo)}
            <small style={{ fontSize: 14 }}>/100</small>
          </div>
          <div className="l">Luminous GEO Score</div>
          <Delta v={scoreDelta} />
        </div>
        <div className="card kpi">
          <div className="v">{reach.newBuyers.answers ? reach.newBuyers.pct + "%" : "–"}</div>
          <div className="l">Found by new buyers</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Named in {reach.newBuyers.named} of {reach.newBuyers.answers} answers to questions that
            don&#39;t mention {brand.name}
          </div>
          {prevReach && reach.newBuyers.answers > 0 && (
            <Delta v={reach.newBuyers.pct - prevReach.newBuyers} unit=" pts" />
          )}
        </div>
        <div className="card kpi">
          <div className="v">{reach.byName.answers ? reach.byName.pct + "%" : "–"}</div>
          <div className="l">Recognised by name</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Named in {reach.byName.named} of {reach.byName.answers} answers to questions about{" "}
            {brand.name}
          </div>
          {prevReach && reach.byName.answers > 0 && (
            <Delta v={reach.byName.pct - prevReach.byName} unit=" pts" />
          )}
        </div>
      </div>

      <div className="two">
        <div className="card">
          <h3>By AI engine</h3>
          <table>
            <thead>
              <tr>
                <th>Engine</th>
                <th>Named in</th>
                <th>Own site cited</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {perEngine.map((p) => (
                <tr key={p.engine}>
                  <td>{p.engine}</td>
                  <td>{Math.round(p.mention)}%</td>
                  <td>{Math.round(p.citation)}%</td>
                  <td>{r1(p.geo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {notMeasured.length > 0 && (
            <div className="legend-note">Not measured this month: {notMeasured.join(", ")}.</div>
          )}
        </div>
        <div className="card">
          <h3>{topNamed.length ? "Share of voice in AI answers" : "Share of voice vs competitors"}</h3>
          {shareRows.length > 1 ? (
            <table>
              <tbody>
                {shareRows.map((s) => (
                  <tr key={s.player} style={s.me ? { fontWeight: 700 } : undefined}>
                    <td>{s.player}</td>
                    <td style={{ width: "45%" }}>
                      <div className="bar" style={{ height: 8, background: "var(--line)", borderRadius: 4 }}>
                        <i
                          style={{
                            display: "block",
                            height: 8,
                            borderRadius: 4,
                            width: s.pct + "%",
                            background: s.me ? "var(--blue)" : "var(--muted)",
                          }}
                        />
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>{s.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="muted">No competitors set up for this client.</div>
          )}
          <div className="legend-note">
            {topNamed.length
              ? `Every company the AI engines name when buyers ask questions that don't mention ${brand.name}; a recommendation counts double. ${named.length} companies named in total.`
              : "Share of answers naming each company, among the tracked competitors."}
          </div>
        </div>
      </div>

      {(gained.length > 0 || lost.length > 0) && (
        <div className="card">
          <h3>What changed since the last check</h3>
          <div className="two">
            <div>
              <b style={{ color: "var(--green)" }}>Named by more engines ({gained.length})</b>
              <ul>
                {gained.slice(0, 6).map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
            <div>
              <b style={{ color: "var(--red)" }}>Named by fewer engines ({lost.length})</b>
              <ul>
                {lost.slice(0, 6).map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="two">
        <div className="card">
          <h3>Where buyers find you</h3>
          {wins.length ? (
            <ul>
              {wins.map((w) => (
                <li key={w.p.id}>
                  {w.p.text} <span className="muted">— named by {w.named} of {w.n} engines</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="muted">Not yet named in most answers to open buyer questions.</div>
          )}
          <h3 style={{ marginTop: 12 }}>Where you&#39;re missing</h3>
          {missing.length ? (
            <ul>
              {missing.map((m) => (
                <li key={m.p.id}>
                  {m.p.text} <span className="muted">— named by {m.named} of {m.n} engines</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="muted">No open buyer question where you&#39;re missing from most answers.</div>
          )}
        </div>
        <div className="card">
          <h3>Sources the AI engines trust, where you&#39;re absent</h3>
          {gaps.length ? (
            <table>
              <tbody>
                {gaps.map((g) => (
                  <tr key={g.domain}>
                    <td>{g.domain}</td>
                    <td className="muted">{KIND_LABELS[data.sourceKinds[g.domain]?.kind || ""] || ""}</td>
                    <td style={{ textAlign: "right" }}>{g.count} citations</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="muted">No gaps found in this check.</div>
          )}
          <div className="legend-note">
            Sites cited in answers that didn&#39;t name {brand.name}: coverage here is what
            the engines read before answering.
          </div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="card">
          <h3>What AI gets wrong about {brand.name}</h3>
          <table>
            <tbody>
              {errors.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className={`tag ${r.accuracy === "Major error" ? "t-no" : "t-na"}`}>
                      {r.accuracy}
                    </span>
                  </td>
                  <td>
                    {(r.notes || "").replace(/^Accuracy:\s*/, "") || "Inaccurate statement"}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.engine} · &#39;{promptText.get(r.prompt_id) || ""}&#39;
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="legend-note">
            Judged against the fact sheet {brand.name} confirmed. Fixing the source (your
            site, directories, coverage) is how the engines re-learn it.
          </div>
        </div>
      )}

      <div className="card">
        <h3>PR impact</h3>
        {!answers ? (
          <div className="muted">Loading…</div>
        ) : impacts.length ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Coverage</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {impacts.map((i) => (
                <tr key={i.pr.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{dateOf(i.pr.activity_date)}</td>
                  <td>
                    {i.pr.outlet}
                    {i.pr.theme ? <span className="muted"> — {i.pr.theme}</span> : ""}
                  </td>
                  <td>
                    {i.articleHits.length
                      ? `Cited as a source in ${i.articleHits.length} AI answer${i.articleHits.length === 1 ? "" : "s"} (${[
                          ...new Set(i.articleHits.map((h) => h.engine)),
                        ].join(", ")})`
                      : i.status === "outlet_up"
                        ? `${i.outletDomain} cited in ${i.outletAfter?.pct}% of answers, up from ${i.outletBefore?.pct}%`
                        : i.status === "waiting"
                          ? "Published after this check — measured next month"
                          : "Not cited yet"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">No PR logged for this period.</div>
        )}
        {checks.length < 2 && (
          <div className="legend-note">
            Before/after comparisons start once there are two monthly checks with the current
            method.
          </div>
        )}
      </div>

      <div className="card">
        <h3>What we&#39;re doing next</h3>
        {actions.length ? (
          <table>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td className="muted">{a.linked_gap || ""}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{a.status || "Not started"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">No actions in the plan yet.</div>
        )}
      </div>

      <div className="legend-note">
        How this is measured: each buyer question is put to each AI engine exactly as a buyer
        would ask it, with the engine&#39;s live web search on and without naming {brand.name}{" "}
        unless the question does; each is sampled several times. A brand counts as named when
        its name or a known alias appears in the answer.
      </div>
    </div>
  );
}
