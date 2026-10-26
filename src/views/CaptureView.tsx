"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
import type { MeasureJob, Response } from "@/lib/types";

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
    sb,
    toast,
    reload,
    patchResponse,
  } = useAppState();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ev, setEv] = useState<
    Record<string, { evidence: string; cited_sources: string; cited_pr_id: string }>
  >({});
  const [jobs, setJobs] = useState<MeasureJob[]>([]);
  const [pollKey, setPollKey] = useState(0);
  const runId = data.currentRun?.id;

  // Follow this run's queued measurements: poll while any are waiting or in
  // flight, and reload results each time more of them finish.
  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    let lastFinished = -1;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const { data: rows } = await sb
        .from("geo_measure_jobs")
        .select("*")
        .eq("run_id", runId);
      if (stopped) return;
      const list = (rows || []) as MeasureJob[];
      setJobs(list);
      const finished = list.filter((j) => j.status === "done").length;
      if (lastFinished >= 0 && finished !== lastFinished) await reload();
      lastFinished = finished;
      if (!stopped && list.some((j) => j.status === "pending" || j.status === "sent")) {
        timer = setTimeout(tick, 8000);
      }
    };
    timer = setTimeout(tick, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [sb, runId, reload, pollKey]);

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

  async function startSnapshot() {
    const { error } = await sb.rpc("geo_start_snapshot", {
      bid: brand!.id,
      p_samples: samples,
    });
    if (error) return toast("Snapshot failed: " + error.message);
    toast("Snapshot started — results arrive over the next 10–20 minutes");
    await reload();
    setPollKey((k) => k + 1);
  }

  async function autoRun() {
    if (mode !== "team") return;
    if (!data.prompts.some((p) => p.active)) return toast("No active prompts to run");
    if (!data.currentRun) return toast("No current run for this brand");
    if (data.currentRun.method !== "v2") {
      // Never mix methods inside one run: start a new-method run instead.
      if (
        window.confirm(
          "This run used the old measurement method, so new results can't be added to " +
            "it. Start a new snapshot with the new method instead? Uses your AI credit.",
        )
      )
        await startSnapshot();
      return;
    }
    if (
      !window.confirm(
        "Re-measure every active prompt on every live AI engine, " +
          samples +
          " samples each? Results update here as they come in (usually 10–20 minutes). " +
          "Uses your AI credit.",
      )
    )
      return;
    const { data: n, error } = await sb.rpc("geo_enqueue_run", {
      rid: data.currentRun.id,
      p_samples: samples,
    });
    if (error) return toast("Auto-run failed: " + error.message);
    toast(n ? n + " measurements queued" : "Already measuring — nothing new queued");
    setPollKey((k) => k + 1);
  }

  async function newSnapshot() {
    if (mode !== "team") return;
    if (
      !window.confirm(
        "Create a fresh monthly snapshot for " +
          brand!.name +
          "? This starts a new run and measures all active prompts on every live AI " +
          "engine. Uses your AI credit.",
      )
    )
      return;
    await startSnapshot();
  }

  const jobCount = (st: string) => jobs.filter((j) => j.status === st).length;
  const inFlight = jobCount("pending") + jobCount("sent");
  const failed = jobs.filter((j) => j.status === "failed");
  const skippedEngines = [
    ...new Set(jobs.filter((j) => j.status === "skipped").map((j) => j.engine)),
  ];

  return (
    <>
      <div className="sec-title">Response Capture — {brand.name}</div>
      <div className="sec-sub">
        Edit any cell to recalculate the score live. Click ▸ to see the evidence behind
        each rating. {rows.length} responses · {data.currentRun?.label || ""}.
      </div>
      {!ro && (
        <div style={{ marginBottom: 12 }}>
          <button className="btn sm" onClick={autoRun} disabled={inFlight > 0}>
            ⚡ Auto-run live engines
          </button>{" "}
          <button className="btn sm ghost" onClick={newSnapshot} disabled={inFlight > 0}>
            📸 New snapshot
          </button>{" "}
          <span className="muted" style={{ fontSize: 12 }}>
            Asks every <b>live</b> engine each active prompt {samples}× with live web
            search, and records a confidence rating. Auto-run re-measures this run; New
            snapshot starts a fresh monthly run. Uses your AI credit.
          </span>
        </div>
      )}
      {jobs.length > 0 && (
        <div className="legend-note" style={{ margin: "0 0 12px" }}>
          {inFlight > 0 ? (
            <>
              ⏳ Measuring: <b>{jobs.length - inFlight}</b> of {jobs.length} done — results
              appear below as they arrive.
            </>
          ) : (
            <>
              ✅ Measured {jobCount("done")} prompt × engine combinations for this run.
            </>
          )}
          {skippedEngines.length > 0 && (
            <> Skipped (no API key): {skippedEngines.join(", ")}.</>
          )}
          {failed.length > 0 && (
            <>
              {" "}
              <b style={{ color: "var(--red)" }}>{failed.length} failed</b>
              {inFlight === 0 && (
                <>
                  {" "}
                  — e.g. {failed[0].engine}: {failed[0].error || "no result"}
                </>
              )}
            </>
          )}
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
                          {r.method === "v2" && (
                            <div className="legend-note" style={{ margin: "0 0 6px" }}>
                              Measurement v2 · {r.model || "—"} ·{" "}
                              {r.web_search ? (
                                <span className="tag t-yes">live web search</span>
                              ) : (
                                <span className="tag t-na">no web search</span>
                              )}
                            </div>
                          )}
                          <b>Evidence — why this is scored this way:</b>
                          <div className="evidence" style={{ margin: "6px 0" }}>
                            {r.evidence || "(No evidence captured yet.)"}
                          </div>
                          {r.answer && (
                            <details style={{ margin: "6px 0" }}>
                              <summary style={{ cursor: "pointer", fontSize: 12 }}>
                                Full AI answer
                              </summary>
                              <div
                                className="evidence"
                                style={{ whiteSpace: "pre-wrap", marginTop: 6 }}
                              >
                                {r.answer}
                              </div>
                            </details>
                          )}
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
            No responses yet. Click <b>📸 New snapshot</b> to measure this client
            automatically, or <b>Settings → Generate capture grid</b> to enter answers by
            hand.
          </span>
        )}
      </div>
    </>
  );
}
