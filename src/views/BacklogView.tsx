"use client";

import { Fragment, useEffect, useState } from "react";
import { useAppState } from "@/state/AppState";
import { StrategyBanner } from "@/components/ui";
import { playbookFor } from "@/lib/playbooks";
import { callFn } from "@/lib/callFn";
import { AdviseTailorSchema } from "@/lib/schemas";
import { ctxString } from "@/lib/context";
import type { Opportunity } from "@/lib/types";

const STATUS_OPTS = ["Not started", "In progress", "Done", "Parked"];

export default function BacklogView() {
  const { brand, data, mode, sb, toast } = useAppState();
  const [opps, setOpps] = useState<Opportunity[]>(data.opps);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [thinking, setThinking] = useState<string | null>(null);

  useEffect(() => setOpps(data.opps), [data.opps]);

  if (!brand) return null;
  const ro = mode === "client";

  const sorted = [...opps]
    .map((o) => ({ ...o, prio: o.effort ? o.impact / o.effort : 0 }))
    .sort((a, b) => b.prio - a.prio);

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function setStatus(id: string, status: string) {
    const { error } = await sb.from("geo_opportunities").update({ status }).eq("id", id);
    setOpps((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    toast(error ? "Save failed" : "Status updated");
  }

  async function tailorAI(id: string) {
    const o = opps.find((x) => x.id === id);
    if (!o) return;
    const pb = playbookFor(o);
    setThinking(id);
    try {
      const j = await callFn(
        "geo-advise",
        {
          brand: brand!.name,
          website: brand!.website,
          context: ctxString(data.context),
          objective: brand!.objective,
          positioning: brand!.positioning,
          audience: brand!.audience,
          themes: brand!.themes,
          opportunity: o.title,
          gap: o.linked_gap,
          playbook: pb.title,
          steps: pb.steps,
        },
        AdviseTailorSchema,
      );
      const text = j.guidance || j.error || "No guidance returned.";
      setOpps((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ai_guidance: text } : x)),
      );
      if (j.guidance) {
        await sb.from("geo_opportunities").update({ ai_guidance: text }).eq("id", id);
      }
    } catch (e) {
      setOpps((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                ai_guidance:
                  "AI tailoring unavailable: " +
                  String(e) +
                  ". Add an LLM key to enable (see handover note).",
              }
            : x,
        ),
      );
    }
    setThinking(null);
  }

  return (
    <>
      <StrategyBanner />
      <div className="sec-title">Opportunity Backlog — {brand.name}</div>
      <div className="sec-sub">
        Prioritised by impact ÷ effort. Click ▸ for step-by-step execution guidance
        {ro ? "" : "; use ✨ Tailor for AI guidance shaped to this client's strategy"}.
      </div>
      <div className="card" style={{ overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>#</th>
              <th>Opportunity / Action</th>
              <th>Linked gap</th>
              <th>Impact</th>
              <th>Effort</th>
              <th>Priority</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((o, i) => {
              const pc = o.prio >= 2 ? "prio-hi" : o.prio >= 1.3 ? "prio-md" : "prio-lo";
              const pb = playbookFor(o);
              const open = expanded.has(o.id);
              return (
                <Fragment key={o.id}>
                  <tr className="main-row">
                    <td>
                      <span className="expander" onClick={() => toggle(o.id)}>
                        {open ? "▾" : "▸"}
                      </span>
                    </td>
                    <td>
                      <b>{i + 1}</b>
                    </td>
                    <td style={{ minWidth: 210 }}>{o.title}</td>
                    <td className="muted">{o.linked_gap || ""}</td>
                    <td>{o.impact}</td>
                    <td>{o.effort}</td>
                    <td className={pc}>{o.prio.toFixed(2)}</td>
                    <td>
                      {ro ? (
                        <span className="tag t-na">{o.status}</span>
                      ) : (
                        <select
                          value={o.status || "Not started"}
                          onChange={(e) => setStatus(o.id, e.target.value)}
                        >
                          {STATUS_OPTS.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="detail">
                      <td colSpan={8}>
                        <b>{pb.title} — step-by-step</b>
                        <ol className="steps">
                          {pb.steps.map((s, idx) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ol>
                        {o.ai_guidance && (
                          <div className="ai-box">
                            <b>✨ Tailored to {brand!.name}:</b>
                            <br />
                            {o.ai_guidance}
                          </div>
                        )}
                        {!ro && (
                          <button
                            className="btn sm"
                            style={{ marginTop: 10 }}
                            disabled={thinking === o.id}
                            onClick={() => tailorAI(o.id)}
                          >
                            {thinking === o.id ? "✨ Thinking…" : "✨ Tailor to this client"}
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
