"use client";

import { Fragment, useMemo, useState } from "react";
import { useAppState } from "@/state/AppState";
import type { AnswersFilter } from "@/state/AppState";
import {
  ACC_OPTS,
  CITE_OPTS,
  ENGINES,
  PROM_OPTS,
  SENT_OPTS,
} from "@/lib/constants";
import { computeAll } from "@/lib/scoring";
import { r1 } from "@/lib/format";
import { namesBrand } from "@/lib/questions";
import type { Prompt, Response } from "@/lib/types";

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

const engineOrder = (e: string) => ENGINES.indexOf(e as (typeof ENGINES)[number]);

type Group = {
  prompt: Prompt;
  rows: Response[];
  named: number;
  branded: boolean;
};

export default function CaptureView() {
  const { brand, data, mode, sb, toast, patchResponse, jobs, answersFilter, setAnswersFilter } =
    useAppState();
  const [openQ, setOpenQ] = useState<Set<string>>(new Set());
  const [openR, setOpenR] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [ev, setEv] = useState<
    Record<string, { evidence: string; cited_sources: string; cited_pr_id: string }>
  >({});

  // One group per tracked question, in prompt order, engines in display order.
  const groups = useMemo<Group[]>(() => {
    if (!brand) return [];
    const byPrompt: Record<string, Response[]> = {};
    for (const r of data.responses) (byPrompt[r.prompt_id] ||= []).push(r);
    return [...data.prompts]
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .filter((p) => byPrompt[p.id]?.length)
      .map((p) => {
        const rows = byPrompt[p.id].sort((a, b) => engineOrder(a.engine) - engineOrder(b.engine));
        return {
          prompt: p,
          rows,
          named: rows.filter((r) => r.mentioned).length,
          branded: namesBrand(p.text, brand),
        };
      });
  }, [brand, data.prompts, data.responses]);

  if (!brand) return null;
  const ro = mode === "client";
  const canEdit = !ro && editing;

  const shown = groups.filter(
    (g) => answersFilter === "all" || (answersFilter === "branded") === g.branded,
  );
  const chips: [AnswersFilter, string][] = [
    ["all", `All questions (${groups.length})`],
    ["unbranded", `Don't mention ${brand.name} (${groups.filter((g) => !g.branded).length})`],
    ["branded", `Ask about ${brand.name} by name (${groups.filter((g) => g.branded).length})`],
  ];

  const inFlight = jobs.filter((j) => j.status === "pending" || j.status === "sent").length;
  const failed = jobs.filter((j) => j.status === "failed");
  const skipped = [...new Set(jobs.filter((j) => j.status === "skipped").map((j) => j.engine))];

  const toggleSet = (setter: typeof setOpenQ, id: string) =>
    setter((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function openDetail(r: Response) {
    toggleSet(setOpenR, r.id);
    setEv((prev) =>
      prev[r.id]
        ? prev
        : {
            ...prev,
            [r.id]: {
              evidence: r.evidence || "",
              cited_sources: r.cited_sources || "",
              cited_pr_id: r.cited_pr_id || "",
            },
          },
    );
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
    const updated = data.responses.map((r) => (r.id === id ? { ...r, [field]: v } : r));
    const { blended } = computeAll(brand!, updated as Response[]);
    toast("Saved · GEO score now " + r1(blended.geo));
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

  const namedTag = (g: Group) => (
    <span
      className={`tag ${g.named === 0 ? "t-no" : g.named === g.rows.length ? "t-yes" : "t-na"}`}
    >
      {g.named} of {g.rows.length} engines
    </span>
  );

  const ratingCell = (
    r: Response,
    field: "prominence" | "sentiment" | "accuracy" | "cited",
    opts: string[],
    na?: boolean,
  ) =>
    canEdit ? (
      <Dd value={r[field]} opts={opts} na={na} onChange={(v) => onCellEdit(r.id, field, v)} />
    ) : (
      <span>{r[field] || "—"}</span>
    );

  function engineRows(g: Group) {
    return (
      <table style={{ margin: "4px 0 8px" }}>
        <thead>
          <tr>
            <th></th>
            <th>Engine</th>
            <th>Named?</th>
            <th>Prominence</th>
            <th>Sentiment</th>
            <th>Accuracy</th>
            <th title="Did the answer cite the client's own website?">Own site cited</th>
            <th>Competitors</th>
          </tr>
        </thead>
        <tbody>
          {g.rows.map((r) => {
            const open = openR.has(r.id);
            const e = ev[r.id] || {
              evidence: r.evidence || "",
              cited_sources: r.cited_sources || "",
              cited_pr_id: r.cited_pr_id || "",
            };
            return (
              <Fragment key={r.id}>
                <tr className="main-row">
                  <td>
                    <button
                      type="button"
                      className="expander"
                      aria-expanded={open}
                      aria-label={`${open ? "Hide" : "Show"} ${r.engine} answer`}
                      onClick={() => openDetail(r)}
                      style={{ border: 0, background: "transparent", font: "inherit" }}
                    >
                      {open ? "▾" : "▸"}
                    </button>
                  </td>
                  <td>{r.engine}</td>
                  <td>
                    {canEdit ? (
                      <select
                        value={r.mentioned ? "true" : "false"}
                        onChange={(x) => onCellEdit(r.id, "mentioned", x.target.value)}
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    ) : r.mentioned ? (
                      <span className="tag t-yes">Yes</span>
                    ) : (
                      <span className="tag t-no">No</span>
                    )}
                  </td>
                  <td>{ratingCell(r, "prominence", PROM_OPTS)}</td>
                  <td>{ratingCell(r, "sentiment", SENT_OPTS, true)}</td>
                  <td>{ratingCell(r, "accuracy", ACC_OPTS, true)}</td>
                  <td>{ratingCell(r, "cited", CITE_OPTS)}</td>
                  <td style={{ width: 58 }}>
                    {canEdit ? (
                      <select
                        value={String(r.competitor_mentions ?? 0)}
                        onChange={(x) =>
                          onCellEdit(r.id, "competitor_mentions", x.target.value)
                        }
                      >
                        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                          <option key={i}>{i}</option>
                        ))}
                      </select>
                    ) : (
                      r.competitor_mentions ?? 0
                    )}
                  </td>
                </tr>
                {open && (
                  <tr className="detail">
                    <td colSpan={8}>
                      <div className="legend-note" style={{ margin: "0 0 6px" }}>
                        {r.method === "v2" && (
                          <>
                            {r.model || "—"} ·{" "}
                            {r.web_search ? "live web search" : "no web search"} ·{" "}
                          </>
                        )}
                        {r.samples ? `asked ${r.samples}×` : ""}
                        {r.mention_rate != null &&
                          ` · named in ${Math.round(r.mention_rate * 100)}% of samples`}
                        {r.confidence && ` · confidence ${r.confidence}`}
                      </div>
                      <b>Evidence</b>
                      <div className="evidence" style={{ margin: "6px 0" }}>
                        {r.evidence || "(The answer didn't name the client.)"}
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
                      {!canEdit && r.cited_sources && (
                        <div className="legend-note">
                          <b>Sources cited:</b> {r.cited_sources}
                        </div>
                      )}
                      {canEdit && (
                        <>
                          <textarea
                            placeholder="Paste the exact AI quote / mention here"
                            value={e.evidence}
                            onChange={(x) =>
                              setEv((prev) => ({
                                ...prev,
                                [r.id]: { ...e, evidence: x.target.value },
                              }))
                            }
                          />
                          <div className="flex" style={{ marginTop: 6, alignItems: "flex-end" }}>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: 11, color: "var(--muted)" }}>
                                Sources cited (comma-separated sites)
                              </label>
                              <input
                                value={e.cited_sources}
                                placeholder="e.g. techcrunch.com, g2.com"
                                style={{ width: "100%" }}
                                onChange={(x) =>
                                  setEv((prev) => ({
                                    ...prev,
                                    [r.id]: { ...e, cited_sources: x.target.value },
                                  }))
                                }
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: "var(--muted)" }}>
                                Credit this citation to a PR placement
                              </label>
                              <br />
                              <select
                                value={e.cited_pr_id}
                                onChange={(x) =>
                                  setEv((prev) => ({
                                    ...prev,
                                    [r.id]: { ...e, cited_pr_id: x.target.value },
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
                            <button className="btn sm" onClick={() => saveEvidence(r.id)}>
                              Save evidence &amp; credit
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
    );
  }

  return (
    <>
      {jobs.length > 0 && (
        <div className="legend-note" style={{ margin: "0 0 12px" }}>
          {inFlight > 0 ? (
            <>
              ⏳ Measuring: <b>{jobs.length - inFlight}</b> of {jobs.length} done — results
              appear below as they arrive.
            </>
          ) : (
            <>✅ This check measured {jobs.filter((j) => j.status === "done").length} question × engine combinations.</>
          )}
          {skipped.length > 0 && <> Skipped (no API key): {skipped.join(", ")}.</>}
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

      <div
        className="flex"
        style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}
      >
        <div className="flex" role="group" aria-label="Filter questions" style={{ flexWrap: "wrap", gap: 8 }}>
          {chips.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={answersFilter === id}
              className={`btn sm${answersFilter === id ? "" : " ghost"}`}
              onClick={() => setAnswersFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {!ro && groups.length > 0 && (
          <label className="flex" style={{ fontWeight: 500, fontSize: 13, margin: 0, gap: 6 }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={editing}
              onChange={(x) => setEditing(x.target.checked)}
            />
            Review / override ratings
          </label>
        )}
      </div>

      <div className="card" style={{ overflow: "auto" }}>
        {shown.length ? (
          <table>
            <thead>
              <tr>
                <th>Question we track</th>
                <th>Type</th>
                <th>Engines that named {brand.name}</th>
                <th>
                  <span className="sr-only">Answers</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => {
                const open = openQ.has(g.prompt.id);
                return (
                  <Fragment key={g.prompt.id}>
                    <tr className="main-row">
                      <td style={{ fontWeight: 600 }}>{g.prompt.text}</td>
                      <td className="muted">{g.prompt.ptype}</td>
                      <td>{namedTag(g)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className="btn sm ghost"
                          aria-expanded={open}
                          onClick={() => toggleSet(setOpenQ, g.prompt.id)}
                        >
                          {open ? "Hide answers" : "Read answers"}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="detail">
                        <td colSpan={4}>{engineRows(g)}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        ) : groups.length ? (
          <span className="muted">No questions in this filter.</span>
        ) : (
          <span>
            No answers yet. Use <b>Re-measure now</b> above (or <b>Run monthly check</b> on
            Overview) to ask every live engine the tracked questions.
          </span>
        )}
      </div>
      {groups.length > 0 && (
        <p className="legend-note">
          “Read answers” shows each engine&#39;s answer, the sources it cited and how it was
          rated. Turn on <b>Review / override ratings</b> to correct a rating — the score
          updates straight away.
        </p>
      )}
    </>
  );
}
