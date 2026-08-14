"use client";

import { useState } from "react";
import { useAppState } from "@/state/AppState";
import { StrategyBanner, Kpi } from "@/components/ui";
import { prAttribution } from "@/lib/scoring";
import { host, todayISO } from "@/lib/format";

export default function PRView() {
  const { brand, data, mode, sb, toast, reload } = useAppState();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    date: todayISO(),
    outlet: "",
    url: "",
    theme: "",
    tier: "Tier 2",
    atype: "Earned coverage",
  });

  if (!brand) return null;
  const ro = mode === "client";
  const cited = data.pr.filter((p) => p.cited).length;
  const t1 = data.pr.filter((p) => p.tier === "Tier 1").length;
  const att = prAttribution(data.responses);
  const byP: Record<string, (typeof data.prompts)[number]> = {};
  data.prompts.forEach((p) => (byP[p.id] = p));
  const linkedFor = (id: string) =>
    data.responses.filter((r) => r.cited_pr_id === id);
  const wallRows = data.responses.filter((r) => r.cited_pr_id);

  async function recheckCitations(showToast: boolean) {
    let linked = 0;
    const toLink: { id: string; pr: string }[] = [];
    const flag = new Set<string>();
    data.pr.forEach((p) => {
      const d = host(p.url);
      if (!d) return;
      data.responses.forEach((r) => {
        if (r.cited_sources && r.cited_sources.toLowerCase().includes(d)) {
          flag.add(p.id);
          if (r.cited_pr_id !== p.id) toLink.push({ id: r.id, pr: p.id });
        }
      });
    });
    for (const u of toLink) {
      const { error } = await sb
        .from("geo_responses")
        .update({ cited_pr_id: u.pr })
        .eq("id", u.id);
      if (!error) linked++;
    }
    for (const id of flag) {
      await sb.from("geo_pr_activity").update({ cited: true }).eq("id", id);
    }
    if (showToast)
      toast(
        linked
          ? "Linked " + linked + " citation" + (linked > 1 ? "s" : "") + " to PR"
          : "No new citations matched (record cited sources in Response Capture first)",
      );
    await reload();
  }

  async function addPR() {
    if (!form.outlet.trim()) return toast("Outlet required");
    setBusy(true);
    const rec = {
      brand_id: brand!.id,
      activity_date: form.date,
      outlet: form.outlet.trim(),
      url: form.url.trim() || null,
      theme: form.theme.trim() || null,
      tier: form.tier,
      atype: form.atype,
      cited: false,
    };
    const { error } = await sb.from("geo_pr_activity").insert(rec);
    if (error) {
      setBusy(false);
      return toast("Failed");
    }
    await reload();
    await recheckCitations(false);
    setForm({
      date: todayISO(),
      outlet: "",
      url: "",
      theme: "",
      tier: "Tier 2",
      atype: "Earned coverage",
    });
    setBusy(false);
    toast("Placement added");
  }

  async function delPR(id: string) {
    await sb.from("geo_pr_activity").delete().eq("id", id);
    toast("Removed");
    await reload();
  }

  return (
    <>
      <StrategyBanner />
      <div className="sec-title">PR &amp; Influence — {brand.name}</div>
      <div className="sec-sub">
        See exactly which earned PR the AI engines are citing, and how it lifts the
        client&#39;s visibility.
      </div>
      <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
        <Kpi l="PR placements" v={data.pr.length} />
        <Kpi l="Tier-1 placements" v={t1} />
        <Kpi l="Cited by AI" v={cited} />
        <Kpi l="% citations from PR" v={att.pct} />
      </div>
      {!ro && (
        <div style={{ marginBottom: 12 }}>
          <button
            className="btn sm"
            disabled={busy}
            onClick={() => recheckCitations(true)}
          >
            🔄 Re-check citations now
          </button>{" "}
          <span className="muted" style={{ fontSize: 12 }}>
            Matches each placement domain against the sources recorded in Response
            Capture.
          </span>
        </div>
      )}
      <div className="card" style={{ overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Outlet</th>
              <th>Tier</th>
              <th>Theme</th>
              <th>AI citation</th>
              <th>Cited in (engine · prompt)</th>
              {!ro && <th></th>}
            </tr>
          </thead>
          <tbody>
            {data.pr.length ? (
              data.pr.map((p) => {
                const li = linkedFor(p.id);
                return (
                  <tr key={p.id}>
                    <td>{p.activity_date}</td>
                    <td>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer">
                          {p.outlet}
                        </a>
                      ) : (
                        p.outlet
                      )}
                    </td>
                    <td>{p.tier}</td>
                    <td>{p.theme || ""}</td>
                    <td>
                      {p.cited ? (
                        <span className="tag t-yes">Cited by AI</span>
                      ) : (
                        <span className="tag t-na">Not yet</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {li.length ? (
                        li.map((r, idx) => (
                          <div key={idx}>
                            {r.engine} · &#39;{byP[r.prompt_id]?.text || ""}&#39;
                          </div>
                        ))
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    {!ro && (
                      <td>
                        <button className="btn sm danger" onClick={() => delPR(p.id)}>
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="muted">
                  No PR logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="legend-note">
          <b>
            {att.attr} of {att.cited}
          </b>{" "}
          cited AI answers ({att.pct}%) trace back to logged PR. The &quot;Cited in&quot;
          column shows the exact engine and prompt where your coverage is working.
        </div>
      </div>

      {wallRows.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Your PR, quoted in AI answers</h3>
          {wallRows.map((r) => {
            const pr = data.pr.find((x) => x.id === r.cited_pr_id);
            return (
              <div
                key={r.id}
                style={{
                  borderLeft: "4px solid var(--green)",
                  background: "#f3faf6",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 13 }}>{r.evidence || ""}</div>
                <div className="legend-note" style={{ marginTop: 4 }}>
                  <b>{r.engine}</b> · &#39;{byP[r.prompt_id]?.text || ""}&#39; · cited
                  source: <b>{pr ? pr.outlet : ""}</b>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!ro && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Log a PR placement</h3>
          <div className="set-grid">
            <div>
              <label>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div>
              <label>Outlet</label>
              <input
                placeholder="e.g. TechCrunch"
                value={form.outlet}
                onChange={(e) => setForm({ ...form, outlet: e.target.value })}
              />
            </div>
            <div>
              <label>URL</label>
              <input
                placeholder="https://"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </div>
            <div>
              <label>Theme</label>
              <input
                placeholder="e.g. AI, fintech, security"
                value={form.theme}
                onChange={(e) => setForm({ ...form, theme: e.target.value })}
              />
            </div>
            <div>
              <label>Tier</label>
              <select
                value={form.tier}
                onChange={(e) => setForm({ ...form, tier: e.target.value })}
              >
                <option>Tier 1</option>
                <option>Tier 2</option>
                <option>Tier 3</option>
              </select>
            </div>
            <div>
              <label>Type</label>
              <select
                value={form.atype}
                onChange={(e) => setForm({ ...form, atype: e.target.value })}
              >
                <option>Earned coverage</option>
                <option>Review/Listing</option>
                <option>Community</option>
                <option>Owned</option>
              </select>
            </div>
          </div>
          <button
            className="btn sm"
            style={{ marginTop: 10 }}
            disabled={busy}
            onClick={addPR}
          >
            Add &amp; auto-check citations
          </button>
          <div className="legend-note">
            On adding, the system scans captured AI answers for this outlet&#39;s domain
            and auto-links any matches.
          </div>
        </div>
      )}
    </>
  );
}
