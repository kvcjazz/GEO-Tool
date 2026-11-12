"use client";

import { Fragment, useEffect, useState } from "react";
import { useAppState } from "@/state/AppState";
import { playbookFor } from "@/lib/playbooks";
import { callFn } from "@/lib/callFn";
import { AdviseTailorSchema } from "@/lib/schemas";
import { buildAdviseBrief } from "@/lib/adviseBrief";
import type { Opportunity } from "@/lib/types";

const STATUS_OPTS = ["Not started", "In progress", "Done", "Parked"];
const SCALE = [1, 2, 3, 4, 5];
const IMPACT_LABEL = ["", "Very low", "Low", "Medium", "High", "Very high"];
const EFFORT_LABEL = ["", "Hours", "A day or two", "About a week", "Weeks", "A month+"];

type Filter = "open" | "done" | "parked" | "all";

/** Impact ÷ effort, shown as a plain priority instead of a decimal. */
function priority(o: Pick<Opportunity, "impact" | "effort">): { score: number; label: "High" | "Medium" | "Low" } {
  const score = o.effort ? o.impact / o.effort : 0;
  return { score, label: score >= 2 ? "High" : score >= 1.3 ? "Medium" : "Low" };
}

const PRIO_CLASS = { High: "prio-hi", Medium: "prio-md", Low: "prio-lo" } as const;

function dueText(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d + "T12:00:00");
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function overdue(o: Opportunity): boolean {
  if (!o.due_date || o.status === "Done" || o.status === "Parked") return false;
  return o.due_date < new Date().toISOString().slice(0, 10);
}

