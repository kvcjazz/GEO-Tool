"use client";

import { useAppState } from "@/state/AppState";
import { StrategyBanner } from "@/components/ui";
import { ENGINES } from "@/lib/constants";

export default function PromptsView() {
  const { brand, data } = useAppState();
  if (!brand) return null;
  return (
    <>
      <StrategyBanner />
      <div className="sec-title">Prompt Set — {brand.name}</div>
      <div className="sec-sub">
        {data.prompts.length} prompts · {data.competitors.length} competitors. Edit in{" "}
        <b>Settings</b>.
      </div>
      <div className="two">
        <div className="card" style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Prompt</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.prompts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="badge">{p.code}</span>
                  </td>
                  <td>{p.ptype}</td>
                  <td>{p.text}</td>
                  <td>
                    {p.active ? (
                      <span className="tag t-yes">Active</span>
                    ) : (
                      <span className="tag t-na">Off</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Competitors tracked</h3>
          <table>
            <tbody>
              {data.competitors.length ? (
                data.competitors.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted">None</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="legend-note">Engines scored: {ENGINES.join(" · ")}.</div>
        </div>
      </div>
    </>
  );
}
