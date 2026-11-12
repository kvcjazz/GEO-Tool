"use client";

import { Fragment, useState } from "react";
import { useAppState } from "@/state/AppState";
import { winsAndLosses } from "@/lib/competitors";
import { r1 } from "@/lib/format";

// AI answers → Competitors: which buyer questions each other brand wins while
// this client isn't named at all. The questions a competitor wins are the
// clearest briefs for PR and content: the answer already exists, we're just
// not in it.
export default function CompetitorsView() {
  const { brand, data, mode, sb, toast, reload, setView, setAnswersFilter } = useAppState();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  if (!brand) return null;
  const team = mode === "team";

  const { rows, unread } = winsAndLosses(brand, data.responses, data.prompts, data.competitors);
  const ranked = rows.filter((r) => r.lost.length || r.both);
  const list = showAll ? ranked : ranked.slice(0, 12);

  const toggle = (k: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  async function track(name: string) {
    const { error } = await sb.from("geo_competitors").insert({ brand_id: brand!.id, name });
    if (error) return toast("Not added: " + error.message);
    toast(`${name} added to tracked competitors`);
    await reload();
  }

  if (!data.responses.length) {
    return <div className="card muted">No answers in this check yet.</div>;
  }
  if (!ranked.length) {
    return (
      <div className="card">
        <h3>No other brands named yet</h3>
        <p className="sec-sub">
          {unread
            ? `Still reading which brands ${unread} answers name — check back in a few minutes.`
            : `On the questions that don't mention ${brand.name}, the engines haven't named any other brands.`}
        </p>
      </div>
    );
  }

  const lostTotal = new Set(ranked.flatMap((r) => r.lost.map((q) => q.id))).size;

  return (
    <>
      <p className="legend-note" style={{ marginTop: 0 }}>
        On buyer questions that don&#39;t mention {brand.name}, these brands are named by at least
        one engine while {brand.name} is named by none — {lostTotal} question
        {lostTotal === 1 ? "" : "s"} in all. Each lost question is a brief: the engines already
        answer it, {brand.name} just isn&#39;t in the answer.
        {unread > 0 && <> Still reading brands in {unread} answers.</>}
      </p>
      <div className="card" style={{ overflow: "auto" }}>
        <table style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>Brand</th>
              <th style={{ textAlign: "right" }} title="Share of voice on questions that don't name the client">
                Share of voice
              </th>
              <th style={{ textAlign: "right" }}>Questions it wins, {brand.name} absent</th>
              <th style={{ textAlign: "right" }}>Both named</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const isOpen = open.has(r.key);
              return (
                <Fragment key={r.key}>
                  <tr className="main-row">
                    <td>
                      <b>{r.name}</b>{" "}
                      {r.tracked && <span className="tag t-na">tracked</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>{r1(r.share)}%</td>
                    <td style={{ textAlign: "right" }}>
                      <b className={r.lost.length ? "prio-hi" : ""}>{r.lost.length}</b>
                    </td>
                    <td style={{ textAlign: "right" }}>{r.both}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {r.lost.length > 0 && (
                        <button
                          type="button"
                          className="btn sm ghost"
                          aria-expanded={isOpen}
                          onClick={() => toggle(r.key)}
                        >
                          {isOpen ? "Hide questions" : "See questions"}
                        </button>
                      )}{" "}
                      {team && !r.tracked && (
                        <button type="button" className="btn sm ghost" onClick={() => track(r.name)}>
                          Track
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="detail">
                      <td colSpan={5}>
                        <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
                          {r.lost.map((q) => (
                            <li key={q.id} style={{ margin: "4px 0", fontSize: 13 }}>
                              {q.text}{" "}
                              <span className="muted">
                                — {r.name} {q.recommended ? "recommended" : "named"} by {q.engines.join(", ")}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          className="linkbtn"
                          onClick={() => {
                            setAnswersFilter("missed");
                            setView("answers", "answers");
                          }}
                        >
                          Read these answers →
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {ranked.length > 12 && (
          <button type="button" className="linkbtn" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show fewer" : `Show all ${ranked.length} brands`}
          </button>
        )}
      </div>
    </>
  );
}
