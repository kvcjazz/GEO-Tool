"use client";

import { useAppState } from "@/state/AppState";
import { StrategyBanner } from "@/components/ui";
import { host } from "@/lib/format";

export default function SourcesView() {
  const { brand, data } = useAppState();
  if (!brand) return null;
  const resp = data.responses;
  const own = host(brand.website || "");
  const mediaNames = data.media.map((m) => (m.outlet || "").toLowerCase());
  const norm = (s: string) =>
    (s || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];

  const counts: Record<string, number> = {};
  const engineOf: Record<string, Set<string>> = {};
  resp.forEach((r) => {
    String(r.cited_sources || "")
      .split(/[,;]/)
      .forEach((s) => {
        const d = norm(s);
        if (!d) return;
        counts[d] = (counts[d] || 0) + 1;
        (engineOf[d] = engineOf[d] || new Set()).add(r.engine);
      });
  });
  const rows = Object.keys(counts)
    .map((d) => ({ domain: d, count: counts[d], engines: [...(engineOf[d] || [])] }))
    .sort((a, b) => b.count - a.count);

  const isOwn = (d: string) =>
    !!own && (d === own || d.indexOf(own) >= 0 || own.indexOf(d) >= 0);
  const isTarget = (d: string) =>
    mediaNames.some((n) => {
      const t = n.replace(/[^a-z0-9]/g, "");
      return (
        t.length >= 3 &&
        d.replace(/[^a-z0-9]/g, "").indexOf(t.slice(0, Math.min(t.length, 8))) >= 0
      );
    });
  const cls = (d: string) =>
    isOwn(d) ? (
      <span className="tag t-yes">Owned</span>
    ) : isTarget(d) ? (
      <span className="badge">Target</span>
    ) : (
      <span className="tag t-na">Gap</span>
    );

  const gapCounts: Record<string, number> = {};
  resp
    .filter((r) => !r.mentioned && (r.competitor_mentions || 0) > 0)
    .forEach((r) => {
      String(r.cited_sources || "")
        .split(/[,;]/)
        .forEach((s) => {
          const d = norm(s);
          if (!d || isOwn(d)) return;
          gapCounts[d] = (gapCounts[d] || 0) + 1;
        });
    });
  const gapRows = Object.keys(gapCounts)
    .map((d) => ({ domain: d, count: gapCounts[d] }))
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <StrategyBanner />
      <div className="sec-title">Source Intelligence — {brand.name}</div>
      <div className="sec-sub">
        Which sources the AI engines rely on for this client&#39;s prompts — where
        you&#39;re already the source (<b>Owned</b>), where a target outlet is cited (
        <b>Target</b>), and the <b>Gaps</b> you should go earn. Populated from captured
        cited-sources.
      </div>
      {rows.length ? (
        <div className="two" style={{ alignItems: "start" }}>
          <div className="card" style={{ overflow: "auto" }}>
            <h3>Most-cited sources (current run)</h3>
            <table>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Cited</th>
                  <th>Engines</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((r) => (
                  <tr key={r.domain}>
                    <td>
                      <a href={`//${r.domain}`} target="_blank" rel="noreferrer">
                        {r.domain}
                      </a>
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
            <h3>Priority target gaps</h3>
            <div className="legend-note">
              Sources cited in answers where a competitor is named but {brand.name} is
              not — the clearest places to aim earned coverage.
            </div>
            <table>
              <tbody>
                {gapRows.length ? (
                  gapRows.slice(0, 20).map((r) => (
                    <tr key={r.domain}>
                      <td>
                        <a href={`//${r.domain}`} target="_blank" rel="noreferrer">
                          {r.domain}
                        </a>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <b>{r.count}</b>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="muted">
                      No competitor-gap sources captured yet — record cited sources in
                      Response Capture (auto-run does this).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <h3>No source data yet</h3>
          <div className="sec-sub">
            Run the auto-capture (which records the domains each engine relies on) or
            enter cited sources in Response Capture, then this view will populate.
          </div>
        </div>
      )}
    </>
  );
}
