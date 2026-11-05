"use client";

import { useAppState } from "@/state/AppState";
import { host } from "@/lib/format";
import { KIND_LABELS, citedSources, gapSources, isOwnSite, isTarget as notCompetitor } from "@/lib/sources";

export default function SourcesView() {
  const { brand, data, mode, sb, toast, reload, setSourceKind, classifying, setView } =
    useAppState();
  if (!brand) return null;
  const ro = mode === "client";
  const kinds = data.sourceKinds;
  const rows = citedSources(data.responses);
  const allGaps = gapSources(brand, data.responses);
  // A client won't be covered on a competitor's own site, so those aren't targets.
  const gaps = allGaps.filter((g) => notCompetitor(g.domain, kinds));
  const competitorGaps = allGaps.filter((g) => !notCompetitor(g.domain, kinds));
  const kindNote = (d: string) => {
    const k = kinds[d];
    if (!k) return null;
    return (
      <span className="muted" style={{ fontSize: 12 }}>
        {" "}
        · {k.label || KIND_LABELS[k.kind] || k.kind}
      </span>
    );
  };

  const mediaNames = data.media.map((m) => (m.outlet || "").toLowerCase());
  const coverageHosts = new Set(data.pr.map((p) => host(p.url)).filter(Boolean));
  const isCoverage = (d: string) =>
    [...coverageHosts].some((h) => d === h || d.endsWith("." + h));
  const isTarget = (d: string) =>
    mediaNames.some((n) => {
      const t = n.replace(/[^a-z0-9]/g, "");
      return (
        t.length >= 3 &&
        d.replace(/[^a-z0-9]/g, "").indexOf(t.slice(0, Math.min(t.length, 8))) >= 0
      );
    });
  const cls = (d: string) =>
    isOwnSite(d, brand) ? (
      <span className="tag t-yes">Your site</span>
    ) : isCoverage(d) ? (
      <span className="tag t-pos">Your coverage</span>
    ) : kinds[d]?.kind === "competitor" ? (
      <span className="tag t-no">Competitor</span>
    ) : isTarget(d) ? (
      <span className="badge">Target outlet</span>
    ) : (
      <span className="tag t-na">Gap</span>
    );

  const planned = new Set(data.opps.map((o) => o.title));
  const planTitle = (d: string) => `Earn coverage on ${d}`;
  async function addToPlan(d: string, count: number) {
    const { error } = await sb.from("geo_opportunities").insert({
      brand_id: brand!.id,
      title: planTitle(d),
      linked_gap: `Citation · cited ${count}× in answers that don't name ${brand!.name}`,
      impact: count >= 10 ? 5 : count >= 5 ? 4 : 3,
      effort: 3,
      status: "Not started",
      sort: data.opps.length + 1,
    });
    if (error) return toast("Failed: " + error.message);
    toast("Added to the action plan");
    await reload();
  }

  if (!rows.length) {
    return (
      <div className="card">
        <h3>No source data yet</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          Sources appear here after a monthly check, which records the sites each engine
          cites in its answers.
        </p>
      </div>
    );
  }

  return (
    <div className="two" style={{ alignItems: "start" }}>
      <div className="card" style={{ overflow: "auto" }}>
        <h3>Most-cited sites (this check)</h3>
        <table>
          <thead>
            <tr>
              <th>Site</th>
              <th>Cited</th>
              <th>Engines</th>
              <th>What it is to you</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 25).map((r) => (
              <tr key={r.domain}>
                <td>
                  <a href={`//${r.domain}`} target="_blank" rel="noreferrer">
                    {r.domain}
                  </a>
                  {kindNote(r.domain)}
                </td>
                <td>
                  <b>{r.count}</b>
                </td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {r.engines.join(", ")}
                </td>
                <td>{cls(r.domain)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Where to earn coverage</h3>
        <div className="legend-note" style={{ marginTop: 0, marginBottom: 10 }}>
          Sites the engines cite when they answer without naming {brand.name}, leaving out
          competitors&#39; own sites — the clearest places to aim earned coverage.
          {classifying && <> Checking which sites are competitors…</>}
          {!ro && (
            <>
              {" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setView("plan", "titles");
                }}
              >
                Which of these are realistic for {brand.name}? → Titles to target
              </a>
            </>
          )}
        </div>
        <table>
          <tbody>
            {gaps.length ? (
              gaps.slice(0, 20).map((r) => (
                <tr key={r.domain}>
                  <td>
                    <a href={`//${r.domain}`} target="_blank" rel="noreferrer">
                      {r.domain}
                    </a>
                    {kindNote(r.domain)}{" "}
                    {isCoverage(r.domain) && <span className="tag t-pos">Your coverage</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <b>{r.count}</b>
                  </td>
                  {!ro && (
                    <td style={{ textAlign: "right", width: 1, whiteSpace: "nowrap" }}>
                      {planned.has(planTitle(r.domain)) ? (
                        <span className="muted" style={{ fontSize: 12 }}>
                          In plan
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn sm ghost"
                          onClick={() => addToPlan(r.domain, r.count)}
                        >
                          Add to plan
                        </button>
                      )}{" "}
                      <button
                        type="button"
                        className="btn sm ghost"
                        title="Mark as a competitor's site and leave it out of this list"
                        onClick={() => setSourceKind(r.domain, "competitor", "Competitor")}
                      >
                        Competitor
                      </button>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td className="muted">
                  No gaps: every answer that cited sources also named {brand.name}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {competitorGaps.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              Competitor sites left out ({competitorGaps.length})
            </summary>
            <table style={{ marginTop: 6 }}>
              <tbody>
                {competitorGaps.map((r) => (
                  <tr key={r.domain}>
                    <td>
                      <a href={`//${r.domain}`} target="_blank" rel="noreferrer">
                        {r.domain}
                      </a>
                      {kindNote(r.domain)}
                    </td>
                    <td style={{ textAlign: "right" }}>{r.count}</td>
                    {!ro && (
                      <td style={{ textAlign: "right", width: 1, whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className="btn sm ghost"
                          onClick={() => setSourceKind(r.domain, "other", null)}
                        >
                          Not a competitor
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
    </div>
  );
}
