"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/state/AppState";
import { ClientBadge } from "@/components/ClientSwitcher";
import { measuredOnly } from "@/lib/constants";
import { computeAll, SCORE_COLUMNS, type Scorable } from "@/lib/scoring";
import { reachSplit } from "@/lib/questions";
import { factSheetFilled } from "@/lib/factSheet";
import { r1 } from "@/lib/format";
import type { Brand, Prompt, Response, Run } from "@/lib/types";

// All clients: one card per client with its latest score, the change since
// the previous comparable check, how often new buyers find it, and what needs
// attention. The team's starting point; never shown in client view.

type Row = Scorable & { run_id: string; prompt_id: string };

type Card = {
  brand: Brand;
  current: Run | null;
  score: number | null;
  delta: number | null;
  newBuyers: number | null;
  flags: { text: string; tone: "warn" | "info" }[];
};

const DAY = 86_400_000;

function dateOf(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function loadCards(
  sb: ReturnType<typeof useAppState>["sb"],
  brands: Brand[],
): Promise<Card[]> {
  const ids = brands.map((b) => b.id);
  const [runsRes, promptsRes, radarRes] = await Promise.all([
    sb
      .from("geo_runs")
      .select("id,brand_id,label,run_date,created_at,is_current,method,score")
      .in("brand_id", ids),
    sb.from("geo_prompts").select("id,brand_id,text,active").in("brand_id", ids),
    sb.from("geo_radar_items").select("brand_id").in("brand_id", ids).eq("status", "new"),
  ]);
  const runs = (runsRes.data || []) as Run[];
  const prompts = (promptsRes.data || []) as Prompt[];
  const newIdeas = new Map<string, number>();
  for (const r of (radarRes.data || []) as { brand_id: string }[]) {
    newIdeas.set(r.brand_id, (newIdeas.get(r.brand_id) || 0) + 1);
  }

  const byDate = (a: Run, b: Run) =>
    a.run_date.localeCompare(b.run_date) || a.created_at.localeCompare(b.created_at);
  const pairs = brands.map((b) => {
    const mine = runs.filter((r) => r.brand_id === b.id).sort(byDate);
    const current = mine.find((r) => r.is_current) || mine[mine.length - 1] || null;
    const prev = current
      ? [...mine]
          .filter(
            (r) =>
              r.id !== current.id &&
              (r.method ?? null) === (current.method ?? null) &&
              byDate(r, current) <= 0,
          )
          .pop() || null
      : null;
    return { b, current, prev };
  });

  // One query per run keeps each well under the API's row limit.
  const runIds = pairs.flatMap((p) => [p.current?.id, p.prev?.id]).filter(Boolean) as string[];
  const answers = new Map<string, Row[]>();
  const failed = new Map<string, number>();
  await Promise.all([
    ...runIds.map(async (id) => {
      const { data } = await sb
        .from("geo_responses")
        .select(SCORE_COLUMNS + ",prompt_id")
        .eq("run_id", id);
      answers.set(id, measuredOnly((data || []) as unknown as Row[]));
    }),
    (async () => {
      const cur = pairs.map((p) => p.current?.id).filter(Boolean) as string[];
      if (!cur.length) return;
      const { data } = await sb
        .from("geo_measure_jobs")
        .select("run_id")
        .in("run_id", cur)
        .eq("status", "failed");
      for (const j of (data || []) as { run_id: string }[]) {
        failed.set(j.run_id, (failed.get(j.run_id) || 0) + 1);
      }
    })(),
  ]);

  return pairs.map(({ b, current, prev }) => {
    const rows = current ? answers.get(current.id) || [] : [];
    const prevRows = prev ? answers.get(prev.id) || [] : [];
    const score = rows.length ? r1(computeAll(b, rows).blended.geo) : null;
    const prevScore = prevRows.length ? r1(computeAll(b, prevRows).blended.geo) : null;
    const reach = rows.length
      ? reachSplit(b, prompts.filter((p) => p.brand_id === b.id), rows as unknown as Response[])
      : null;

    const flags: Card["flags"] = [];
    if (!current) flags.push({ text: "No monthly check yet", tone: "warn" });
    else if (Date.now() - new Date(current.run_date).getTime() > 40 * DAY) {
      flags.push({ text: "Last check over a month ago", tone: "warn" });
    }
    const nFailed = current ? failed.get(current.id) || 0 : 0;
    if (nFailed) flags.push({ text: `${nFailed} measurements failed`, tone: "warn" });
    if (!prompts.some((p) => p.brand_id === b.id && p.active)) {
      flags.push({ text: "No questions tracked", tone: "warn" });
    }
    if (!factSheetFilled(b.fact_sheet)) flags.push({ text: "Fact sheet empty", tone: "warn" });
    const ideas = newIdeas.get(b.id) || 0;
    if (ideas) flags.push({ text: `${ideas} new Radar idea${ideas === 1 ? "" : "s"}`, tone: "info" });

    return {
      brand: b,
      current,
      score,
      delta: score != null && prevScore != null ? r1(score - prevScore) : null,
      newBuyers: reach && reach.newBuyers.answers ? reach.newBuyers.pct : null,
      flags,
    };
  });
}

export default function ClientsView() {
  const { sb, brands, brand, selectBrand, setView } = useAppState();
  const [cards, setCards] = useState<{ key: string; list: Card[] } | null>(null);
  const key = brands.map((b) => b.id + (b.fact_sheet ? JSON.stringify(b.fact_sheet).length : 0)).join(",");

  useEffect(() => {
    let off = false;
    loadCards(sb, brands).then((list) => {
      if (!off) setCards({ key, list });
    });
    return () => {
      off = true;
    };
  }, [sb, brands, key]);

  async function open(b: Brand) {
    if (b.id !== brand?.id) await selectBrand(b.id);
    setView("overview");
  }

  const list = cards?.key === key ? cards.list : null;
  const groups: [string, Card[]][] = list
    ? [
        ["Clients", list.filter((c) => c.brand.is_client)],
        ["Other brands", list.filter((c) => !c.brand.is_client)],
      ]
    : [];

  return (
    <>
      {!list && <div className="card muted">Loading clients…</div>}
      {groups
        .filter(([, cs]) => cs.length)
        .map(([title, cs]) => (
          <section key={title} style={{ marginBottom: 20 }}>
            <h3 className="clients-group">{title}</h3>
            <div className="client-grid">
              {cs.map((c) => (
                <button
                  key={c.brand.id}
                  type="button"
                  className={`card client-card${c.brand.id === brand?.id ? " current" : ""}`}
                  onClick={() => open(c.brand)}
                >
                  <div className="cc-head">
                    <ClientBadge brand={c.brand} size={40} />
                    <div>
                      <div className="cc-name">{c.brand.name}</div>
                      <div className="muted cc-sector">{c.brand.sector || ""}</div>
                    </div>
                  </div>
                  <div className="cc-stats">
                    <div>
                      <div className="cc-num">{c.score ?? "–"}</div>
                      <div className="cc-lbl">
                        GEO score{" "}
                        {c.delta != null && c.delta !== 0 && (
                          <b style={{ color: c.delta > 0 ? "var(--green)" : "var(--red)" }}>
                            {c.delta > 0 ? "▲ +" : "▼ "}
                            {c.delta}
                          </b>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="cc-num">{c.newBuyers != null ? c.newBuyers + "%" : "–"}</div>
                      <div className="cc-lbl">Found by new buyers</div>
                    </div>
                  </div>
                  <div className="muted cc-check">
                    {c.current ? `Last check ${dateOf(c.current.run_date)}` : "Not measured yet"}
                  </div>
                  {c.flags.length > 0 && (
                    <div className="cc-flags">
                      {c.flags.map((f) => (
                        <span key={f.text} className={`cc-flag ${f.tone}`}>
                          {f.text}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      {list && (
        <button type="button" className="btn sm ghost" onClick={() => setView("admin")}>
          + Add a client
        </button>
      )}
    </>
  );
}
