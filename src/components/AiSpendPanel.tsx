"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppState } from "@/state/AppState";

// Admin → AI spend. Every paid model call the edge functions make is logged to
// geo_ai_usage (see supabase/functions/_shared/providers.ts). This panel rolls
// it up by client and by purpose so duplicate or runaway spend is visible, and
// turns tokens + searches into a dollar estimate from prices an admin enters.

type Row = {
  month: string;
  brand_id: string | null;
  fn: string;
  purpose: string;
  provider: string;
  model: string;
  calls: number;
  failed: number;
  input_tokens: number;
  output_tokens: number;
  searches: number;
  reported_cost_usd: number | null;
};

type Rate = {
  provider: string;
  model_prefix: string;
  usd_per_m_input: number;
  usd_per_m_output: number;
  usd_per_search: number;
};

const PURPOSE: Record<string, string> = {
  answer: "Monthly check — AI answers (web search)",
  grade: "Monthly check — rating the answers",
  entities: "Monthly check — brands named",
  "entities-backfill": "Brands named — catch-up job",
  "listen-questions": "Other mentions — writing questions",
  "listen-answer": "Other mentions — AI answers (web search)",
  radar: "Plan — Radar ideas",
  titles: "Plan — Titles to target",
  "classify-sources": "Sources — site types (automatic)",
  "publication-names": "Coverage — publication names",
  "suggest-questions": "Client setup — question suggestions",
  "suggest-questions-seo": "Client setup — suggestions from search demand",
  tailor: "Plan — tailor an action",
  "strategy-summary": "Overview — strategy summary (automatic)",
};

const PERIODS = [
  { id: "this", label: "This month" },
  { id: "last", label: "Last month" },
  { id: "3m", label: "Last 3 months" },
] as const;
type Period = (typeof PERIODS)[number]["id"];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function range(p: Period): { from: string; to: string } {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (p === "this") return { from: iso(first), to: iso(now) };
  if (p === "last") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const to = new Date(first.getTime() - 86_400_000);
    return { from: iso(from), to: iso(to) };
  }
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return { from: iso(from), to: iso(now) };
}

const n = (v: unknown): number => Number(v) || 0;
const fmtInt = (v: number): string => Math.round(v).toLocaleString("en-GB");
const fmtTok = (v: number): string =>
  v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : String(Math.round(v));
const fmtUsd = (v: number): string => (v < 10 ? "$" + v.toFixed(2) : "$" + Math.round(v).toLocaleString("en-GB"));

/** Longest matching model_prefix for this provider, or null. */
function rateFor(rates: Rate[], provider: string, model: string): Rate | null {
  let best: Rate | null = null;
  for (const r of rates) {
    if (r.provider !== provider || !model.startsWith(r.model_prefix)) continue;
    if (!best || r.model_prefix.length > best.model_prefix.length) best = r;
  }
  return best;
}

/** Cost of a row: the provider's own figure when reported, else tokens × price. */
function costOf(r: Row, rates: Rate[]): number | null {
  if (r.reported_cost_usd != null) return n(r.reported_cost_usd);
  const rate = rateFor(rates, r.provider, r.model);
  if (!rate) return null;
  return (
    (n(r.input_tokens) / 1e6) * n(rate.usd_per_m_input) +
    (n(r.output_tokens) / 1e6) * n(rate.usd_per_m_output) +
    n(r.searches) * n(rate.usd_per_search)
  );
}

type Agg = {
  key: string;
  label: string;
  calls: number;
  failed: number;
  searches: number;
  inTok: number;
  outTok: number;
  cost: number;
  priced: boolean;
};

function aggregate(rows: Row[], rates: Rate[], keyOf: (r: Row) => string, labelOf: (k: string) => string): Agg[] {
  const m = new Map<string, Agg>();
  for (const r of rows) {
    const k = keyOf(r);
    const a =
      m.get(k) ||
      ({ key: k, label: labelOf(k), calls: 0, failed: 0, searches: 0, inTok: 0, outTok: 0, cost: 0, priced: true } as Agg);
    a.calls += n(r.calls);
    a.failed += n(r.failed);
    a.searches += n(r.searches);
    a.inTok += n(r.input_tokens);
    a.outTok += n(r.output_tokens);
    const c = costOf(r, rates);
    if (c == null) {
      // Failed calls with no tokens cost nothing, so they don't need a price.
      if (n(r.input_tokens) + n(r.output_tokens) + n(r.searches) > 0) a.priced = false;
    } else a.cost += c;
    m.set(k, a);
  }
  return [...m.values()].sort((x, y) => y.cost - x.cost || y.calls - x.calls);
}

