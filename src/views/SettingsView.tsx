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
import { stars, todayISO, monthLabel } from "@/lib/format";
import { ctxString } from "@/lib/context";
import { callFn } from "@/lib/callFn";
import { AdviseSuggestSchema } from "@/lib/schemas";
import { extractFileText } from "@/lib/fileText";
import type { Prompt } from "@/lib/types";
import type { Database } from "@/lib/database.types";
import { z } from "zod";

type ResponseInsert = Database["public"]["Tables"]["geo_responses"]["Insert"];

type Sugg = z.infer<typeof AdviseSuggestSchema>["prompts"];

export default function SettingsView() {
  const {
    brand,
    data,
    sb,
    toast,
    reload,
    loadBrands,
    selectBrand,
    setView,
    patchBrand,
    samples,
    setSamples,
    engines,
    archivedBrands,
  } = useAppState();

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
    is_client: false,
  });
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
  const [suggSource, setSuggSource] = useState("");
  const [suggPicks, setSuggPicks] = useState<Set<number>>(new Set());
  const [suggBusy, setSuggBusy] = useState(false);

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
      is_client: !!brand.is_client,
    });
    setMw(metricWeights(brand) as unknown as Record<string, number>);
    const e = engineWeights(brand);
    const eObj: Record<string, number> = {};
    ENGINES.forEach((en) => (eObj[en] = +(e[en] || 0)));
    setEw(eObj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand?.id]);

  if (!brand) return null;
  const mwTot = METRIC_KEYS.reduce((s, k) => s + (+mw[k] || 0), 0);
  const ewTot = ENGINES.reduce((s, en) => s + (+ew[en] || 0), 0);

  async function saveStrategy() {
    const upd = {
      objective: strategy.objective.trim(),
      audience: strategy.audience.trim(),
      positioning: strategy.positioning.trim(),
      themes: strategy.themes.trim(),
    };
    const { error } = await sb.from("geo_brands").update(upd).eq("id", brand!.id);
    if (error) return toast("Save failed");
    patchBrand(upd);
    toast("Strategy saved");
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
    const { error } = await sb.from("geo_brands").update(upd).eq("id", brand!.id);
    if (error) return toast("Save failed: " + error.message);
    patchBrand(upd);
    toast("PR profile saved");
  }

  async function saveBrandDetails() {
    const upd = {
      name: details.name.trim(),
      sector: details.sector.trim(),
      website: details.website.trim() || null,
      is_client: details.is_client,
    };
    const { error } = await sb.from("geo_brands").update(upd).eq("id", brand!.id);
    if (error) return toast("Save failed");
    patchBrand(upd);
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
    toast(error ? "Save failed" : "Prompt saved");
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
    toast("Prompt added");
    await reload();
  }

  async function delPrompt(id: string) {
    await sb.from("geo_prompts").delete().eq("id", id);
    toast("Deleted");
    await reload();
  }

  async function suggestPrompts() {
    setSuggBusy(true);
    setSugg([]);
    try {
      const j = await callFn(
        "geo-advise",
        {
          mode: "suggest",
          brand: brand!.name,
          website: brand!.website,
          context: ctxString(data.context),
          sector: brand!.sector,
          objective: brand!.objective,
          positioning: brand!.positioning,
          audience: brand!.audience,
          themes: brand!.themes,
          competitors: data.competitors.map((c) => c.name),
        },
        AdviseSuggestSchema,
      );
      const list = j.prompts || [];
      setSugg(list);
      setSuggSource(j.source || "");
      setSuggPicks(new Set(list.map((_, i) => i)));
    } catch (e) {
      toast("Couldn't fetch suggestions: " + String(e));
    }
    setSuggBusy(false);
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
      };
    });
    const { error } = await sb.from("geo_prompts").insert(rows);
    if (error) return toast("Failed: " + error.message);
    setSugg([]);
    toast(rows.length + " prompts added to the set");
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
    if (!active.length) return toast("Add prompts first");
    const have = new Set(
      data.currentRun ? data.responses.map((r) => r.prompt_id + "|" + r.engine) : [],
    );
    const rows: ResponseInsert[] = [];
    active.forEach((p) =>
      ENGINES.forEach((e) => {
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
    setView("capture");
  }

  async function createClient() {
    const name = window.prompt("New client name:");
    if (!name) return;
    const nm = name.trim();
    const { data: newBrand, error } = await sb
      .from("geo_brands")
      .insert({ name: nm, is_client: true })
      .select()
      .single();
    if (error || !newBrand) return toast("Failed");
    const bid = newBrand.id;
    await sb.from("geo_runs").insert({
      brand_id: bid,
      label: monthLabel() + " (Current)",
      run_date: todayISO(),
      is_current: true,
    });
    const starter: [string, string, string][] = [
      ["P01", "Category", "best " + nm + " alternatives"],
      ["P02", "Category", "top providers in " + nm + "'s category"],
      ["P03", "Comparison", nm + " vs competitors"],
      ["P04", "Brand/Entity", "what is " + nm],
      ["P05", "Brand/Entity", "is " + nm + " any good"],
      ["P06", "Brand/Entity", nm + " reviews"],
      ["P07", "Problem-led", "how to choose a provider in " + nm + "'s category"],
      ["P08", "Buying-intent", nm + " pricing"],
    ];
    await sb.from("geo_prompts").insert(
      starter.map((s, i) => ({
        brand_id: bid,
        code: s[0],
        ptype: s[1],
        text: s[2],
        sort: i,
        active: true,
      })),
    );
    toast(
      "Client scaffolded: starter run + 8 prompts. Add strategy, refine prompts, then Generate capture grid.",
    );
    await loadBrands();
    await selectBrand(bid);
    setView("settings");
  }

  async function archiveClient() {
    if (
      !window.confirm(
        "Archive " +
          brand!.name +
          "? It will be hidden from the brand switcher but all its data is kept and can be restored from Settings → Danger zone.",
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
    setView("settings");
  }

  async function restoreClient(id: string) {
    const { error } = await sb
      .from("geo_brands")
      .update({ archived: false })
      .eq("id", id);
    if (error) return toast("Restore failed: " + error.message);
    toast("Client restored");
    await loadBrands();
    setView("settings");
  }

  async function deleteClient(id?: string) {
    const bid = id || brand!.id;
    const nm =
      [...archivedBrands, brand!].find((b) => b?.id === bid)?.name || "this client";
    if (
      !window.confirm(
        "Permanently delete " +
          nm +
          " and ALL its data (runs, prompts, responses, PR, mentions, context)?\n\nThis cannot be undone.",
      )
    )
      return;
    if (!window.confirm("Last check — really delete " + nm + " forever?")) return;
    const { error } = await sb.rpc("geo_delete_brand", { bid });
    if (error) return toast("Delete failed: " + error.message);
    toast(nm + " deleted");
    await loadBrands();
    setView("settings");
  }

  return (
    <>
      <div className="sec-title">Settings — {brand.name}</div>
      <div className="sec-sub">
        Customise this client&#39;s strategy and GEO parameters. Changes save to the
        database.
      </div>

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
          Strategy shapes the prompt set you build and powers the ✨ AI guidance on the
          Opportunity Backlog.
        </div>
      </div>

      {/* Client PR Profile */}
      <div
        className="card stack"
        style={{ marginBottom: 16, borderLeft: "5px solid var(--blue)" }}
      >
        <h3>
          Client PR Profile{" "}
          <span className="muted" style={{ textTransform: "none", fontWeight: 500 }}>
            — powers the PR Planning radar
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

      <div className="set-grid">
        {/* Brand details */}
        <div className="card stack">
          <h3>Brand details</h3>
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
            own site is cited, and given to the AI for context.
          </div>
        </div>

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

        {/* Competitors */}
        <div className="card">
          <h3>Competitors</h3>
          <table>
            <tbody>
              {data.competitors.length ? (
                data.competitors.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
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

        {/* Prompt set */}
        <div className="card" style={{ gridColumn: "1/-1" }}>
          <h3>Prompt set ({prompts.length})</h3>
          <div style={{ overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Prompt</th>
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
                        onBlur={(e) => {
                          if (e.target.value !== p.text)
                            savePrompt(p.id, "text", e.target.value);
                        }}
                      />
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
                      <button className="btn sm danger" onClick={() => delPrompt(p.id)}>
                        Del
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex" style={{ marginTop: 10 }}>
            <input
              value={newPrompt}
              placeholder="New prompt text"
              style={{ flex: 1 }}
              onChange={(e) => setNewPrompt(e.target.value)}
            />
            <button className="btn sm" onClick={addPrompt}>
              Add prompt
            </button>
          </div>
          <div
            style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}
          >
            <button className="btn sm" onClick={suggestPrompts} disabled={suggBusy}>
              {suggBusy ? "✨ Thinking…" : "✨ Suggest prompts from strategy"}
            </button>{" "}
            <span className="muted" style={{ fontSize: 12 }}>
              Ranked by impact on this client&#39;s strategy; you pick which to add to
              your existing prompts.
            </span>
            {sugg && sugg.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="legend-note">
                  Source: {suggSource === "ai" ? "AI-generated" : "strategy template"}.
                  Ranked by impact on this client&#39;s strategy — tick the ones to add.
                </div>
                <div style={{ overflow: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        <th>Type</th>
                        <th>Suggested prompt</th>
                        <th>Impact</th>
                        <th>Why it matters to the strategy</th>
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
                          <td style={{ minWidth: 200 }}>{p!.text}</td>
                          <td
                            style={{ color: "#C9871B", whiteSpace: "nowrap" }}
                            title={`Impact ${p!.impact}/5`}
                          >
                            {stars(Number(p!.impact))}
                          </td>
                          <td className="muted" style={{ minWidth: 240 }}>
                            {p!.reason}
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
                  Add selected to prompt set
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Strategy context */}
        <div className="card" style={{ gridColumn: "1/-1" }}>
          <h3>Strategy context, transcripts &amp; files ({data.context.length})</h3>
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

        {/* AI engines & measurement */}
        <div className="card stack" style={{ gridColumn: "1/-1" }}>
          <h3>AI engines &amp; measurement</h3>
          <div className="legend-note">
            Live engines are queried automatically; the others switch on the moment their
            API key is added. Every auto-run samples each prompt several times and records
            a <b>confidence</b> rating. A <b>monthly snapshot</b> runs automatically on the
            1st.
          </div>
          <div className="flex" style={{ marginTop: 8 }}>
            {ENGINES.map((en) => {
              const live = engines[en];
              return (
                <span key={en} className={`tag ${live ? "t-yes" : "t-na"}`}>
                  {en} {live ? "● live" : "○ needs key"}
                </span>
              );
            })}
          </div>
          <div className="wrow" style={{ marginTop: 10, maxWidth: 340 }}>
            <label>Samples per prompt</label>
            <input
              type="number"
              min={1}
              max={5}
              value={samples}
              onChange={(e) =>
                setSamples(Math.max(1, Math.min(5, +e.target.value || 3)))
              }
            />
          </div>
          <div className="legend-note">
            To add an engine, put its key in Supabase → Project Settings → Edge Functions
            secrets: <b>OPENAI_API_KEY</b>, <b>GEMINI_API_KEY</b>,{" "}
            <b>PERPLEXITY_API_KEY</b>, <b>XAI_API_KEY</b>. Perplexity returns real
            citations.
          </div>
        </div>

        {/* Data tools */}
        <div className="card stack" style={{ gridColumn: "1/-1" }}>
          <h3>Data tools</h3>
          <div className="legend-note">
            Adds blank capture rows only for prompt × engine combinations that don&#39;t
            have one yet — it never overwrites or deletes existing responses.
          </div>
          <div className="flex">
            <button className="btn sm" onClick={generateCapture}>
              Generate / refresh capture grid
            </button>
            <button className="btn sm ghost" onClick={createClient}>
              + Create new client
            </button>
          </div>
        </div>

        {/* Danger zone */}
        <div
          className="card stack"
          style={{ gridColumn: "1/-1", borderColor: "#f0d4d4" }}
        >
          <h3 style={{ color: "var(--red)" }}>Danger zone — manage this client</h3>
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
  );
}
