"use client";

import { useState } from "react";
import { useAppState } from "@/state/AppState";
import { brandKey, categoryBrands, missingEntities } from "@/lib/scoring";
import { r1 } from "@/lib/format";
import { callFn } from "@/lib/callFn";
import { EntitiesResponseSchema } from "@/lib/schemas";

/**
 * Every brand the AI engines name for this client's buyer questions (those
 * that don't name the client) — the real competitive set, which share of
 * voice is measured against. Lets the team track any of them as a competitor.
 */
export default function CategoryBrandsPanel() {
  const { brand, data, sb, toast, reload, mode } = useAppState();
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  if (!brand) return null;

  const named = categoryBrands(data.responses, brand.name);
  const unread = missingEntities(data.responses);
  const tracked = new Set(
    data.competitors.flatMap((c) => [c.name, ...(c.aliases || [])]).map(brandKey),
  );
  const list = named.filter((b) => !b.client);
  const shown = showAll ? list : list.slice(0, 12);
  const untrackedTop = list.slice(0, 10).filter((b) => !tracked.has(brandKey(b.name)));

  async function track(name: string) {
    const { error } = await sb.from("geo_competitors").insert({ brand_id: brand!.id, name });
    if (error) return toast("Failed: " + error.message);
    toast(name + " is now tracked");
    await reload();
  }

  async function readBrands() {
    if (
      !window.confirm(
        `Read which brands the AI engines named in ${unread}+ answers already measured for ${
          brand!.name
        }? This uses AI credit (a few cents per dozen answers).`,
      )
    )
      return;
    setBusy(true);
    try {
      for (let i = 0; i < 12; i++) {
        const j = await callFn("geo-entities", { brand_id: brand!.id }, EntitiesResponseSchema);
        if (!j.ok) throw new Error(j.error || "failed");
        toast(`Read ${j.processed ?? 0} more answers · ${j.remaining ?? 0} to go`);
        if (!j.remaining || !j.processed) {
          if (j.remaining && j.errors?.length) toast("Stopped: " + j.errors[0]);
          break;
        }
      }
    } catch (e) {
      toast("Couldn't read brands: " + String(e));
    }
    setBusy(false);
    await reload();
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Brands the AI engines name</h3>
      <div className="legend-note" style={{ marginTop: 0 }}>
        Every company the engines put forward when buyers ask questions that don&#39;t
        mention {brand.name}. This is the real competitive set: share of voice is measured
        against all of them, not just the competitors tracked above. A recommendation counts
        double.
      </div>
      {unread > 0 && mode === "team" && (
        <div className="flex" style={{ margin: "10px 0" }}>
          <button className="btn sm" disabled={busy} onClick={readBrands}>
            {busy ? "Reading answers…" : `Read brands in ${unread} answers`}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            Answers measured before this feature haven&#39;t been read yet. New checks do it
            automatically.
          </span>
        </div>
      )}
      {list.length ? (
        <>
          <table>
            <thead>
              <tr>
                <th>Brand</th>
                <th>Share of voice</th>
                <th>Answers naming it</th>
                <th>Recommended in</th>
                <th>Engines</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => {
                const isTracked = tracked.has(brandKey(b.name));
                return (
                  <tr key={b.key}>
                    <td>
                      <b>{b.name}</b>
                    </td>
                    <td>{r1(b.share)}%</td>
                    <td>{b.answers}</td>
                    <td>{b.recommended}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {b.engines.join(", ")}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isTracked ? (
                        <span className="tag t-yes">Tracked</span>
                      ) : mode === "team" ? (
                        <button className="btn sm ghost" onClick={() => track(b.name)}>
                          Track
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length > 12 && (
            <button type="button" className="linkbtn" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show fewer" : `Show all ${list.length} brands`}
            </button>
          )}
          {untrackedTop.length > 0 && (
            <div className="legend-note">
              Not tracked yet among the top 10: {untrackedTop.map((b) => b.name).join(", ")}.
            </div>
          )}
        </>
      ) : (
        !unread && <div className="muted">No brand data for this check yet.</div>
      )}
    </div>
  );
}