export default function AiSpendPanel() {
  const { sb, brands, archivedBrands, toast } = useAppState();
  const [period, setPeriod] = useState<Period>("this");
  const [rows, setRows] = useState<Row[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [draft, setDraft] = useState<Record<string, Rate>>({});
  const [state, setState] = useState<"loading" | "ok" | "off">("loading");

  const load = useCallback(async () => {
    setState("loading");
    const { from, to } = range(period);
    const [u, r] = await Promise.all([
      sb.rpc("geo_ai_usage_summary", { p_from: from, p_to: to }),
      sb.from("geo_ai_rates").select("*"),
    ]);
    if (u.error) {
      // The function doesn't exist until the spend-logging migration is applied.
      setState("off");
      return;
    }
    setRows((u.data || []) as Row[]);
    setRates(((r.data || []) as Rate[]).map((x) => ({ ...x })));
    setState("ok");
  }, [sb, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of [...brands, ...archivedBrands]) m.set(b.id, b.name);
    return m;
  }, [brands, archivedBrands]);

  const byClient = aggregate(rows, rates, (r) => r.brand_id || "", (k) => (k ? names.get(k) || "Deleted client" : "No client"));
  const byPurpose = aggregate(rows, rates, (r) => r.purpose, (k) => PURPOSE[k] || k);
  const total = aggregate(rows, rates, () => "all", () => "All")[0];

  // The price list: every saved price, plus each model used in the period that
  // no saved price covers yet (so it's obvious what still needs a price).
  const models = useMemo(() => {
    const seen = new Map<string, { provider: string; model: string }>();
    for (const r of rates) seen.set(r.provider + "|" + r.model_prefix, { provider: r.provider, model: r.model_prefix });
    for (const r of rows) {
      if (!r.model || r.reported_cost_usd != null || rateFor(rates, r.provider, r.model)) continue;
      seen.set(r.provider + "|" + r.model, { provider: r.provider, model: r.model });
    }
    return [...seen.values()].sort((a, b) => (a.provider + a.model).localeCompare(b.provider + b.model));
  }, [rows, rates]);

  // Models with spend but no price, named in the total so the gap is clear.
  const unpriced = [
    ...new Set(
      rows
        .filter((r) => costOf(r, rates) == null && n(r.input_tokens) + n(r.output_tokens) + n(r.searches) > 0)
        .map((r) => r.model || r.provider),
    ),
  ];

  function rateDraft(provider: string, model: string): Rate {
    const k = provider + "|" + model;
    return (
      draft[k] ||
      rates.find((r) => r.provider === provider && r.model_prefix === model) || {
        provider,
        model_prefix: model,
        usd_per_m_input: 0,
        usd_per_m_output: 0,
        usd_per_search: 0,
      }
    );
  }

  async function savePrices() {
    const list = Object.values(draft);
    if (!list.length) return toast("No price changes to save");
    const { error } = await sb
      .from("geo_ai_rates")
      .upsert(list.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    if (error) return toast("Prices not saved: " + error.message);
    setDraft({});
    toast("Prices saved");
    await load();
  }

  const table = (title: string, list: Agg[], what: string) => (
    <div style={{ overflow: "auto" }}>
      <table style={{ minWidth: 640 }}>
        <thead>
          <tr>
            <th>{title}</th>
            <th style={{ textAlign: "right" }}>Est. cost</th>
            <th style={{ textAlign: "right" }}>AI calls</th>
            <th style={{ textAlign: "right" }}>Failed</th>
            <th style={{ textAlign: "right" }}>Web searches</th>
            <th style={{ textAlign: "right" }}>Tokens in / out</th>
          </tr>
        </thead>
        <tbody>
          {list.length ? (
            list.map((a) => (
              <tr key={a.key}>
                <td>{a.label}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {a.priced ? <b>{fmtUsd(a.cost)}</b> : <span className="muted">{a.cost ? "≥ " + fmtUsd(a.cost) : "add prices"}</span>}
                </td>
                <td style={{ textAlign: "right" }}>{fmtInt(a.calls)}</td>
                <td style={{ textAlign: "right" }} className={a.failed ? "prio-md" : "muted"}>
                  {fmtInt(a.failed)}
                </td>
                <td style={{ textAlign: "right" }}>{fmtInt(a.searches)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {fmtTok(a.inTok)} / {fmtTok(a.outTok)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="muted">
                No AI calls {what} in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="card stack" style={{ marginBottom: 16 }}>
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>AI spend</h3>
        <div className="flex" style={{ gap: 6 }} role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn sm${period === p.id ? "" : " ghost"}`}
              aria-pressed={period === p.id}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="legend-note">
        Every AI call the tool makes is logged with the provider&#39;s own token and search
        counts, by client and by what it was for. Use it to spot duplicate checks and to see
        what each client costs to run. Dollar figures are estimates from the prices below;
        Perplexity reports its own cost. Your provider invoices remain the final word.
      </div>

      {state === "loading" && <div className="muted">Loading…</div>}
      {state === "off" && (
        <div className="muted">
          Spend logging isn&#39;t switched on yet, or this account isn&#39;t an admin. It starts
          once the <code>ai_usage_and_check_guards</code> migration is applied and the edge
          functions are redeployed.
        </div>
      )}
      {state === "ok" && (
        <>
          <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="chip chip-blue">{fmtInt(total?.calls || 0)} AI calls</span>
            <span className="chip">{fmtInt(total?.searches || 0)} web searches</span>
            <span className="chip">
              {fmtTok(total?.inTok || 0)} in / {fmtTok(total?.outTok || 0)} out tokens
            </span>
            {total && total.failed > 0 && <span className="chip chip-amber">{fmtInt(total.failed)} failed</span>}
            <span
              className={`chip ${unpriced.length ? "chip-amber" : "chip-green"}`}
              title={unpriced.length ? "No price yet for: " + unpriced.join(", ") : undefined}
            >
              {!total
                ? "$0"
                : unpriced.length
                  ? `≥ ${fmtUsd(total.cost)} · add prices for ${unpriced.slice(0, 2).join(", ")}${unpriced.length > 2 ? "…" : ""}`
                  : "≈ " + fmtUsd(total.cost)}
            </span>
          </div>
          {table("Client", byClient, "for any client")}
          {table("What it was for", byPurpose, "")}

          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Prices (USD) used for the estimate</summary>
            <div className="legend-note">
              Enter each model&#39;s list price from the provider&#39;s pricing page: dollars per
              million input and output tokens, and per web search. A row applies to every
              model whose name starts with it.
            </div>
            <div style={{ overflow: "auto" }}>
              <table style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Model</th>
                    <th>$ / M input</th>
                    <th>$ / M output</th>
                    <th>$ / search</th>
                  </tr>
                </thead>
                <tbody>
                  {models.length ? (
                    models.map(({ provider, model }) => {
                      const r = rateDraft(provider, model);
                      const set = (field: keyof Rate, v: string) =>
                        setDraft((d) => ({ ...d, [provider + "|" + model]: { ...r, [field]: Math.max(0, +v || 0) } }));
                      return (
                        <tr key={provider + model}>
                          <td>{provider}</td>
                          <td>{model}</td>
                          {(["usd_per_m_input", "usd_per_m_output", "usd_per_search"] as const).map((f) => (
                            <td key={f}>
                              <input
                                type="number"
                                min={0}
                                step="0.001"
                                style={{ width: 90 }}
                                aria-label={`${provider} ${model} ${f}`}
                                value={r[f]}
                                onChange={(e) => set(f, e.target.value)}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="muted">
                        Models appear here once they have been used.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={savePrices}>
              Save prices
            </button>
          </details>
        </>
      )}
    </div>
  );
}
