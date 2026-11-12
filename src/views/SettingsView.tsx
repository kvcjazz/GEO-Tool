"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/state/AppState";
import {
  ENGINES,
  METRIC_KEYS,
  METRIC_LABELS,
  PTYPES,
} from "@/lib/constants";
import { metricWeights, engineWeights } from "@/lib/scoring";
import { stars, todayISO, monthLabel, parseAliases } from "@/lib/format";
import { buildAdviseBrief } from "@/lib/adviseBrief";
import { callFn } from "@/lib/callFn";
import { AdviseSuggestSchema } from "@/lib/schemas";
import { extractFileText } from "@/lib/fileText";
import UsersAdmin from "@/views/UsersAdmin";
import AiSpendPanel from "@/components/AiSpendPanel";
import NewClientWizard from "@/components/NewClientWizard";
import CategoryBrandsPanel from "@/components/CategoryBrandsPanel";
import { setupSteps } from "@/lib/setup";
import { SeoChip } from "@/components/ui";
import {
  demandOf,
  formatDemand,
  normQuery,
  parseSearchExport,
  readExportFile,
  seoOriginText,
  termsForBrief,
} from "@/lib/searchDemand";
import { FACT_FIELDS, MARKETS, factSheetOf, type FactSheet } from "@/lib/factSheet";
import type { Prompt } from "@/lib/types";
import type { Database } from "@/lib/database.types";
import { z } from "zod";

type ResponseInsert = Database["public"]["Tables"]["geo_responses"]["Insert"];
type BrandUpdate = Database["public"]["Tables"]["geo_brands"]["Update"];

type Sugg = z.infer<typeof AdviseSuggestSchema>["prompts"];