export default function BacklogView() {
  const { brand, data, mode, sb, toast, reload } = useAppState();
  const [opps, setOpps] = useState<Opportunity[]>(data.opps);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [thinking, setThinking] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", linked_gap: "", impact: 3, effort: 2, owner: "", due_date: "" });

  useEffect(() => setOpps(data.opps), [data.opps]);

  if (!brand) return null;
  const ro = mode === "client";

  const sorted = [...opps]
    .map((o) => ({ ...o, prio: priority(o) }))
    .sort((a, b) => b.prio.score - a.prio.score);

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  /** Saves a change to one action; puts it back if the database refuses. */
  async function patch(id: string, p: Partial<Opportunity>, msg = "Saved") {
    const before = opps.find((o) => o.id === id);
    setOpps((prev) => prev.map((o) => (o.id === id ? { ...o, ...p } : o)));
    const { data: rows, error } = await sb.from("geo_opportunities").update(p).eq("id", id).select("id");
    if (error || !rows?.length) {
      if (before) setOpps((prev) => prev.map((o) => (o.id === id ? before : o)));
      return toast("Not saved: " + (error?.message || "your account can't edit this client"));
    }
    toast(msg);
  }

  async function addAction() {
    const title = form.title.trim();
    if (!title) return toast("Give the action a title");
    const { error } = await sb.from("geo_opportunities").insert({
      brand_id: brand!.id,
      title,
      linked_gap: form.linked_gap.trim() || null,
      impact: form.impact,
      effort: form.effort,
      owner: form.owner.trim() || null,
      due_date: form.due_date || null,
      status: "Not started",
      sort: opps.length + 1,
    });
    if (error) return toast("Not added: " + error.message);
    setForm({ title: "", linked_gap: "", impact: 3, effort: 2, owner: "", due_date: "" });
    setAdding(false);
    toast("Action added");
    await reload();
  }

  async function removeAction(o: Opportunity) {
    if (!window.confirm(`Delete the action “${o.title}”? Choose Cancel and set it to Parked to keep it on file.`)) return;
    const { error } = await sb.from("geo_opportunities").delete().eq("id", o.id);
    if (error) return toast("Not deleted: " + error.message);
    toast("Action deleted");
    await reload();
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
          brief: buildAdviseBrief(brand!, data),
          opportunity: o.title,
          gap: o.linked_gap,
          playbook: pb.title,
          steps: pb.steps,
        },
        AdviseTailorSchema,
      );
      const aiOk = j.source === "ai" && !!j.guidance;
      // A template fallback is shown with the reason but not saved, so it never
      // passes for real tailored advice.
      const text = aiOk
        ? j.guidance!
        : (j.error ? "⚠ " + j.error + "\n\n" : "") + (j.guidance || "No guidance returned.");
      setOpps((prev) => prev.map((x) => (x.id === id ? { ...x, ai_guidance: text } : x)));
      if (aiOk) await sb.from("geo_opportunities").update({ ai_guidance: text }).eq("id", id);
    } catch (e) {
      setOpps((prev) =>
        prev.map((x) =>
          x.id === id ? { ...x, ai_guidance: "AI tailoring unavailable right now: " + String(e) } : x,
        ),
      );
    }
    setThinking(null);
  }

  // ---- Client view: what we're doing, in plain terms --------------------------
  if (ro) {
    const groups: { label: string; items: typeof sorted }[] = [
      { label: "In progress", items: sorted.filter((o) => o.status === "In progress") },
      { label: "Coming up", items: sorted.filter((o) => !o.status || o.status === "Not started") },
      { label: "Done", items: sorted.filter((o) => o.status === "Done") },
    ];
    return (
      <div className="two" style={{ alignItems: "start" }}>
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <div className="card" key={g.label}>
              <h3>
                {g.label} ({g.items.length})
              </h3>
              {g.items.map((o) => (
                <div className="action-item" key={o.id} id={"action-" + o.id}>
                  <b>{o.title}</b>
                  {(o.owner || o.due_date) && (
                    <span className="d">
                      {o.owner ? `Led by ${o.owner}` : ""}
                      {o.owner && o.due_date ? " · " : ""}
                      {o.due_date ? `${g.label === "Done" ? "Due" : "Target"} ${dueText(o.due_date)}` : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        {!sorted.length && <div className="card muted">No actions in the plan yet.</div>}
      </div>
    );
  }

  // ---- Team view --------------------------------------------------------------
  const counts = {
    open: sorted.filter((o) => o.status !== "Done" && o.status !== "Parked").length,
    done: sorted.filter((o) => o.status === "Done").length,
    parked: sorted.filter((o) => o.status === "Parked").length,
    all: sorted.length,
  };
  const shown = sorted.filter((o) =>
    filter === "all"
      ? true
      : filter === "done"
        ? o.status === "Done"
        : filter === "parked"
          ? o.status === "Parked"
          : o.status !== "Done" && o.status !== "Parked",
  );

  return (
    <>
      <div className="flex" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div className="flex" style={{ gap: 6 }} role="group" aria-label="Show">
          {(
            [
              ["open", "Open"],
              ["done", "Done"],
              ["parked", "Parked"],
              ["all", "All"],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              className={`btn sm${filter === id ? "" : " ghost"}`}
              onClick={() => setFilter(id)}
            >
              {label} ({counts[id]})
            </button>
          ))}
        </div>
        <button type="button" className="btn sm" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
          {adding ? "Cancel" : "+ Add an action"}
        </button>
      </div>

      {adding && (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <h3>New action</h3>
          <div className="set-grid">
            <div style={{ gridColumn: "1/-1" }}>
              <label htmlFor="na-title">What we&#39;ll do</label>
              <input
                id="na-title"
                value={form.title}
                placeholder="e.g. Pitch a data story on switching costs to the FT's Money section"
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label htmlFor="na-gap">What it should move (optional)</label>
              <input
                id="na-gap"
                value={form.linked_gap}
                placeholder="e.g. Named in ChatGPT answers to “best … for small businesses”"
                onChange={(e) => setForm({ ...form, linked_gap: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="na-impact">Impact</label>
              <select id="na-impact" value={form.impact} onChange={(e) => setForm({ ...form, impact: +e.target.value })}>
                {SCALE.map((n) => (
                  <option key={n} value={n}>
                    {n} — {IMPACT_LABEL[n]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="na-effort">Effort</label>
              <select id="na-effort" value={form.effort} onChange={(e) => setForm({ ...form, effort: +e.target.value })}>
                {SCALE.map((n) => (
                  <option key={n} value={n}>
                    {n} — {EFFORT_LABEL[n]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="na-owner">Owner</label>
              <input id="na-owner" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            </div>
            <div>
              <label htmlFor="na-due">Due</label>
              <input
                id="na-due"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <button type="button" className="btn sm" onClick={addAction}>
              Add to the plan
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ overflow: "auto" }}>
        <table style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>Priority</th>
              <th>Action</th>
              <th>Owner</th>
              <th>Due</th>
              <th>Status</th>
              <th aria-label="Details"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => {
              const pb = playbookFor(o);
              const open = expanded.has(o.id);
              return (
                <Fragment key={o.id}>
                  <tr className="main-row" id={"action-" + o.id}>
                    <td>
                      <span className={PRIO_CLASS[o.prio.label]} title={`Impact ${o.impact} ÷ effort ${o.effort}`}>
                        {o.prio.label}
                      </span>
                    </td>
                    <td style={{ minWidth: 260 }}>
                      {editing === o.id ? (
                        <input
                          autoFocus
                          defaultValue={o.title}
                          aria-label="Action title"
                          onBlur={(e) => {
                            setEditing(null);
                            const t = e.target.value.trim();
                            if (t && t !== o.title) void patch(o.id, { title: t }, "Action renamed");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="inline-edit"
                          title="Click to rename"
                          onClick={() => setEditing(o.id)}
                        >
                          {o.title}
                        </button>
                      )}
                      {o.linked_gap && <div className="muted" style={{ fontSize: 12 }}>Moves: {o.linked_gap}</div>}
                    </td>
                    <td>
                      <input
                        defaultValue={o.owner || ""}
                        placeholder="Who"
                        aria-label="Owner"
                        style={{ width: 110 }}
                        onBlur={(e) => {
                          const v = e.target.value.trim() || null;
                          if (v !== (o.owner || null)) void patch(o.id, { owner: v }, "Owner saved");
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={o.due_date || ""}
                        aria-label="Due date"
                        className={overdue(o) ? "overdue" : ""}
                        title={overdue(o) ? "Overdue" : undefined}
                        style={{ width: 140 }}
                        onChange={(e) => void patch(o.id, { due_date: e.target.value || null }, "Due date saved")}
                      />
                    </td>
                    <td>
                      <select
                        value={o.status || "Not started"}
                        aria-label="Status"
                        onChange={(e) => void patch(o.id, { status: e.target.value }, "Status updated")}
                      >
                        {STATUS_OPTS.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="expander"
                        aria-expanded={open}
                        aria-label={open ? "Hide details" : "Show details"}
                        onClick={() => toggle(o.id)}
                      >
                        {open ? "▾" : "▸"}
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="detail">
                      <td colSpan={6}>
                        <div className="flex" style={{ gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
                          <label className="flex" style={{ gap: 6, fontWeight: 500 }}>
                            Impact
                            <select
                              value={o.impact}
                              onChange={(e) => void patch(o.id, { impact: +e.target.value }, "Impact saved")}
                            >
                              {SCALE.map((n) => (
                                <option key={n} value={n}>
                                  {n} — {IMPACT_LABEL[n]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex" style={{ gap: 6, fontWeight: 500 }}>
                            Effort
                            <select
                              value={o.effort}
                              onChange={(e) => void patch(o.id, { effort: +e.target.value }, "Effort saved")}
                            >
                              {SCALE.map((n) => (
                                <option key={n} value={n}>
                                  {n} — {EFFORT_LABEL[n]}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <b>{pb.title} — step by step</b>
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
                        <div className="flex" style={{ gap: 8, marginTop: 10 }}>
                          <button
                            type="button"
                            className="btn sm"
                            disabled={thinking === o.id}
                            onClick={() => tailorAI(o.id)}
                          >
                            {thinking === o.id ? "✨ Thinking…" : "✨ Tailor to this client"}
                          </button>
                          <button type="button" className="btn sm ghost" onClick={() => removeAction(o)}>
                            Delete…
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={6} className="muted">
                  {filter === "open"
                    ? "No open actions. Accept ideas from the Ideas tab, or add one above."
                    : "Nothing here."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
