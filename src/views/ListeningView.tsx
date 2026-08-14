"use client";

import { useState } from "react";
import { useAppState } from "@/state/AppState";
import { StrategyBanner, Kpi } from "@/components/ui";
import { todayISO } from "@/lib/format";
import { callFn } from "@/lib/callFn";
import { ListenResponseSchema } from "@/lib/schemas";

function sTag(s?: string | null) {
  if (s === "Positive") return <span className="tag t-pos">Positive</span>;
  if (s === "Negative") return <span className="tag t-neg">Negative</span>;
  return <span className="tag t-neu">Neutral</span>;
}

export default function ListeningView() {
  const { brand, data, mode, sb, toast, reload } = useAppState();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    date: todayISO(),
    source: "",
    context: "",
    url: "",
    sentiment: "Neutral",
    theme: "",
    snippet: "",
    cited: false,
  });

  if (!brand) return null;
  const ro = mode === "client";
  const m = data.mentions;
  const pos = m.filter((x) => x.sentiment === "Positive").length;
  const cited = m.filter((x) => x.cited).length;

  async function scanMentions() {
    if (mode !== "team") return;
    if (
      !window.confirm(
        "Scan the live AI engines and news for new mentions of " +
          brand!.name +
          " outside your prompt set? This uses your AI credit and can take up to a minute.",
      )
    )
      return;
    setBusy(true);
    try {
      const j = await callFn(
        "geo-listen",
        { brand_id: brand!.id },
        ListenResponseSchema,
      );
      toast(
        j.ok
          ? (j.inserted || 0) +
              " new mention" +
              (j.inserted === 1 ? "" : "s") +
              " found · " +
              (j.scanned || 0) +
              " AI checks + news"
          : "Scan failed: " + (j.error || ""),
      );
      await reload();
    } catch (e) {
      toast("Scan error: " + String(e));
    }
    setBusy(false);
  }

  async function addMention() {
    if (!form.source.trim()) return toast("Source required");
    const rec = {
      brand_id: brand!.id,
      found_date: form.date,
      source: form.source.trim(),
      context: form.context.trim() || null,
      url: form.url.trim() || null,
      sentiment: form.sentiment,
      theme: form.theme.trim() || null,
      snippet: form.snippet.trim() || null,
      cited: form.cited,
    };
    const { error } = await sb.from("geo_mentions").insert(rec);
    if (error) return toast("Failed");
    toast("Mention logged");
    setForm({
      date: todayISO(),
      source: "",
      context: "",
      url: "",
      sentiment: "Neutral",
      theme: "",
      snippet: "",
      cited: false,
    });
    await reload();
  }

  async function delMention(id: string) {
    await sb.from("geo_mentions").delete().eq("id", id);
    toast("Removed");
    await reload();
  }

  return (
    <>
      <StrategyBanner />
      <div className="sec-title">Listening — {brand.name}</div>
      <div className="sec-sub">
        Brand mentions found in AI answers and live news <b>outside</b> the fixed prompt
        set — so you never miss organic visibility or context the prompts don&#39;t cover.
      </div>
      {mode === "team" && (
        <div style={{ marginBottom: 14 }}>
          <button className="btn" onClick={scanMentions} disabled={busy}>
            {busy ? "🔎 Scanning…" : "🔎 Scan for mentions"}
          </button>{" "}
          <span className="muted" style={{ fontSize: 12 }}>
            Asks the live AI engines open discovery questions (not your prompt set) and
            scans the last 30 days of news for “{brand.name}”, then logs new mentions.
            Uses your AI credit.
          </span>
        </div>
      )}
      <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <Kpi l="Mentions logged" v={m.length} />
        <Kpi l="Positive" v={pos} />
        <Kpi l="Cited as source" v={cited} />
      </div>
      <div className="card" style={{ overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Source</th>
              <th>Context / query</th>
              <th>Snippet</th>
              <th>Sentiment</th>
              <th>Theme</th>
              <th>Cited</th>
              {!ro && <th></th>}
            </tr>
          </thead>
          <tbody>
            {m.length ? (
              m.map((x) => (
                <tr key={x.id}>
                  <td>{x.found_date}</td>
                  <td>
                    {x.url ? (
                      <a href={x.url} target="_blank" rel="noreferrer">
                        {x.source}
                      </a>
                    ) : (
                      x.source
                    )}
                  </td>
                  <td style={{ minWidth: 160 }}>{x.context || ""}</td>
                  <td style={{ minWidth: 220 }}>{x.snippet || ""}</td>
                  <td>{sTag(x.sentiment)}</td>
                  <td>{x.theme || ""}</td>
                  <td>
                    {x.cited ? (
                      <span className="tag t-yes">Cited</span>
                    ) : (
                      <span className="tag t-na">—</span>
                    )}
                  </td>
                  {!ro && (
                    <td>
                      <button className="btn sm danger" onClick={() => delMention(x.id)}>
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="muted">
                  No mentions logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="legend-note">
          <b>Why this matters:</b> prompt-based capture only sees what you ask. Listening
          records mentions discovered anywhere — an unprompted AI recommendation, a news
          story — so the team spots reputation, context and risk early. <b>Now live:</b>{" "}
          click <b>Scan for mentions</b> to pull real results, and a scheduled scan runs
          automatically each month.
        </div>
      </div>

      {!ro && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Log a mention</h3>
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
              <label>Source (engine / site)</label>
              <input
                placeholder="e.g. ChatGPT, Reddit, Perplexity"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </div>
            <div>
              <label>Context / query</label>
              <input
                placeholder="What was being asked / where"
                value={form.context}
                onChange={(e) => setForm({ ...form, context: e.target.value })}
              />
            </div>
            <div>
              <label>URL (optional)</label>
              <input
                placeholder="https://"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </div>
            <div>
              <label>Sentiment</label>
              <select
                value={form.sentiment}
                onChange={(e) => setForm({ ...form, sentiment: e.target.value })}
              >
                <option>Positive</option>
                <option>Neutral</option>
                <option>Negative</option>
              </select>
            </div>
            <div>
              <label>Theme</label>
              <input
                placeholder="e.g. AI, fintech"
                value={form.theme}
                onChange={(e) => setForm({ ...form, theme: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label>Snippet / quote</label>
              <textarea
                placeholder="Paste the exact mention"
                value={form.snippet}
                onChange={(e) => setForm({ ...form, snippet: e.target.value })}
              />
            </div>
            <div>
              <label className="flex" style={{ fontWeight: 500 }}>
                <input
                  type="checkbox"
                  style={{ width: "auto", marginRight: 8 }}
                  checked={form.cited}
                  onChange={(e) => setForm({ ...form, cited: e.target.checked })}
                />
                Cited as a source
              </label>
            </div>
          </div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={addMention}>
            Add mention
          </button>
        </div>
      )}
    </>
  );
}
