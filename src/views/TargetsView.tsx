"use client";

import { useState } from "react";
import { useAppState } from "@/state/AppState";
import { ENGINES } from "@/lib/constants";
import { ctxString } from "@/lib/context";
import { callFn } from "@/lib/callFn";
import { memoryText } from "@/lib/memory";
import { MeasureDirectSchema, TargetsResponseSchema } from "@/lib/schemas";
import { domainOf } from "@/lib/sources";
import {
  TARGET_KIND_LABELS,
  buildCandidates,
  latestTargets,
  outletMatches,
  probeQuestions,
  rawUrls,
  splitDomains,
} from "@/lib/targets";
import type { Candidate, CitedAnswer } from "@/lib/targets";
import type { TargetTitle } from "@/lib/types";

/** Checks whose citations count: the current one and the two before it. */
const RUNS_USED = 3;

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
}

/** Run tasks a few at a time — searched answers are slow, and providers rate-limit. */
async function pool<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const out: T[] = [];
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker));
  return out;
}

export default function TargetsView() {
  const {
    brand,
    data,
    mode,
    sb,
    toast,
    reload,
    engines,
    memory,
    buildFeasibilityMemory,
    mergeTargets,
  } = useAppState();
  const [story, setStory] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [newTitle, setNewTitle] = useState("");
  if (!brand) return null;
  const ro = mode === "client";
  const latest = latestTargets(data.targets);

  const onList = (t: Pick<TargetTitle, "name" | "domain">) =>
    data.media.some(
      (m) =>
        (m.outlet || "").trim().toLowerCase() === t.name.trim().toLowerCase() ||
        (!!t.domain && outletMatches(m.outlet || "", t.domain)),
    );

  /** Cited answers from the last few checks — only ones measured with live web search. */
  async function capturedAnswers(): Promise<CitedAnswer[]> {
    const current = data.currentRun;
    if (!current) return [];
    const earlier = [...data.runs]
      .filter((r) => r.id !== current.id)
      .sort((a, b) => (b.run_date || "").localeCompare(a.run_date || ""))
      .slice(0, RUNS_USED - 1);
    const answers: CitedAnswer[] = data.responses
      .filter((r) => r.web_search)
      .map((r) => ({
        run_id: r.run_id,
        prompt_id: r.prompt_id,
        engine: r.engine,
        mentioned: r.mentioned,
        competitor_mentions: r.competitor_mentions || 0,
        domains: splitDomains(r.cited_sources),
        urls: rawUrls(r.raw),
      }));
    if (earlier.length) {
      const { data: rows } = await sb
        .from("geo_responses")
        .select("run_id,prompt_id,engine,mentioned,competitor_mentions,cited_sources,web_search")
        .in(
          "run_id",
          earlier.map((r) => r.id),
        )
        .eq("web_search", true);
      for (const r of rows || []) {
        answers.push({
          run_id: r.run_id,
          prompt_id: r.prompt_id,
          engine: r.engine,
          mentioned: r.mentioned,
          competitor_mentions: r.competitor_mentions || 0,
          domains: splitDomains(r.cited_sources),
          urls: [],
        });
      }
    }
    return answers.filter((a) => a.domains.length);
  }

  /**
   * First look for a client with no measured answers: put its buyer questions
   * to the live engines with web search on — exactly as geo-measure does for a
   * monthly check — and keep only the sites they cite. Nothing is saved as a
   * measurement.
   */
  async function probe(): Promise<CitedAnswer[] | null> {
    const qs = probeQuestions(data.prompts);
    // Copilot is answered by the same provider as ChatGPT, so it adds nothing here.
    const live = ENGINES.filter((e) => engines[e] && e !== "Copilot");
    if (!qs.length) {
      toast("Add some buyer questions in Client setup first");
      return null;
    }
    if (!live.length) {
      toast("No AI engines are live — check Admin → AI engines");
      return null;
    }
    const total = qs.length * live.length;
    if (
      !window.confirm(
        `${brand!.name} has no measured answers yet, so this first look asks ${qs.length} of its ` +
          `questions to ${live.join(", ")} with live web search (${total} searches, uses AI credit) ` +
          "and uses the sites they cite. Continue?",
      )
    )
      return null;
    let done = 0;
    setProgress(`Searching… 0/${total}`);
    const tasks = qs.flatMap((p) =>
      live.map((engine) => async (): Promise<CitedAnswer | null> => {
        try {
          const j = await callFn(
            "geo-measure",
            {
              engine,
              prompt: p.text,
              brand: brand!.name,
              brand_aliases: brand!.aliases || [],
              website: brand!.website,
              competitors: data.competitors.map((c) => c.name),
              samples: 1,
            },
            MeasureDirectSchema,
          );
          const runs = (j.ok && j.result?.runs) || [];
          const urls = runs.filter((r) => r.searched).flatMap((r) => r.citations || []);
          return urls.length
            ? {
                run_id: "probe",
                prompt_id: p.id,
                engine,
                mentioned: !!j.result?.mentioned,
                competitor_mentions: j.result?.competitor_mentions || 0,
                domains: [...new Set(urls.map(domainOf).filter(Boolean))],
                urls,
              }
            : null;
        } catch {
          return null;
        } finally {
          setProgress(`Searching… ${++done}/${total}`);
        }
      }),
    );
    const found = (await pool(tasks, 4)).filter((a): a is CitedAnswer => !!a);
    if (!found.length) {
      toast("The searches came back without citations — try again later");
      return null;
    }
    return found;
  }

  /** Candidates from an earlier first look, for re-reviewing without searching again. */
  function probeCandidates(): Candidate[] {
    return data.targets
      .filter((t) => t.basis === "probe" && t.citations > 0)
      .sort((a, b) => b.citations - a.citations)
      .map((t) => ({
        key: t.key,
        domain: t.domain,
        name: t.name,
        score: t.citations,
        citations: t.citations,
        gap_citations: t.gap_citations,
        engines: t.engines,
        questions: t.questions,
        question_types: [],
        example_urls: t.example_urls,
        on_list: onList(t),
        tier: null,
        vip: false,
        team_decision: t.team_decision,
        team_note: t.team_note,
        kind_hint: null,
      }));
  }

  async function review(fresh: boolean) {
    if (ro || busy) return;
    setBusy(true);
    try {
      setProgress("Gathering citations…");
      let basis: "captured" | "probe" = "captured";
      let answers = await capturedAnswers();
      let candidates: Candidate[] = [];
      if (answers.length) {
        candidates = buildCandidates({
          brand: brand!,
          answers,
          prompts: data.prompts,
          media: data.media,
          kinds: data.sourceKinds,
          existing: data.targets,
        });
      } else {
        basis = "probe";
        const earlier = fresh ? [] : probeCandidates();
        if (earlier.length) {
          candidates = earlier;
        } else {
          const found = await probe();
          if (!found) return;
          answers = found;
          candidates = buildCandidates({
            brand: brand!,
            answers,
            prompts: data.prompts,
            media: data.media,
            kinds: data.sourceKinds,
            existing: data.targets,
          });
        }
      }
      if (!candidates.length) {
        toast("No cited sites to review yet");
        return;
      }

      setProgress(`Senior-PR review of ${candidates.length} titles…`);
      const mem = memory || (await buildFeasibilityMemory());
      const s = story.trim();
      const j = await callFn(
        "geo-targets",
        {
          brand: brand!.name,
          website: brand!.website,
          sector: brand!.sector,
          region: brand!.pr_region,
          journey: brand!.pr_journey,
          objective: brand!.objective,
          audience: brand!.audience,
          positioning: brand!.positioning,
          themes: brand!.themes,
          persona: brand!.pr_persona,
          pr_objectives: brand!.pr_objectives,
          pr_expectations: brand!.pr_expectations,
          newsworthy: brand!.pr_newsworthy,
          research_budget: brand!.pr_research_budget,
          context: ctxString(data.context),
          competitors: data.competitors.map((c) => c.name),
          story: s || null,
          memory: memoryText(mem),
          basis,
          candidates,
        },
        TargetsResponseSchema,
      );
      if (!j.ok || !j.titles?.length) {
        toast("Review failed: " + (j.detail || j.error || "no titles returned"));
        return;
      }
      const byKey = new Map(candidates.map((c) => [c.key, c]));
      const batch = newId();
      const now = new Date().toISOString();
      const rows = j.titles.flatMap((t) => {
        const c = byKey.get(t.key);
        if (!c) return [];
        return [
          {
            brand_id: brand!.id,
            key: c.key,
            domain: c.domain,
            name: t.name || c.name || c.key,
            kind: t.kind || null,
            verdict: t.verdict,
            priority: t.priority ?? null,
            route: t.route || null,
            angle: t.angle || null,
            reason: t.reason || null,
            needs: t.needs || null,
            known: t.known ?? null,
            citations: c.citations,
            gap_citations: c.gap_citations,
            engines: c.engines,
            questions: c.questions,
            example_urls: c.example_urls,
            basis: c.citations ? basis : null,
            story: s || null,
            batch_id: batch,
            updated_at: now,
          },
        ];
      });
      // The team's calls (team_decision / team_note) aren't sent, so they survive.
      const { data: saved, error } = await sb
        .from("geo_target_titles")
        .upsert(rows, { onConflict: "brand_id,key" })
        .select("*");
      if (error) {
        toast("Couldn't save the review: " + error.message);
        return;
      }
      mergeTargets((saved || []) as TargetTitle[]);
      toast(`${rows.length} titles reviewed`);
    } catch (e) {
      toast("Review error: " + String(e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function setDecision(t: TargetTitle, decision: string | null) {
    const { data: saved, error } = await sb
      .from("geo_target_titles")
      .update({ team_decision: decision })
      .eq("id", t.id)
      .select("*");
    if (error || !saved?.length) return toast("Couldn't save: " + (error?.message || "no access"));
    mergeTargets(saved as TargetTitle[]);
    toast(
      decision === "no_go"
        ? `${t.name} marked no-go — it won't be recommended`
        : decision === "relationship"
          ? `Noted: you have a relationship with ${t.name}`
          : "Cleared",
    );
  }

  async function addToMediaList(name: string, notes?: string | null) {
    const outlet = name.trim();
    if (!outlet) return;
    const { error } = await sb.from("geo_media_targets").insert({
      brand_id: brand!.id,
      outlet,
      tier: "Tier 2",
      vip: false,
      notes: notes || null,
    });
    if (error) return toast("Failed: " + error.message);
    toast(`${outlet} added to the media list`);
    await reload();
  }

  const groups = [
    { id: "realistic", title: "Realistic targets", rows: latest.rows.filter((r) => r.verdict === "realistic") },
    { id: "stretch", title: "Stretch targets", rows: latest.rows.filter((r) => r.verdict === "stretch") },
  ];
  const ruledOut = latest.rows.filter((r) => r.verdict === "not_realistic");

  const evidence = (t: TargetTitle) =>
    t.citations ? (
      <>
        Cited <b>{t.citations}×</b>
        {t.questions > 0 && <> on {t.questions} question{t.questions === 1 ? "" : "s"}</>}
        {t.engines.length > 0 && <> · {t.engines.join(", ")}</>}
        {t.gap_citations > 0 && (
          <div>
            {t.gap_citations}× where a competitor was named and {brand.name} wasn&#39;t
          </div>
        )}
      </>
    ) : (
      <span className="muted">Not cited yet — on the media list</span>
    );

  const titleCell = (t: TargetTitle) => (
    <>
      <b>{t.name}</b>
      {t.domain && (
        <div>
          <a href={`//${t.domain}`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
            {t.domain}
          </a>
        </div>
      )}
      <div style={{ marginTop: 4 }}>
        {t.kind && <span className="tag t-na">{TARGET_KIND_LABELS[t.kind] || t.kind}</span>}{" "}
        {onList(t) ? (
          <span className="tag t-yes">On media list</span>
        ) : (
          <span className="badge">Not on media list</span>
        )}{" "}
        {t.team_decision === "relationship" && <span className="tag t-pos">Relationship</span>}
        {t.team_decision === "no_go" && <span className="tag t-no">No-go</span>}
      </div>
    </>
  );

  const actions = (t: TargetTitle) =>
    ro ? null : (
      <td style={{ textAlign: "right", width: 1, whiteSpace: "nowrap" }}>
        {!onList(t) && (
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => addToMediaList(t.name, t.domain)}
          >
            Add to media list
          </button>
        )}{" "}
        <button
          type="button"
          className="btn sm ghost"
          title="We know people there — the next review treats it as more winnable"
          onClick={() => setDecision(t, t.team_decision === "relationship" ? null : "relationship")}
        >
          {t.team_decision === "relationship" ? "Clear relationship" : "We have a relationship"}
        </button>{" "}
        <button
          type="button"
          className="btn sm ghost"
          title="Never recommend this title for this client"
          onClick={() => setDecision(t, t.team_decision === "no_go" ? null : "no_go")}
        >
          {t.team_decision === "no_go" ? "Clear no-go" : "No-go"}
        </button>
      </td>
    );

  return (
    <>
      {!ro && (
        <div className="card stack" style={{ marginBottom: 16 }}>
          <h3>Which titles should we target?</h3>
          <div className="legend-note" style={{ marginTop: 0 }}>
            Starts from the sites the AI engines actually cite for {brand.name}&#39;s questions,
            not from reach. A senior-PR review then judges which ones are realistically winnable
            with the story you have, and how to win them.
          </div>
          <label>Story to test (optional)</label>
          <textarea
            rows={2}
            value={story}
            placeholder="Leave blank to use the PR profile and strategy context, or test a specific story, e.g. “New survey: 62% of CFOs plan to cut AI spend”"
            onChange={(e) => setStory(e.target.value)}
          />
          <div>
            <button type="button" className="btn sm" disabled={busy} onClick={() => review(false)}>
              {busy ? progress || "Working…" : latest.rows.length ? "✨ Review again" : "✨ Find titles to target"}
            </button>{" "}
            {latest.basis === "probe" && !busy && (
              <button
                type="button"
                className="btn sm ghost"
                title="Ask the engines again instead of reusing the last first-look searches"
                onClick={() => review(true)}
              >
                Search again
              </button>
            )}
          </div>
        </div>
      )}

      {latest.rows.length === 0 ? (
        <div className="card">
          <h3>No titles reviewed yet</h3>
          <p className="muted" style={{ fontSize: 13 }}>
            {ro
              ? "The team hasn't reviewed target titles for this client yet."
              : data.responses.some((r) => r.web_search)
                ? "Run the review above to rank the sites the engines cite."
                : "There are no measured answers yet, so the first review runs a quick set of live AI searches on this client's questions to see which sites the engines cite."}
          </p>
        </div>
      ) : (
        <>
          <div className="legend-note" style={{ marginBottom: 12 }}>
            {latest.basis === "probe" ? (
              <>
                <b>First look</b>, from live AI searches on {brand.name}&#39;s questions. Lower
                confidence: it&#39;s replaced by measured data after the first monthly check.
              </>
            ) : (
              <>Based on the sites cited in {brand.name}&#39;s measured answers (last {RUNS_USED} checks).</>
            )}{" "}
            Judged against{" "}
            {latest.story ? <>the story “{latest.story}”</> : <>the PR profile and strategy context</>}
            {latest.at && <> on {new Date(latest.at).toLocaleDateString("en-GB")}</>}.
          </div>

          {groups.map(
            (g) =>
              g.rows.length > 0 && (
                <div className="card" key={g.id} style={{ marginBottom: 16, overflow: "auto" }}>
                  <h3>
                    {g.title} ({g.rows.length})
                  </h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Why it matters</th>
                        <th>How to win it</th>
                        <th>Senior-PR view</th>
                        {!ro && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((t) => (
                        <tr key={t.id}>
                          <td>{titleCell(t)}</td>
                          <td style={{ fontSize: 12 }}>{evidence(t)}</td>
                          <td style={{ fontSize: 13 }}>
                            {t.route && <b>{t.route}</b>}
                            {t.angle && <div>{t.angle}</div>}
                          </td>
                          <td style={{ fontSize: 13 }}>
                            {t.reason}
                            {t.needs && (
                              <div className="muted" style={{ marginTop: 4 }}>
                                Needs: {t.needs}
                              </div>
                            )}
                            {t.known === false && (
                              <div className="muted" style={{ marginTop: 4 }}>
                                ⚠ The AI doesn&#39;t know this title well — check before pitching.
                              </div>
                            )}
                          </td>
                          {actions(t)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ),
          )}

          {ruledOut.length > 0 && (
            <details className="card" style={{ marginBottom: 16 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                Ruled out ({ruledOut.length}) — cited, but not realistic for this client
              </summary>
              <table style={{ marginTop: 8 }}>
                <tbody>
                  {ruledOut.map((t) => (
                    <tr key={t.id}>
                      <td>{titleCell(t)}</td>
                      <td style={{ fontSize: 12 }}>{evidence(t)}</td>
                      <td style={{ fontSize: 13 }}>{t.reason}</td>
                      {actions(t)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}

      {!ro && (
        <div className="card stack">
          <h3>Add a title</h3>
          <div className="legend-note" style={{ marginTop: 0 }}>
            Know a title that should be on the list? Add it to {brand.name}&#39;s media list. The
            next review will judge it too, and the Radar will aim ideas at it.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newTitle}
              placeholder="e.g. Computer Weekly"
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <button
              type="button"
              className="btn sm"
              onClick={async () => {
                await addToMediaList(newTitle);
                setNewTitle("");
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </>
  );
}
