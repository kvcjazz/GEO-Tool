"use client";

import { Fragment, useMemo, useState } from "react";
import { useAppState } from "@/state/AppState";
import {
  ACC_OPTS,
  CITE_OPTS,
  ENGINES,
  PROM_OPTS,
  SENT_OPTS,
} from "@/lib/constants";
import { computeAll } from "@/lib/scoring";
import { r1 } from "@/lib/format";
import { callFn } from "@/lib/callFn";
import { RunBatchResponseSchema, RunResponseSchema } from "@/lib/schemas";
import type { Response } from "@/lib/types";

function Dd({
  value,
  opts,
  na,
  onChange,
}: {
  value: string | null;
  opts: string[];
  na?: boolean;
  onChange: (v: string) => void;
}) {
  const list = na ? ["—", ...opts] : opts;
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      {list.map((x) => (
        <option key={x} value={x === "—" ? "" : x}>
          {x}
        </option>
      ))}
    </select>
  );
}

export default function CaptureView() {
  const {
    brand,
    data,
    mode,
    samples,
    engines,
    sb,
    toast,
    reload,
    setView,
    patchResponse,
  } = useAppState();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ev, setEv] = useState<
    Record<string, { evidence: string; cited_sources: string; cited_pr_id: string }>
  >({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const byP = useMemo(() => {
    const m: Record<string, (typeof data.prompts)[number]> = {};
    data.prompts.forEach((p) => (m[p.id] = p));
    return m;
  }, [data.prompts]);

  const rows = useMemo(() => {
    return [...data.responses].sort((a, b) => {
      const pa = byP[a.prompt_id]?.sort ?? 0;
      const pb = byP[b.prompt_id]?.sort ?? 0;
      return pa !== pb
        ? pa - pb
        : ENGINES.indexOf(a.engine as (typeof ENGINES)[number]) -
            ENGINES.indexOf(b.engine as (typeof ENGINES)[number]);
    });
  }, [data.responses, byP]);

  if (!brand) return null;
  const ro = mode === "client";

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setEv((prev) => {
      if (prev[id]) return prev;
      const r = data.responses.find((x) => x.id === id);
      return {
        ...prev,
        [id]: {
          evidence: r?.evidence || "",
          cited_sources: r?.cited_sources || "",
          cited_pr_id: r?.cited_pr_id || "",
        },
      };
    });
  }

  async function onCellEdit(id: string, field: keyof Response, raw: string) {
    let v: string | number | boolean | null = raw;
    if (field === "mentioned") v = raw === "true";
    else if (field === "competitor_mentions") v = +raw;
    else if (raw === "") v = null;
    patchResponse(id, { [field]: v } as Partial<Response>);
    const { error } = await sb
      .from("geo_responses")
      .update({ [field]: v } as Partial<Response>)
      .eq("id", id);
    if (error) {
      toast("Save failed");
      return;
    }
    const updated = data.responses.map((r) =>
      r.id === id ? { ...r, [field]: v } : r,
    );
    const { blended } = computeAll(brand!, updated as Response[]);
    toast("Saved · GEO now " + r1(blended.geo));
  }

  async function saveEvidence(id: string) {
    const e = ev[id];
    if (!e) return;
    const attr = e.cited_pr_id || null;
    const { error } = await sb
      .from("geo_responses")
      .update({ evidence: e.evidence, cited_sources: e.cited_sources, cited_pr_id: attr })
      .eq("id", id);
    patchResponse(id, {
      evidence: e.evidence,
      cited_sources: e.cited_sources,
      cited_pr_id: attr,
    });
    toast(error ? "Save failed" : "Saved");
  }

  function liveEngines() {
    return ENGINES.filter((en) => engines[en]);
  }

  async function autoRun() {
    if (mode !== "team") return;
    const active = data.prompts.filter((p) => p.active);
    if (!active.length) return toast("No active prompts to run");
    if (!data.currentRun) return toast("No current run for this brand");
    const engs = liveEngines();
    if (!engs.length) return toast("No live engines — add an API key in Settings");
    const off = ENGINES.filter((en) => !engines[en]);
    const total = active.length * engs.length;
    if (
      !window.confirm(
        (off.length
          ? `Only ${engs.length} of ${ENGINES.length} engines are live — ` +
            `${off.join(", ")} will be skipped (add their keys in Settings).\n\n`
          : "") +
          "Auto-run " +
          engs.join(", ") +
          " across " +
          active.length +
          " prompts, " +
          samples +
          " samples each (for confidence)? That's " +
          total +
          " measurements and uses your AI credit.",
      )
    )
      return;
    setBusy(true);
    let done = 0;
    const failures: string[] = [];
    for (const p of active) {
      for (const eng of engs) {
        done++;
        setProgress(`⚡ ${done}/${total}…`);
        try {
          const j = await callFn(
            "geo-run",
            {
              engine: eng,
              prompt: p.text,
              brand: brand!.name,
              competitors: data.competitors.map((c) => c.name),
              samples,
            },
            RunResponseSchema,
          );
          if (!j.ok) {
            // A dead model id or a rejected key used to be indistinguishable
            // from "engine not live" — show the provider's own reason.
            const why = j.detail || j.error || "run failed";
            if (j.error !== "no_key") toast(eng + ": " + why);
            failures.push(eng + ": " + why);
            continue;
          }
          const o = j.result!;
          const row = {
            mentioned: !!o.mentioned,
            prominence: o.prominence || "Absent",
            sentiment: o.sentiment || null,
            accuracy: o.accuracy || null,
            cited: o.cited || "n/a",
            competitor_mentions: +(o.competitor_mentions || 0),
            evidence: o.evidence || null,
            cited_sources: o.cited_sources || null,
            samples: o.samples || samples,
            mention_rate: o.mention_rate != null ? o.mention_rate : null,
            confidence: o.confidence || null,
          };
          const exRow = data.responses.find(
            (r) => r.prompt_id === p.id && r.engine === eng,
          );
          if (exRow) {
            await sb.from("geo_responses").update(row).eq("id", exRow.id);
          } else {
            await sb
              .from("geo_responses")
              .insert({ run_id: data.currentRun!.id, prompt_id: p.id, engine: eng, ...row });
          }
        } catch (e) {
          toast("Error: " + String(e));
          failures.push(eng + ": " + String(e));
        }
      }
    }
    setBusy(false);
    setProgress("");
    const failed = [...new Set(failures.map((f) => f.split(":")[0]))];
    toast(
      failed.length
        ? `Auto-run complete — ${failed.join(", ")} returned nothing (see Settings)`
        : "Auto-run complete across " + engs.join(", "),
    );
    await reload();
    setView("capture");
  }

  async function newSnapshot() {
    if (mode !== "team") return;
    if (
      !window.confirm(
        "Create a fresh monthly snapshot for " +
          brand!.name +
          "? This starts a new run and re-measures all active prompts across live engines. Uses your AI credit.",
      )
    )
      return;
    setBusy(true);
    setProgress("📸 Capturing…");
    try {
      const j = await callFn(
        "geo-run-batch",
        { brand_id: brand!.id, samples },
        RunBatchResponseSchema,
      );
      if (j.ok) {
        const failed = j.failed_engines || [];
        toast(
          "Snapshot " +
            (j.label || "") +
            ": " +
            j.responses +
            " measurements across " +
            (j.engines || []).join(", ") +
            (failed.length ? ` — no results from ${failed.join(", ")}` : ""),
        );
        if (j.errors?.length) console.warn("geo-run-batch errors", j.errors);
      } else {
        toast("Snapshot failed: " + (j.detail || j.error || ""));
      }
      await reload();
      setView("dashboard");
    } catch (e) {
      toast("Snapshot error: " + String(e));
    }
    setBusy(false);
    setProgress("");
  }

  return (
    <>
      <div className="sec-title">Response Capture — {brand.name}</div>
      <div className="sec-sub">
        Edit any cell to recalculate the score live. Click ▸ to see the evidence behind
        each rating. {rows.length} responses · {data.currentRun?.label || ""}.
      </div>
      {!ro && (
        <div style={{ marginBottom: 12 }}>
          <button className="btn sm" onClick={autoRun} disabled={busy}>
            {busy && progress.startsWith("⚡") ? progress : "⚡ Auto-run live engines"}
          </button>{" "}
          <button className="btn sm ghost" onClick={newSnapshot} disabled={busy}>
            {busy && progress.startsWith("📸") ? progress : "📸 New snapshot"}
          </button>{" "}
          <span className="muted" style={{ fontSize: 12 }}>
            Auto-run queries every <b>live</b> engine {samples}× per prompt and records a
            confidence rating. New snapshot starts a fresh monthly run. Uses your AI
            credit.
          </span>
        </div>
      )}
      <div className="card" style={{ overflow: "auto" }}>
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>ID</th>
                <th>Prompt</th>
                <th>Engine</th>
                <th>Mentioned</th>
                <th>Prominence</th>
                <th>Sentiment</th>
                <th>Accuracy</th>
                <th>Cited</th>
                <th>Comp #</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = byP[r.prompt_id];
                const open = expanded.has(r.id);
                const e = ev[r.id] || {
                  evidence: r.evidence || "",
                  cited_sources: r.cited_sources || "",
                  cited_pr_id: r.cited_pr_id || "",
                };
                return (
                  <Fragment key={r.id}>
                    <tr className="main-row">
                      <td>
                        <span className="expander" onClick={() => toggle(r.id)}>
                          {open ? "▾" : "▸"}
                        </span>
                      </td>
                      <td>
                        <span className="badge">{p?.code || ""}</span>
                      </td>
                      <td style={{ minWidth: 140 }}>{p ? p.text : ""}</td>
                      <td>{r.engine}</td>
                      <td>
                        <select
                          value={r.mentioned ? "true" : "false"}
                          onChange={(ev) => onCellEdit(r.id, "mentioned", ev.target.value)}
                        >
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </td>
                      <td>
                        <Dd
                          value={r.prominence}
                          opts={PROM_OPTS}
                          onChange={(v) => onCellEdit(r.id, "prominence", v)}
                        />
                      </td>
                      <td>
                        <Dd
                          value={r.sentiment}
                          opts={SENT_OPTS}
                          na
                          onChange={(v) => onCellEdit(r.id, "sentiment", v)}
                        />
                      </td>
                      <td>
                        <Dd
                          value={r.accuracy}
                          opts={ACC_OPTS}
                          na
                          onChange={(v) => onCellEdit(r.id, "accuracy", v)}
                        />
                      </td>
                      <td>
                        <Dd
                          value={r.cited}
                          opts={CITE_OPTS}
                          onChange={(v) => onCellEdit(r.id, "cited", v)}
                        />
                      </td>
                      <td style={{ width: 58 }}>
                        <select
                          value={String(r.competitor_mentions ?? 0)}
                          onChange={(ev) =>
                            onCellEdit(r.id, "competitor_mentions", ev.target.value)
                          }
                        >
                          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                            <option key={i}>{i}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    {open && (
                      <tr className="detail">
                        <td colSpan={10}>
                          {r.confidence && (
                            <div className="legend-note" style={{ margin: "0 0 6px" }}>
                              Measured over <b>{r.samples || "—"}</b> samples · mention
                              rate{" "}
                              <b>
                                {r.mention_rate != null
                                  ? Math.round(r.mention_rate * 100) + "%"
                                  : "—"}
                              </b>{" "}
                              · confidence{" "}
                              <b
                                style={{
                                  color:
                                    r.confidence === "High"
                                      ? "var(--green)"
                                      : r.confidence === "Low"
                                        ? "var(--red)"
                                        : "var(--amber)",
                                }}
                              >
                                {r.confidence}
                              </b>
                            </div>
                          )}
                          <b>Evidence — why this is scored this way:</b>
                          <div className="evidence" style={{ margin: "6px 0" }}>
                            {r.evidence || "(No evidence captured yet.)"}
                          </div>
                          {!ro && (
                            <>
                              <textarea
                                placeholder="Paste the exact AI quote / mention here"
                                value={e.evidence}
                                onChange={(ev) =>
                                  setEv((prev) => ({
                                    ...prev,
                                    [r.id]: { ...e, evidence: ev.target.value },
                                  }))
                                }
                              />
                              <div
                                className="flex"
                                style={{ marginTop: 6, alignItems: "flex-end" }}
                              >
                                <div style={{ flex: 1 }}>
                                  <label
                                    style={{ fontSize: 11, color: "var(--muted)" }}
                                  >
                                    Cited source domains (comma-separated)
                                  </label>
                                  <input
                                    value={e.cited_sources}
                                    placeholder="e.g. techcrunch.com, g2.com"
                                    style={{ width: "100%" }}
                                    onChange={(ev) =>
                                      setEv((prev) => ({
                                        ...prev,
                                        [r.id]: { ...e, cited_sources: ev.target.value },
                                      }))
                                    }
                                  />
                                </div>
                                <div>
                                  <label
                                    style={{ fontSize: 11, color: "var(--muted)" }}
                                  >
                                    Attribute citation to PR placement
                                  </label>
                                  <br />
                                  <select
                                    value={e.cited_pr_id}
                                    onChange={(ev) =>
                                      setEv((prev) => ({
                                        ...prev,
                                        [r.id]: { ...e, cited_pr_id: ev.target.value },
                                      }))
                                    }
                                  >
                                    <option value="">— none —</option>
                                    {data.pr.map((pp) => (
                                      <option key={pp.id} value={pp.id}>
                                        {pp.outlet}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div style={{ marginTop: 6 }}>
                                <button
                                  className="btn sm"
                                  onClick={() => saveEvidence(r.id)}
                                >
                                  Save evidence &amp; citation
                                </button>
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          <span>
            No capture rows yet. Go to <b>Settings → Generate capture grid</b>.
          </span>
        )}
      </div>
    </>
  );
}