export default function SettingsView({ section }: { section: "setup" | "admin" }) {
  const {
    brand,
    data,
    sb,
    toast,
    reload,
    loadBrands,
    setView,
    patchBrand,
    samples,
    setSamples,
    engines,
    archivedBrands,
    measureNewQuestions,
    missingMeasurements,
    liveEngineCount,
  } = useAppState();

  const [wizard, setWizard] = useState(false);
  const [strategy, setStrategy] = useState({
    objective: "",
    audience: "",
    positioning: "",
    themes: "",
  });
  const [profile, setProfile] = useState({
    pr_region: "",
    pr_journey: "",
    pr_objectives: "",
    pr_expectations: "",
    pr_persona: "",
    pr_newsworthy: "",
    pr_research_budget: false,
  });
  const [details, setDetails] = useState({
    name: "",
    sector: "",
    website: "",
    aliases: "",
    is_client: false,
    market_country: "",
  });
  const [facts, setFacts] = useState<FactSheet>(factSheetOf({}));
  const [mw, setMw] = useState<Record<string, number>>({});
  const [ew, setEw] = useState<Record<string, number>>({});
  const [prompts, setPrompts] = useState<Prompt[]>(data.prompts);
  const [mt, setMt] = useState({ outlet: "", tier: "Tier 2", vip: false });
  const [newComp, setNewComp] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [ctxAdd, setCtxAdd] = useState({ title: "", content: "", guidance: "" });
  const [fileGuidance, setFileGuidance] = useState("");
  const [fileObj, setFileObj] = useState<File | null>(null);
  const [sugg, setSugg] = useState<Sugg>([]);
  const [suggNote, setSuggNote] = useState("");
  const [suggError, setSuggError] = useState("");
  const [suggPicks, setSuggPicks] = useState<Set<number>>(new Set());
  const [suggBusy, setSuggBusy] = useState(false);
  /** Which button produced the suggestions on screen: strategy-led, or drafted from search demand (SEO). */
  const [suggFocus, setSuggFocus] = useState<"strategy" | "search">("strategy");
  /** Which section's button asked, so the results show right under it. */
  const [suggAt, setSuggAt] = useState<"seo" | "questions">("questions");
  const [suggUnmatched, setSuggUnmatched] = useState(0);
  const [seoPaste, setSeoPaste] = useState("");
  const [seoFile, setSeoFile] = useState<File | null>(null);
  const [seoBusy, setSeoBusy] = useState(false);
  const [seoShowAll, setSeoShowAll] = useState(false);

  useEffect(() => setPrompts(data.prompts), [data.prompts]);

  useEffect(() => {
    if (!brand) return;
    setStrategy({
      objective: brand.objective || "",
      audience: brand.audience || "",
      positioning: brand.positioning || "",
      themes: brand.themes || "",
    });
    setProfile({
      pr_region: brand.pr_region || "",
      pr_journey: brand.pr_journey || "",
      pr_objectives: brand.pr_objectives || "",
      pr_expectations: brand.pr_expectations || "",
      pr_persona: brand.pr_persona || "",
      pr_newsworthy: brand.pr_newsworthy || "",
      pr_research_budget: !!brand.pr_research_budget,
    });
    setDetails({
      name: brand.name || "",
      sector: brand.sector || "",
      website: brand.website || "",
      aliases: (brand.aliases || []).join(", "),
      is_client: !!brand.is_client,
      market_country: brand.market_country || "",
    });
    setFacts(factSheetOf(brand.fact_sheet));
    setMw(metricWeights(brand) as unknown as Record<string, number>);
    const e = engineWeights(brand);
    const eObj: Record<string, number> = {};
    ENGINES.forEach((en) => (eObj[en] = +(e[en] || 0)));
    setEw(eObj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand?.id]);

  if (!brand) return null;
  const steps = setupSteps(brand, data);
  // SEO input (search demand), sorted by demand for display.
  const seoTerms = [...data.searchTerms].sort(
    (a, b) => (demandOf(b).value ?? -1) - (demandOf(a).value ?? -1),
  );
  const seoSources = [...new Set(seoTerms.map((t) => t.source).filter(Boolean))].join(", ");
  const seoImported = seoTerms.reduce(
    (m, t) => (t.imported_at > m ? t.imported_at : m),
    "",
  );
  const seoUsedBy = new Map(
    data.prompts.filter((p) => p.seo_seed).map((p) => [normQuery(p.seo_seed!), p.code]),
  );
  const seoQuestionCount = prompts.filter((p) => p.seo_seed).length;
  const mwTot = METRIC_KEYS.reduce((s, k) => s + (+mw[k] || 0), 0);
  const ewTot = ENGINES.reduce((s, en) => s + (+ew[en] || 0), 0);

  /**
   * Save fields on the client. The database refuses edits from accounts without
   * edit access to this client by updating nothing (no error), so a save that
   * touched no row is reported as not saved rather than "saved".
   */
  async function updateBrand(upd: BrandUpdate): Promise<boolean> {
    const { data: rows, error } = await sb
      .from("geo_brands")
      .update(upd)
      .eq("id", brand!.id)
      .select("id");
    if (error) {
      toast("Save failed: " + error.message);
      return false;
    }
    if (!rows?.length) {
      toast("Not saved: your account can't edit this client. Ask an admin for edit access.");
      return false;
    }
    patchBrand(upd);
    return true;
  }

  async function saveStrategy() {
    const upd = {
      objective: strategy.objective.trim(),
      audience: strategy.audience.trim(),
      positioning: strategy.positioning.trim(),
      themes: strategy.themes.trim(),
    };
    if (await updateBrand(upd)) toast("Strategy saved");
  }

  async function saveProfile() {
    const upd = {
      pr_region: profile.pr_region.trim() || null,
      pr_journey: profile.pr_journey.trim() || null,
      pr_objectives: profile.pr_objectives.trim() || null,
      pr_expectations: profile.pr_expectations.trim() || null,
      pr_persona: profile.pr_persona.trim() || null,
      pr_newsworthy: profile.pr_newsworthy.trim() || null,
      pr_research_budget: profile.pr_research_budget,
    };
    if (await updateBrand(upd)) toast("PR profile saved");
  }

  async function saveFactSheet() {
    const clean: FactSheet = {};
    for (const f of FACT_FIELDS) clean[f.key] = (facts[f.key] || "").trim();
    if (await updateBrand({ fact_sheet: clean })) toast("Fact sheet saved");
  }

  async function saveBrandDetails() {
    const upd = {
      name: details.name.trim(),
      sector: details.sector.trim(),
      website: details.website.trim() || null,
      aliases: parseAliases(details.aliases),
      is_client: details.is_client,
      market_country: details.market_country || null,
    };
    if (!(await updateBrand(upd))) return;
    await loadBrands();
    toast("Brand details saved");
  }

  async function saveMetricWeights() {
    const w: Record<string, number> = {};
    METRIC_KEYS.forEach((k) => (w[k] = +mw[k] || 0));
    const { error } = await sb
      .from("geo_brands")
      .update({ metric_weights: w })
      .eq("id", brand!.id);
    if (error) return toast("Save failed");
    patchBrand({ metric_weights: w });
    toast("Metric weights saved");
  }

  async function saveEngineWeights() {
    const w: Record<string, number> = {};
    ENGINES.forEach((en) => (w[en] = +ew[en] || 0));
    const { error } = await sb
      .from("geo_brands")
      .update({ engine_weights: w })
      .eq("id", brand!.id);
    if (error) return toast("Save failed");
    patchBrand({ engine_weights: w });
    toast("Engine weights saved");
  }

  async function addMediaTarget() {
    if (!mt.outlet.trim()) return toast("Outlet name required");
    const { error } = await sb.from("geo_media_targets").insert({
      brand_id: brand!.id,
      outlet: mt.outlet.trim(),
      tier: mt.tier,
      vip: mt.vip,
    });
    if (error) return toast("Failed: " + error.message);
    setMt({ outlet: "", tier: "Tier 2", vip: false });
    toast("Media target added");
    await reload();
  }

  async function delMediaTarget(id: string) {
    await sb.from("geo_media_targets").delete().eq("id", id);
    toast("Removed");
    await reload();
  }

  async function addCompetitor() {
    if (!newComp.trim()) return;
    const { error } = await sb
      .from("geo_competitors")
      .insert({ brand_id: brand!.id, name: newComp.trim() });
    if (error) return toast("Failed");
    setNewComp("");
    toast("Added");
    await reload();
  }

  async function saveCompetitorAliases(id: string, raw: string) {
    const aliases = parseAliases(raw);
    const c = data.competitors.find((x) => x.id === id);
    if (c && (c.aliases || []).join(", ") === aliases.join(", ")) return;
    const { error } = await sb.from("geo_competitors").update({ aliases }).eq("id", id);
    if (error) return toast("Save failed: " + error.message);
    toast("Also-known-as saved");
    await reload();
  }

  async function delCompetitor(id: string) {
    await sb.from("geo_competitors").delete().eq("id", id);
    toast("Removed");
    await reload();
  }

  async function savePrompt(
    id: string,
    field: "ptype" | "text" | "active",
    val: string | boolean,
  ) {
    const { error } = await sb
      .from("geo_prompts")
      .update({ [field]: val } as Partial<Prompt>)
      .eq("id", id);
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: val } : p)),
    );
    toast(error ? "Save failed" : "Question saved");
  }

  async function addPrompt() {
    if (!newPrompt.trim()) return;
    const n = prompts.length + 1;
    const code = "P" + String(n).padStart(2, "0");
    const { error } = await sb.from("geo_prompts").insert({
      brand_id: brand!.id,
      code,
      ptype: "Category",
      text: newPrompt.trim(),
      sort: n,
    });
    if (error) return toast("Failed");
    setNewPrompt("");
    toast("Question added");
    await reload();
    offerToMeasure(1);
  }

  /**
   * New questions only get answers when they're measured. Offer to measure
   * them now rather than leaving them blank until next month's check.
   */
  function offerToMeasure(n: number) {
    const run = data.currentRun;
    if (!run || run.method !== "v2" || !liveEngineCount) return;
    // "Measure now" fills every gap in the check, so anything already missing
    // (failed or stopped measurements) is measured too: say so in the total.
    const others = missingMeasurements;
    const total = n * liveEngineCount + others;
    if (
      window.confirm(
        `Measure the ${n} new question${n === 1 ? "" : "s"} now, so ${
          n === 1 ? "it shows" : "they show"
        } in this month's AI answers? That's ${total} measurement${total === 1 ? "" : "s"} ` +
          (others ? `(including ${others} already missing from this check) ` : "") +
          `on ${liveEngineCount} engines, ${samples} samples each, and uses AI credit — you can stop ` +
          "it at any time. Choose Cancel to wait for the next monthly check.",
      )
    )
      measureNewQuestions();
  }

  /** How many measured answers (in any check) a question has. */
  async function answerCount(id: string): Promise<number> {
    const { count } = await sb
      .from("geo_responses")
      .select("id", { count: "exact", head: true })
      .eq("prompt_id", id);
    return count || 0;
  }

  /** Next free P-code, so a new question never reuses an existing code. */
  function nextCode(): string {
    const max = prompts.reduce((m, p) => Math.max(m, parseInt(p.code.replace(/\D/g, ""), 10) || 0), 0);
    return "P" + String(max + 1).padStart(2, "0");
  }

  // Same words, ignoring case, spacing and punctuation: a typo fix, not a new question.
  const sameWords = (a: string, b: string) =>
    a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() ===
    b.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

  /**
   * Rewording a question that already has answers would make its trend, the
   * gained/lost list and PR before/after compare different questions. So the
   * new wording becomes a new question and the old one is retired (kept, with
   * its history, but no longer measured).
   */
  async function rewordPrompt(p: Prompt, text: string, input: HTMLInputElement) {
    const t = text.trim();
    if (!t) {
      input.value = p.text;
      return;
    }
    if (sameWords(t, p.text)) return savePrompt(p.id, "text", t);
    const n = await answerCount(p.id);
    if (!n) return savePrompt(p.id, "text", t);
    if (
      !window.confirm(
        `“${p.text}” already has ${n} measured answer${n === 1 ? "" : "s"}. Changing the wording ` +
          "makes it a different question, so comparing it with earlier checks would mislead.\n\n" +
          "Save the new wording as a new question and retire the old one? The old one keeps its " +
          "history but stops being measured. Choose Cancel to keep the old wording.",
      )
    ) {
      input.value = p.text;
      return;
    }
    const row = {
      brand_id: brand!.id,
      code: nextCode(),
      ptype: p.ptype,
      text: t,
      active: true,
      sort: p.sort,
      seo_seed: p.seo_seed,
      seo_demand: p.seo_demand,
      seo_demand_kind: p.seo_demand_kind,
      replaces: p.id,
    };
    let { error } = await sb.from("geo_prompts").insert(row);
    // Before the "replaces" column exists, save the new question without the link.
    if (error && /replaces/.test(error.message)) {
      const { replaces: _drop, ...rest } = row;
      void _drop;
      ({ error } = await sb.from("geo_prompts").insert(rest));
    }
    if (error) {
      input.value = p.text;
      return toast("Not saved: " + error.message);
    }
    await sb.from("geo_prompts").update({ active: false }).eq("id", p.id);
    toast(`Saved as a new question; ${p.code} retired`);
    await reload();
    offerToMeasure(1);
  }

  async function delPrompt(p: Prompt) {
    const n = await answerCount(p.id);
    const ok = window.confirm(
      n
        ? `Delete “${p.text}” and its ${n} measured answer${n === 1 ? "" : "s"}? Past scores and ` +
            "reports change, and this can't be undone.\n\nTo stop measuring it but keep its " +
            "history, choose Cancel and untick Active instead."
        : `Delete “${p.text}”? It has no measured answers yet.`,
    );
    if (!ok) return;
    const { error } = await sb.from("geo_prompts").delete().eq("id", p.id);
    if (error) return toast("Not deleted: " + error.message);
    toast("Question deleted");
    await reload();
  }

  /**
   * "strategy": the strategist drafts questions from the strategy, notes and
   * latest check. "search": every question is drafted from an imported Google
   * search term (SEO input) and carries that term so it stays labelled.
   */
  async function suggestPrompts(
    focus: "strategy" | "search" = "strategy",
    at: "seo" | "questions" = "questions",
  ) {
    setSuggBusy(true);
    setSugg([]);
    setSuggNote("");
    setSuggError("");
    setSuggUnmatched(0);
    setSuggFocus(focus);
    setSuggAt(at);
    try {
      const brief = buildAdviseBrief(brand!, data);
      const j = await callFn(
        "geo-advise",
        focus === "search"
          ? {
              mode: "suggest",
              focus: "search",
              brief: { ...brief, search_demand: termsForBrief(data.searchTerms, data.prompts) },
            }
          : { mode: "suggest", brief },
        AdviseSuggestSchema,
      );
      if (j.error || !j.prompts?.length) {
        setSuggError(j.error || "No suggestions came back. Try again.");
      } else {
        setSugg(j.prompts);
        setSuggNote(j.note || "");
        setSuggUnmatched(j.unmatched || 0);
        setSuggPicks(new Set(j.prompts.map((_, i) => i)));
      }
    } catch (e) {
      setSuggError("Couldn't reach the suggestion service: " + String(e));
    }
    setSuggBusy(false);
    // Bring the results (or the error) into view under the button that asked.
    setTimeout(
      () =>
        document
          .getElementById("sugg-panel")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  }

  async function addSelectedSuggestions() {
    const picks = [...suggPicks].map((i) => (sugg || [])[i]).filter(Boolean);
    if (!picks.length) return toast("Tick at least one suggestion");
    let n = prompts.length;
    const rows = picks.map((p) => {
      n++;
      return {
        brand_id: brand!.id,
        code: "P" + String(n).padStart(2, "0"),
        ptype: p!.ptype || "Category",
        text: p!.text,
        sort: n,
        active: true,
        seo_seed: p!.seo_seed || null,
        seo_demand: p!.seo_seed ? (p!.seo_demand ?? null) : null,
        seo_demand_kind: p!.seo_seed ? (p!.seo_demand_kind ?? null) : null,
      };
    });
    const { error } = await sb.from("geo_prompts").insert(rows);
    if (error) return toast("Failed: " + error.message);
    setSugg([]);
    toast(
      `${rows.length} question${rows.length === 1 ? "" : "s"} added to Questions we track`,
    );
    await reload();
    offerToMeasure(rows.length);
  }

  /** Import Google search terms (SEO input) from an export file or a pasted list. */
  async function importSearchTerms() {
    if (!seoFile && !seoPaste.trim()) return toast("Choose a file or paste search terms first");
    if (seoFile && seoFile.size > 20_000_000) return toast("File too large (max ~20MB)");
    setSeoBusy(true);
    try {
      const text = seoFile ? await readExportFile(seoFile) : seoPaste;
      const { terms, source } = parseSearchExport(text);
      if (!terms.length) {
        toast("No search terms found — check the file has a Query or Keyword column");
        return;
      }
      const keep = terms.slice(0, 2000);
      const now = new Date().toISOString();
      // A term imported again from another tool keeps the figures it already
      // had (e.g. Search Console impressions survive a Semrush volume import).
      const existing = new Map(data.searchTerms.map((t) => [t.query, t]));
      const rows = keep.map((t) => {
        const old = existing.get(t.query);
        const sources = [...new Set([old?.source, source].filter(Boolean))].join(" + ");
        return {
          brand_id: brand!.id,
          query: t.query,
          volume: t.volume ?? old?.volume ?? null,
          impressions: t.impressions ?? old?.impressions ?? null,
          clicks: t.clicks ?? old?.clicks ?? null,
          position: t.position ?? old?.position ?? null,
          source: sources || source,
          imported_at: now,
        };
      });
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from("geo_search_terms").upsert(
          rows.slice(i, i + 500),
          { onConflict: "brand_id,query" },
        );
        if (error) {
          toast("Import failed: " + error.message);
          return;
        }
      }
      setSeoFile(null);
      setSeoPaste("");
      toast(
        `Imported ${keep.length} search terms from ${source}` +
          (terms.length > keep.length ? ` (top ${keep.length} of ${terms.length} by demand)` : ""),
      );
      await reload();
    } catch (e) {
      toast("Couldn't read search data: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSeoBusy(false);
    }
  }

  async function clearSearchTerms() {
    if (
      !window.confirm(
        "Remove all imported search data for this client? Tracked questions drafted from it are kept (and keep their SEO label).",
      )
    )
      return;
    const { error } = await sb.from("geo_search_terms").delete().eq("brand_id", brand!.id);
    toast(error ? "Failed: " + error.message : "Search data removed");
    await reload();
  }

  async function addContext() {
    if (!ctxAdd.title.trim() || !ctxAdd.content.trim())
      return toast("Title and content are both required");
    const { error } = await sb.from("geo_context").insert({
      brand_id: brand!.id,
      kind: "transcript",
      title: ctxAdd.title.trim(),
      content: ctxAdd.content.trim(),
      guidance: ctxAdd.guidance.trim() || null,
    });
    if (error) return toast("Failed: " + error.message);
    setCtxAdd({ title: "", content: "", guidance: "" });
    toast("Context added");
    await reload();
  }

  async function addContextFile() {
    if (!fileObj) return toast("Choose a file first");
    if (fileObj.size > 10000000) return toast("File too large (max ~10MB)");
    toast("Reading " + fileObj.name + "…");
    try {
      let text = await extractFileText(fileObj);
      text = (text || "").trim();
      if (!text) return toast("Couldn't extract any text from that file");
      const { error } = await sb.from("geo_context").insert({
        brand_id: brand!.id,
        kind: "document",
        title: fileObj.name,
        content: text.slice(0, 200000),
        guidance: fileGuidance.trim() || null,
      });
      if (error) return toast("Failed: " + error.message);
      setFileObj(null);
      setFileGuidance("");
      toast("File added: " + fileObj.name + " (" + text.length + " chars read)");
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast("Couldn't read file: " + msg);
    }
  }

  async function delContext(id: string) {
    await sb.from("geo_context").delete().eq("id", id);
    toast("Removed");
    await reload();
  }

  async function generateCapture() {
    let runId = data.currentRun?.id;
    if (!runId) {
      const lbl = monthLabel() + " (Current)";
      const { data: newRun, error } = await sb
        .from("geo_runs")
        .insert({
          brand_id: brand!.id,
          label: lbl,
          run_date: todayISO(),
          is_current: true,
        })
        .select()
        .single();
      if (error || !newRun) return toast("Run create failed");
      runId = newRun.id;
    }
    const active = prompts.filter((p) => p.active);
    if (!active.length) return toast("Add questions first");
    const have = new Set(
      data.currentRun ? data.responses.map((r) => r.prompt_id + "|" + r.engine) : [],
    );
    const rows: ResponseInsert[] = [];
    // Only connected engines: a blank row for an engine nobody can measure
    // would be scored as "not named" and drag the score down.
    const live = ENGINES.filter((e) => engines[e]);
    if (!live.length) return toast("No AI engines are connected");
    active.forEach((p) =>
      live.forEach((e) => {
        if (!have.has(p.id + "|" + e))
          rows.push({
            run_id: runId!,
            prompt_id: p.id,
            engine: e,
            mentioned: false,
            prominence: "Absent",
            cited: "n/a",
            competitor_mentions: 0,
          });
      }),
    );
    if (!rows.length) return toast("Capture grid already complete — existing data kept");
    const { error } = await sb.from("geo_responses").insert(rows);
    if (error) return toast("Failed: " + error.message);
    toast(rows.length + " new rows added (existing data kept)");
    await reload();
    setView("answers", "answers");
  }

  async function archiveClient() {
    if (
      !window.confirm(
        "Archive " +
          brand!.name +
          "? It will be hidden from the brand switcher but all its data is kept and can be restored from Admin → Archive or delete client.",
      )
    )
      return;
    const { error } = await sb
      .from("geo_brands")
      .update({ archived: true })
      .eq("id", brand!.id);
    if (error) return toast("Archive failed: " + error.message);
    toast("Client archived");
    await loadBrands();
    setView("admin");
  }

  async function restoreClient(id: string) {
    const { error } = await sb
      .from("geo_brands")
      .update({ archived: false })
      .eq("id", id);
    if (error) return toast("Restore failed: " + error.message);
    toast("Client restored");
    await loadBrands();
    setView("admin");
  }

  async function deleteClient(id?: string) {
    const bid = id || brand!.id;
    const nm =
      [...archivedBrands, brand!].find((b) => b?.id === bid)?.name || "this client";
    if (
      !window.confirm(
        "Permanently delete " +
          nm +
          " and ALL its data (monthly checks, questions, answers, PR, mentions, documents)?\n\nThis cannot be undone.",
      )
    )
      return;
    if (!window.confirm("Last check — really delete " + nm + " forever?")) return;
    const { error } = await sb.rpc("geo_delete_brand", { bid });
    if (error) return toast("Delete failed: " + error.message);
    toast(nm + " deleted");
    await loadBrands();
    setView("admin");
  }

  /**
   * The suggestion results, shown right under whichever button asked for them
   * (Search demand or Questions we track) so they can't be missed.
   */
  function renderSuggestions() {
    return (
      <div id="sugg-panel" style={{ scrollMarginTop: 90 }}>
        {suggBusy && (
          <div className="legend-note" style={{ marginTop: 10 }}>
            Drafting questions… this takes up to a minute. They will appear here for you to
            pick from.
          </div>
        )}
        {suggError && (
          <div className="legend-note" style={{ marginTop: 10, color: "var(--red)" }}>
            {suggError}
          </div>
        )}
        {sugg && sugg.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {suggFocus === "search" && (
              <div className="legend-note" style={{ color: "var(--seo)" }}>
                <SeoChip /> Drafted from the client&#39;s Google search demand. Search data
                only picked the topics — once added, these are measured in the AI engines
                like any other question.
                {suggUnmatched > 0 &&
                  ` ${suggUnmatched} suggestion${suggUnmatched === 1 ? " was" : "s were"} dropped because ${
                    suggUnmatched === 1 ? "it" : "they"
                  } couldn't be tied to an imported search term.`}
              </div>
            )}
            <div className="legend-note">
              {suggNote || "Ranked by impact on this client\u2019s strategy."} Tick the
              ones to add.
            </div>
            <div style={{ overflow: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Type</th>
                    <th>Suggested question</th>
                    {suggFocus === "search" && <th>Search behind it (SEO)</th>}
                    <th>Who &amp; when</th>
                    <th>Impact</th>
                    <th>Why it matters</th>
                    <th>How PR can win it</th>
                  </tr>
                </thead>
                <tbody>
                  {sugg.map((p, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          type="checkbox"
                          style={{ width: "auto" }}
                          checked={suggPicks.has(i)}
                          onChange={(e) =>
                            setSuggPicks((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.add(i);
                              else n.delete(i);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td>
                        <span className="badge">{p!.ptype}</span>
                      </td>
                      <td style={{ minWidth: 220 }}>
                        {p!.text}
                        {p!.names_client && (
                          <span className="muted" style={{ fontSize: 11 }}>
                            {" "}
                            (names the client)
                          </span>
                        )}
                      </td>
                      {suggFocus === "search" && (
                        <td style={{ minWidth: 170 }}>
                          {p!.seo_seed ? (
                            <div className="seo-line" style={{ marginTop: 0 }}>
                              <SeoChip /> “{p!.seo_seed}”
                              <div className="muted" style={{ fontSize: 11 }}>
                                {formatDemand(p!.seo_demand, p!.seo_demand_kind)}
                              </div>
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      )}
                      <td className="muted" style={{ minWidth: 120, fontSize: 12 }}>
                        {[p!.persona, p!.stage].filter(Boolean).join(" · ")}
                      </td>
                      <td
                        style={{ color: "#C9871B", whiteSpace: "nowrap" }}
                        title={`Impact ${p!.impact}/5`}
                      >
                        {stars(Number(p!.impact))}
                      </td>
                      <td className="muted" style={{ minWidth: 220 }}>
                        {p!.reason}
                      </td>
                      <td className="muted" style={{ minWidth: 200 }}>
                        {p!.lever}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="btn sm"
              style={{ marginTop: 8 }}
              onClick={addSelectedSuggestions}
            >
              Add selected to Questions we track
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {section === "setup" && (
        <>
          <ol className="checklist">
            {steps.map((st, i) => (
              <li key={st.id}>
                <span className="n">{i + 1}</span>
                <div className="txt">
                  <b>{st.title}</b>
                  <div>{st.detail}</div>
                </div>
                {st.status === "done" ? (
                  <span className="tag t-yes">Done</span>
                ) : st.status === "attention" ? (
                  <span className="tag" style={{ background: "#fbefd9", color: "#6e4a0c" }}>
                    Needs attention
                  </span>
                ) : (
                  <span className="tag t-na">Review</span>
                )}
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() =>
                    document
                      .getElementById("setup-" + st.id)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  Open
                </button>
              </li>
            ))}
          </ol>
        <div id="setup-brand" className="setup-section">
        {/* Brand details */}
        <div className="card stack">
          <h3>Brand &amp; website</h3>
          <label>Name</label>
          <input
            value={details.name}
            onChange={(e) => setDetails({ ...details, name: e.target.value })}
          />
          <label>Sector</label>
          <input
            value={details.sector}
            onChange={(e) => setDetails({ ...details, sector: e.target.value })}
          />
          <label>Website URL</label>
          <input
            value={details.website}
            placeholder="https://clientsite.com"
            onChange={(e) => setDetails({ ...details, website: e.target.value })}
          />
          <label>Main market</label>
          <select
            value={details.market_country}
            onChange={(e) => setDetails({ ...details, market_country: e.target.value })}
          >
            <option value="">Global / no single country</option>
            {MARKETS.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
          <label>Also known as</label>
          <input
            value={details.aliases}
            placeholder="e.g. Acme, Acme Corp (comma-separated)"
            onChange={(e) => setDetails({ ...details, aliases: e.target.value })}
          />
          <label className="flex" style={{ fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={details.is_client}
              style={{ width: "auto", marginRight: 8 }}
              onChange={(e) => setDetails({ ...details, is_client: e.target.checked })}
            />{" "}
            Is a client
          </label>
          <button className="btn sm" onClick={saveBrandDetails}>
            Save details
          </button>
          <div className="legend-note">
            The website is the client&#39;s ground-truth domain — used to spot when their
            own site is cited, and given to the AI for context. &quot;Also known as&quot;
            lists other names the brand goes by, so a mention under any of them counts.
            The main market sets where the AI engines search from (ChatGPT, Claude and
            Perplexity), so answers match what buyers in that country see.
          </div>
        </div>
        </div>
        <div id="setup-strategy" className="setup-section">
      {/* Visibility strategy */}
      <div className="card stack" style={{ marginBottom: 16 }}>
        <h3>Visibility strategy &amp; positioning</h3>
        <label>Objective</label>
        <input
          value={strategy.objective}
          placeholder="e.g. Grow awareness as a trusted partner for financial services"
          onChange={(e) => setStrategy({ ...strategy, objective: e.target.value })}
        />
        <label>Target audience / sector</label>
        <input
          value={strategy.audience}
          placeholder="e.g. CTOs at financial services firms"
          onChange={(e) => setStrategy({ ...strategy, audience: e.target.value })}
        />
        <label>Desired positioning</label>
        <input
          value={strategy.positioning}
          placeholder="e.g. The compliance-first AI transformation partner"
          onChange={(e) => setStrategy({ ...strategy, positioning: e.target.value })}
        />
        <label>Priority themes</label>
        <input
          value={strategy.themes}
          placeholder="e.g. AI, security, regulation"
          onChange={(e) => setStrategy({ ...strategy, themes: e.target.value })}
        />
        <button className="btn sm" onClick={saveStrategy}>
          Save strategy
        </button>
        <div className="legend-note">
          Strategy shapes the questions you track and powers the ✨ AI guidance in the
          action plan. The Overview shows a short AI summary of this strategy and the PR
          profile, rewritten whenever they change here. You can edit that summary on the
          Overview; an edited summary is never overwritten without asking.
        </div>
      </div>
        </div>
        <div id="setup-facts" className="setup-section">
      <div className="card stack" style={{ marginBottom: 16 }}>
        <h3>Client fact sheet</h3>
        <div className="legend-note" style={{ marginTop: 0 }}>
          The facts the client has confirmed. Every AI suggestion treats this as ground
          truth, and each monthly check uses it to judge whether what the AI engines say
          about {brand.name} is accurate — so errors are caught, not guessed.
        </div>
        {FACT_FIELDS.map((f) => (
          <div key={f.key}>
            <label>{f.label}</label>
            <textarea
              rows={f.key === "description" ? 2 : 3}
              value={facts[f.key] || ""}
              placeholder={f.hint}
              onChange={(e) => setFacts({ ...facts, [f.key]: e.target.value })}
            />
          </div>
        ))}
        <button className="btn sm" onClick={saveFactSheet}>
          Save fact sheet
        </button>
      </div>
        </div>
        <div id="setup-competitors" className="setup-section">
        {/* Competitors */}
        <div className="card">
          <h3>Competitors</h3>
          <table>
            <tbody>
              {data.competitors.length ? (
                data.competitors.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>
                      <input
                        key={(c.aliases || []).join(",")}
                        defaultValue={(c.aliases || []).join(", ")}
                        placeholder="Also known as…"
                        title="Other names this competitor goes by (comma-separated)"
                        onBlur={(e) => saveCompetitorAliases(c.id, e.target.value)}
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn sm danger"
                        onClick={() => delCompetitor(c.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="muted">None</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex" style={{ marginTop: 10 }}>
            <input
              value={newComp}
              placeholder="Add competitor name"
              onChange={(e) => setNewComp(e.target.value)}
            />
            <button className="btn sm" onClick={addCompetitor}>
              Add
            </button>
          </div>
        </div>
        <CategoryBrandsPanel />
        </div>
        <div id="setup-search" className="setup-section">
        {/* Search demand — SEO input, kept visibly separate from GEO measurement */}
        <div className="card seo-card">
          <h3 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <SeoChip /> Search demand
            <span className="muted" style={{ textTransform: "none", fontWeight: 500 }}>
              — optional input for choosing which questions to ask AI
            </span>
          </h3>
          <div className="seo-geo-key">
            <div className="k-seo">
              <b style={{ color: "var(--seo)" }}>🔍 SEO — search demand (this section)</b>
              What people type into Google, from the client&#39;s Search Console or a keyword
              tool. We use it only to decide which questions are worth asking the AI engines.
              It is <u>not</u> part of the GEO score.
            </div>
            <div className="k-geo">
              <b style={{ color: "var(--blue)" }}>◎ GEO — AI visibility (the rest of the tool)</b>
              Whether the AI engines name, cite and recommend the client when they are asked
              those questions. Measured in the monthly check — this is what the scores, answers
              and reports show.
            </div>
          </div>

          {seoTerms.length > 0 ? (
            <>
              <div className="legend-note" style={{ marginTop: 6 }}>
                <b>{seoTerms.length}</b> search terms
                {seoSources ? <> from {seoSources}</> : null}
                {seoImported ? <> · last imported {seoImported.slice(0, 10)}</> : null} ·{" "}
                {seoQuestionCount} tracked question{seoQuestionCount === 1 ? "" : "s"} drafted
                from them. Highest demand first.
              </div>
              <div style={{ overflow: "auto", marginTop: 6 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Google search term</th>
                      <th>Search demand</th>
                      <th>Clicks to client site</th>
                      <th title="Where the client's site ranks in Google for this term — an SEO figure, not an AI result">
                        Google rank
                      </th>
                      <th>AI question</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seoTerms.slice(0, seoShowAll ? 200 : 12).map((t) => {
                      const d = demandOf(t);
                      const code = seoUsedBy.get(t.query);
                      return (
                        <tr key={t.id}>
                          <td>{t.query}</td>
                          <td style={{ whiteSpace: "nowrap" }}>{formatDemand(d.value, d.kind)}</td>
                          <td className="muted">{t.clicks ?? "—"}</td>
                          <td className="muted">
                            {t.position != null ? Math.round(t.position * 10) / 10 : "—"}
                          </td>
                          <td>
                            {code ? (
                              <span className="badge" title="A tracked question was drafted from this search">
                                {code}
                              </span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {seoTerms.length > 12 && (
                <button
                  type="button"
                  className="btn sm ghost"
                  style={{ marginTop: 6 }}
                  onClick={() => setSeoShowAll((v) => !v)}
                >
                  {seoShowAll
                    ? "Show top 12"
                    : `Show more (${Math.min(200, seoTerms.length)} of ${seoTerms.length})`}
                </button>
              )}
              <div className="flex" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn sm"
                  onClick={() => suggestPrompts("search", "seo")}
                  disabled={suggBusy}
                  style={{ background: "var(--seo)", borderColor: "var(--seo)" }}
                >
                  {suggBusy && suggFocus === "search"
                    ? "Thinking… (up to a minute)"
                    : "✨ Suggest AI questions from these searches"}
                </button>
                <button className="btn sm ghost" onClick={clearSearchTerms}>
                  Clear search data
                </button>
              </div>
              <div className="legend-note">
                The strategist rewrites search terms as the conversational questions buyers ask
                AI (a short search like “b2b pr agency” becomes a full question). Suggestions
                appear just below: tick the ones you want and click <b>Add selected</b> to put them
                in Questions we track. They are then measured in the AI engines like any other
                question.
              </div>
              {suggAt === "seo" && renderSuggestions()}
            </>
          ) : (
            <div className="legend-note">
              No search data yet. Importing it is optional — without it, questions are drafted
              from the strategy alone.
            </div>
          )}

          <details style={{ marginTop: 12 }} open={!seoTerms.length}>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
              {seoTerms.length ? "Import more search data" : "Import search data"}
            </summary>
            <div className="legend-note">
              Works with: <b>Google Search Console</b> → Performance → Export → unzip and upload{" "}
              <i>Queries.csv</i>; <b>Semrush</b>, <b>Ahrefs</b> or <b>Google Keyword Planner</b>{" "}
              keyword exports (CSV); or paste a list — one term per line, optionally followed by a
              comma and its monthly searches. Re-importing a term updates its figures.
            </div>
            <div className="flex" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                style={{ width: "auto" }}
                onChange={(e) => setSeoFile(e.target.files?.[0] || null)}
              />
            </div>
            <textarea
              value={seoPaste}
              rows={4}
              placeholder={"…or paste search terms, e.g.\nbest b2b pr agency uk, 880\nhow to choose a pr agency, 590"}
              style={{ width: "100%", marginTop: 8 }}
              onChange={(e) => setSeoPaste(e.target.value)}
            />
            <button
              className="btn sm"
              style={{ marginTop: 8 }}
              onClick={importSearchTerms}
              disabled={seoBusy}
            >
              {seoBusy ? "Importing…" : "Import search data"}
            </button>
          </details>
        </div>
        </div>
        <div id="setup-questions" className="setup-section">
        {/* Prompt set */}
        <div className="card" style={{ gridColumn: "1/-1" }}>
          <h3>Questions we track ({prompts.length})</h3>
          <div style={{ overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Question</th>
                  <th>Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {prompts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="badge">{p.code}</span>
                    </td>
                    <td>
                      <select
                        value={p.ptype || "Category"}
                        onChange={(e) => savePrompt(p.id, "ptype", e.target.value)}
                      >
                        {PTYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        defaultValue={p.text}
                        style={{ width: "100%", minWidth: 240 }}
                        aria-label={`Wording of ${p.code}`}
                        onBlur={(e) => {
                          if (e.target.value !== p.text) void rewordPrompt(p, e.target.value, e.target);
                        }}
                      />
                      {p.seo_seed && (
                        <div className="seo-line" title={seoOriginText(p)}>
                          <SeoChip /> from Google search “{p.seo_seed}” ·{" "}
                          {formatDemand(p.seo_demand, p.seo_demand_kind)}
                        </div>
                      )}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!p.active}
                        style={{ width: "auto" }}
                        onChange={(e) => savePrompt(p.id, "active", e.target.checked)}
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn sm danger" onClick={() => delPrompt(p)}>
                        Delete…
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {seoQuestionCount > 0 && (
            <div className="legend-note">
              <SeoChip /> marks questions drafted from Google search demand. That only explains
              why we chose them — their AI answers and scores are GEO measurement, exactly like
              every other question.
            </div>
          )}
          <div className="flex" style={{ marginTop: 10 }}>
            <input
              value={newPrompt}
              placeholder="New question, as a buyer would ask it"
              style={{ flex: 1 }}
              onChange={(e) => setNewPrompt(e.target.value)}
            />
            <button className="btn sm" onClick={addPrompt}>
              Add question
            </button>
          </div>
          <div
            style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}
          >
            <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn sm"
                onClick={() => suggestPrompts("strategy", "questions")}
                disabled={suggBusy}
              >
                {suggBusy && suggFocus === "strategy"
                  ? "✨ Thinking… (up to a minute)"
                  : "✨ Suggest questions"}
              </button>
              <button
                className="btn sm"
                onClick={() => suggestPrompts("search", "questions")}
                disabled={suggBusy || !seoTerms.length}
                title={
                  seoTerms.length
                    ? "Draft questions from the imported Google search terms (SEO input)"
                    : "Import search data in the Search demand section first"
                }
                style={
                  seoTerms.length
                    ? { background: "var(--seo)", borderColor: "var(--seo)" }
                    : undefined
                }
              >
                {suggBusy && suggFocus === "search"
                  ? "🔍 Thinking… (up to a minute)"
                  : "🔍 Suggest from search demand (SEO)"}
              </button>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              <b>Suggest questions</b> drafts like a GEO strategist: strategy, PR profile and
              market, client notes, competitors, questions already tracked and what the latest
              check found. <b>Suggest from search demand</b> does the same but starts from what
              people search for on Google
              {seoTerms.length ? "" : " (import search data above to use it)"}. You pick which
              to add.
            </div>
            {suggAt === "questions" && renderSuggestions()}
          </div>
        </div>
        </div>
        <div id="setup-media" className="setup-section">
      {/* Client PR Profile */}
      <div
        className="card stack"
        style={{ marginBottom: 16, borderLeft: "5px solid var(--blue)" }}
      >
        <h3>
          PR profile{" "}
          <span className="muted" style={{ textTransform: "none", fontWeight: 500 }}>
            — shapes the ideas in Plan → Ideas inbox
          </span>
        </h3>
        <div className="legend-note">
          The richer this profile, the more relevant and feasible the Radar&#39;s
          recommendations. Themes and audience are taken from the strategy above.
        </div>
        <div className="set-grid" style={{ marginTop: 8 }}>
          <div>
            <label>Regional market targeted</label>
            <input
              value={profile.pr_region}
              placeholder="e.g. UK & DACH"
              onChange={(e) => setProfile({ ...profile, pr_region: e.target.value })}
            />
          </div>
          <div>
            <label>Stage of journey</label>
            <input
              value={profile.pr_journey}
              placeholder="e.g. Series A, scaling awareness"
              onChange={(e) => setProfile({ ...profile, pr_journey: e.target.value })}
            />
          </div>
        </div>
        <label>PR objectives — what should PR achieve?</label>
        <textarea
          value={profile.pr_objectives}
          placeholder="e.g. Build credibility with enterprise buyers; support fundraising; establish the founder as a category voice"
          onChange={(e) => setProfile({ ...profile, pr_objectives: e.target.value })}
        />
        <label>Client expectations / context for PR</label>
        <textarea
          value={profile.pr_expectations}
          placeholder="e.g. Conservative, regulated; wants tier-1 only; no reactive comment without sign-off"
          onChange={(e) => setProfile({ ...profile, pr_expectations: e.target.value })}
        />
        <label>Who needs to know them, and what matters to those people?</label>
        <textarea
          value={profile.pr_persona}
          placeholder="e.g. CISOs and Heads of Risk at banks — care about compliance, proven security, peer validation"
          onChange={(e) => setProfile({ ...profile, pr_persona: e.target.value })}
        />
        <label>Anything newsworthy in flight or recently launched</label>
        <textarea
          value={profile.pr_newsworthy}
          placeholder="e.g. New funding round closing Q3; product launch in September; new CISO hire"
          onChange={(e) => setProfile({ ...profile, pr_newsworthy: e.target.value })}
        />
        <label className="flex" style={{ fontWeight: 500, marginTop: 8 }}>
          <input
            type="checkbox"
            checked={profile.pr_research_budget}
            style={{ width: "auto", marginRight: 8 }}
            onChange={(e) =>
              setProfile({ ...profile, pr_research_budget: e.target.checked })
            }
          />{" "}
          Budget available for market research / original data
        </label>
        <button className="btn sm" style={{ marginTop: 4 }} onClick={saveProfile}>
          Save PR profile
        </button>
      </div>
      {/* VIP & target media */}
      <div className="card stack" style={{ marginBottom: 16 }}>
        <h3>VIP &amp; target media list</h3>
        <div className="legend-note">
          The outlets the Radar should aim ideas at. Mark the must-win titles as VIP.
          Over time the system learns which ideas each outlet actually accepts.
        </div>
        <div style={{ overflow: "auto", marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Outlet</th>
                <th>Tier</th>
                <th>VIP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.media.length ? (
                data.media.map((m) => (
                  <tr key={m.id}>
                    <td style={{ minWidth: 160 }}>{m.outlet}</td>
                    <td>{m.tier || ""}</td>
                    <td>
                      {m.vip ? (
                        <span className="tag t-yes">VIP</span>
                      ) : (
                        <span className="tag t-na">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn sm danger"
                        onClick={() => delMediaTarget(m.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="muted">
                    No media targets yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="set-grid" style={{ marginTop: 10 }}>
          <div>
            <label>Outlet</label>
            <input
              value={mt.outlet}
              placeholder="e.g. TechCrunch"
              onChange={(e) => setMt({ ...mt, outlet: e.target.value })}
            />
          </div>
          <div>
            <label>Tier</label>
            <select value={mt.tier} onChange={(e) => setMt({ ...mt, tier: e.target.value })}>
              <option>Tier 1</option>
              <option>Tier 2</option>
              <option>Tier 3</option>
            </select>
          </div>
        </div>
        <label className="flex" style={{ fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={mt.vip}
            style={{ width: "auto", marginRight: 8 }}
            onChange={(e) => setMt({ ...mt, vip: e.target.checked })}
          />{" "}
          Mark as VIP / must-win
        </label>
        <button className="btn sm" style={{ marginTop: 4 }} onClick={addMediaTarget}>
          Add media target
        </button>
      </div>
        </div>
        <div id="setup-docs" className="setup-section">
        {/* Strategy context */}
        <div className="card" style={{ gridColumn: "1/-1" }}>
          <h3>Background documents ({data.context.length})</h3>
          <div className="legend-note">
            Add call transcripts, notes and strategy documents. The AI uses these so its
            recommendations and prompt suggestions get more informed about what this
            client actually needs — and it improves over time as you add more.
          </div>
          <div style={{ overflow: "auto", marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Added</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Preview</th>
                  <th>Team guidance for the AI</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.context.length ? (
                  data.context.map((c) => (
                    <tr key={c.id}>
                      <td>{(c.created_at || "").slice(0, 10)}</td>
                      <td>
                        <span className="badge">{c.kind}</span>
                      </td>
                      <td style={{ minWidth: 140 }}>{c.title}</td>
                      <td className="muted" style={{ minWidth: 200 }}>
                        {(c.content || "").slice(0, 120)}
                        {(c.content || "").length > 120 ? "…" : ""}
                      </td>
                      <td style={{ minWidth: 180 }}>
                        {c.guidance ? (
                          <>
                            <span style={{ color: "var(--blue)" }}>✦ </span>
                            {c.guidance}
                          </>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn sm danger"
                          onClick={() => delContext(c.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="muted">
                      Nothing added yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="set-grid" style={{ marginTop: 12 }}>
            <div>
              <label>Add transcript / note — title</label>
              <input
                value={ctxAdd.title}
                placeholder="e.g. Strategy call 2026-07-01"
                onChange={(e) => setCtxAdd({ ...ctxAdd, title: e.target.value })}
              />
              <label>Content</label>
              <textarea
                value={ctxAdd.content}
                placeholder="Paste the transcript or notes"
                onChange={(e) => setCtxAdd({ ...ctxAdd, content: e.target.value })}
              />
              <label>Guidance for the AI (optional but recommended)</label>
              <textarea
                value={ctxAdd.guidance}
                placeholder="Tell the AI how to use this — e.g. 'Focus on their push into regulated markets; ignore the pricing chat, that's out of date.'"
                style={{ minHeight: 54 }}
                onChange={(e) => setCtxAdd({ ...ctxAdd, guidance: e.target.value })}
              />
              <button className="btn sm" style={{ marginTop: 6 }} onClick={addContext}>
                Add note / transcript
              </button>
            </div>
            <div>
              <label>Or upload a file</label>
              <input
                type="file"
                accept=".txt,.md,.csv,.json,.html,.htm,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFileObj(e.target.files?.[0] || null)}
              />
              <label>Guidance for the AI (optional but recommended)</label>
              <textarea
                value={fileGuidance}
                placeholder="How should the AI use this file? e.g. 'This is the brand messaging doc — keep all recommendations consistent with this tone of voice.'"
                style={{ minHeight: 54 }}
                onChange={(e) => setFileGuidance(e.target.value)}
              />
              <button className="btn sm" onClick={addContextFile}>
                Upload &amp; add file
              </button>
              <div className="legend-note">
                Reads <b>PDF, Word (.docx), .txt, .md, .csv and .html</b> — the text is
                extracted in your browser and stored as context. Scanned/image-only PDFs
                and legacy .doc aren&#39;t supported (save as .docx or paste the text).
              </div>
            </div>
          </div>
          <div className="legend-note" style={{ marginTop: 6 }}>
            <b>Human-in-the-loop:</b> the guidance you add against each item is passed to
            the AI as a priority steer whenever it tailors opportunities or suggests
            prompts — so your judgement shapes its recommendations, not just the raw
            documents.
          </div>
        </div>
        </div>
        </>
      )}

      {section === "admin" && (
        <>
          <div className="card stack" style={{ marginBottom: 16 }}>
            <h3>Clients</h3>
            <div className="legend-note">
              A short form: who the client is, who buys, and starter questions drafted from it.
              Then finish Client setup and run its first monthly check.
            </div>
            <div className="flex">
              <button className="btn sm" onClick={() => setWizard(true)} disabled={wizard}>
                + Add a client
              </button>
            </div>
          </div>
          {wizard && <NewClientWizard onDone={() => setWizard(false)} />}
      {/* Users & access (account-wide) */}
      <UsersAdmin />
      {/* AI spend (account-wide, admins) */}
      <AiSpendPanel />
          <div className="set-grid" style={{ marginBottom: 16 }}>
        {/* Metric weights */}
        <div className="card">
          <h3>
            Metric weights — total{" "}
            <span className={mwTot === 100 ? "" : "prio-md"}>{mwTot}</span>/100
          </h3>
          {METRIC_KEYS.map((k) => (
            <div className="wrow" key={k}>
              <label>{METRIC_LABELS[k]}</label>
              <input
                type="number"
                value={mw[k] ?? 0}
                onChange={(e) => setMw({ ...mw, [k]: +e.target.value || 0 })}
              />
            </div>
          ))}
          <button className="btn sm" onClick={saveMetricWeights}>
            Save metric weights
          </button>
        </div>
        {/* Engine weights */}
        <div className="card">
          <h3>
            Engine weights — total{" "}
            <span className={ewTot === 100 ? "" : "prio-md"}>{ewTot}</span>/100
          </h3>
          {ENGINES.map((en) => (
            <div className="wrow" key={en}>
              <label>{en}</label>
              <input
                type="number"
                value={ew[en] ?? 0}
                onChange={(e) => setEw({ ...ew, [en]: +e.target.value || 0 })}
              />
            </div>
          ))}
          <button className="btn sm" onClick={saveEngineWeights}>
            Save engine weights
          </button>
        </div>
          </div>
          <div className="stack">
        {/* AI engines & measurement */}
        <div className="card stack" style={{ gridColumn: "1/-1" }}>
          <h3>AI engines &amp; measurement</h3>
          <div className="legend-note">
            Every question is put to each live engine with web search, several times over, and
            the answers are compared to give a <b>confidence</b> rating. A monthly check runs
            automatically on the 1st for every active client (skipped if the client was checked
            in the previous 7 days).
          </div>
          <div className="flex" style={{ marginTop: 8 }}>
            {ENGINES.map((en) => {
              const live = engines[en];
              return (
                <span key={en} className={`tag ${live ? "t-yes" : "t-na"}`}>
                  {en} {live ? "● live" : "○ not connected"}
                </span>
              );
            })}
          </div>
          <div className="wrow" style={{ marginTop: 10, maxWidth: 420 }}>
            <label htmlFor="samples-per-question">Times each question is asked — {brand.name}</label>
            <select
              style={{ width: "auto", minWidth: 280 }}
              id="samples-per-question"
              value={samples}
              onChange={(e) => setSamples(+e.target.value)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === 1 ? " (cheapest, no confidence rating)" : n === 3 ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="legend-note">
            Saved for this client and used by the automatic monthly check too. Each extra time
            adds one web-searched answer per question per engine, so 3 costs about three times
            as much as 1.
          </div>
          <div className="legend-note">
            An engine that isn&#39;t connected is left out of the score rather than counted as
            zero. Connecting one needs its API key adding by whoever manages the Supabase
            project.
            <br />
            <b>Microsoft Copilot isn&#39;t measured:</b> it has no public API. It runs on
            OpenAI models with Bing search, so ChatGPT is the closest guide to it.
          </div>
        </div>
        {/* Data tools */}
        <div className="card stack" style={{ gridColumn: "1/-1" }}>
          <h3>Enter answers by hand</h3>
          <div className="legend-note">
            Only for answers you collect yourself (for example from an engine that isn&#39;t connected). Adds blank rows to fill in on AI answers → Review / override, only for question × connected engine pairs that don&#39;t
            have one yet — it never overwrites or deletes existing responses.
          </div>
          <div className="flex">
            <button className="btn sm" onClick={generateCapture}>
              Add blank rows to fill in
            </button>
          </div>
        </div>
        {/* Danger zone */}
        <div
          className="card stack"
          style={{ gridColumn: "1/-1", borderColor: "#f0d4d4" }}
        >
          <h3 style={{ color: "var(--red)" }}>Archive or delete client</h3>
          <div className="legend-note">
            <b>Archive</b> hides this client from the brand switcher but keeps all their
            data — restore any time. <b>Delete</b> permanently removes the client and
            every run, prompt, response, PR record, mention and context item. Deletion
            cannot be undone.
          </div>
          <div className="flex" style={{ marginTop: 10 }}>
            <button className="btn sm ghost" onClick={archiveClient}>
              Archive {brand.name}
            </button>
            <button className="btn sm danger" onClick={() => deleteClient()}>
              Delete {brand.name} permanently
            </button>
          </div>
          {archivedBrands.length > 0 && (
            <div
              style={{
                marginTop: 14,
                borderTop: "1px solid var(--line)",
                paddingTop: 12,
              }}
            >
              <h3 style={{ color: "var(--muted)" }}>
                Archived clients ({archivedBrands.length})
              </h3>
              <table>
                <tbody>
                  {archivedBrands.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.name}
                        {a.is_client ? <span className="muted"> (client)</span> : ""}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="btn sm ghost"
                          onClick={() => restoreClient(a.id)}
                        >
                          Restore
                        </button>{" "}
                        <button
                          className="btn sm danger"
                          onClick={() => deleteClient(a.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
          </div>
        </>
      )}
    </>
  );
}
