"use client";

import { useMemo, useState } from "react";
import { useAppState } from "@/state/AppState";
import { MARKETS } from "@/lib/factSheet";
import { starterQuestions } from "@/lib/starterQuestions";

// Admin → Add a client. Replaces "type a name, get 8 template questions that
// mostly name the client": one short form captures what the measurement and
// the AI suggestions need, and drafts starter questions that are mostly
// unbranded, so "Found by new buyers" has something to measure from day one.

const EMPTY = {
  name: "",
  website: "",
  sector: "",
  market: "",
  audience: "",
  positioning: "",
  themes: "",
  competitors: "",
};

export default function NewClientWizard({ onDone }: { onDone: () => void }) {
  const { sb, toast, loadBrands, selectBrand, setView } = useAppState();
  const [f, setF] = useState(EMPTY);
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  // Starter questions the team has unticked or edited, by position.
  const [off, setOff] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Record<number, string>>({});

  const marketName = MARKETS.find(([c]) => c === f.market)?.[1] || "";
  const competitors = f.competitors
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const drafts = useMemo(
    () =>
      starterQuestions({
        name: f.name,
        sector: f.sector,
        audience: f.audience,
        themes: f.themes,
        market: marketName,
        competitors,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.name, f.sector, f.audience, f.themes, marketName, f.competitors],
  );
  const chosen = drafts
    .map((q, i) => ({ ...q, text: (edits[i] ?? q.text).trim(), i }))
    .filter((q) => !off.has(q.i) && q.text);
  const unbranded = chosen.filter((q) => !q.branded).length;

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function create() {
    const name = f.name.trim();
    if (!name) return toast("The client needs a name");
    setBusy(true);
    const { data: b, error } = await sb
      .from("geo_brands")
      .insert({
        name,
        is_client: true,
        website: f.website.trim() || null,
        sector: f.sector.trim() || null,
        market_country: f.market || null,
        audience: f.audience.trim() || null,
        positioning: f.positioning.trim() || null,
        themes: f.themes.trim() || null,
      })
      .select()
      .single();
    if (error || !b) {
      setBusy(false);
      return toast("Client not created: " + (error?.message || "unknown error"));
    }
    if (competitors.length) {
      await sb.from("geo_competitors").insert(competitors.map((c) => ({ brand_id: b.id, name: c })));
    }
    if (chosen.length) {
      await sb.from("geo_prompts").insert(
        chosen.map((q, n) => ({
          brand_id: b.id,
          code: "P" + String(n + 1).padStart(2, "0"),
          ptype: q.ptype,
          text: q.text,
          sort: n + 1,
          active: true,
        })),
      );
    }
    toast(`${name} created with ${chosen.length} questions — finish Client setup, then run the first check`);
    setBusy(false);
    setF(EMPTY);
    setStep(1);
    onDone();
    await loadBrands();
    await selectBrand(b.id);
    setView("setup");
  }

  return (
    <div className="card stack" style={{ marginBottom: 16, borderLeft: "5px solid var(--blue)" }}>
      <h3>Add a client — step {step} of 2</h3>
      {step === 1 ? (
        <>
          <div className="set-grid">
            <div>
              <label htmlFor="nc-name">Client name *</label>
              <input id="nc-name" value={f.name} onChange={set("name")} placeholder="e.g. Hippo" />
            </div>
            <div>
              <label htmlFor="nc-site">Website</label>
              <input id="nc-site" value={f.website} onChange={set("website")} placeholder="https://" />
            </div>
            <div>
              <label htmlFor="nc-sector">What they are, in buyers&#39; words *</label>
              <input
                id="nc-sector"
                value={f.sector}
                onChange={set("sector")}
                placeholder="e.g. home insurance providers"
              />
            </div>
            <div>
              <label htmlFor="nc-market">Main market</label>
              <select id="nc-market" value={f.market} onChange={set("market")}>
                <option value="">Global / no single country</option>
                {MARKETS.map(([code, n]) => (
                  <option key={code} value={code}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="nc-aud">Who buys</label>
              <input
                id="nc-aud"
                value={f.audience}
                onChange={set("audience")}
                placeholder="e.g. first-time home buyers"
              />
            </div>
            <div>
              <label htmlFor="nc-comp">Main competitors (comma-separated)</label>
              <input id="nc-comp" value={f.competitors} onChange={set("competitors")} placeholder="e.g. Lemonade, Aviva" />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label htmlFor="nc-pos">How they want AI to describe them</label>
              <input
                id="nc-pos"
                value={f.positioning}
                onChange={set("positioning")}
                placeholder="e.g. the simplest home insurance for new homeowners"
              />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label htmlFor="nc-themes">Priority topics (comma-separated)</label>
              <input
                id="nc-themes"
                value={f.themes}
                onChange={set("themes")}
                placeholder="e.g. smart-home discounts, claims speed"
              />
            </div>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn sm"
              disabled={!f.name.trim() || !f.sector.trim()}
              title={!f.sector.trim() ? "Say what the client is, so the starter questions make sense" : undefined}
              onClick={() => setStep(2)}
            >
              Next: starter questions
            </button>
            <button type="button" className="btn sm ghost" onClick={onDone}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="legend-note" style={{ marginTop: 0 }}>
            Drafted from step 1. Most don&#39;t name {f.name.trim() || "the client"} on purpose: those
            measure whether new buyers find them. Edit or untick any, then add more later — or use ✨
            Suggest questions in Client setup for ones grounded in the strategy.
          </p>
          <ul className="starter-list">
            {drafts.map((q, i) => (
              <li key={i}>
                <input
                  type="checkbox"
                  checked={!off.has(i)}
                  aria-label={`Include question ${i + 1}`}
                  onChange={(e) =>
                    setOff((prev) => {
                      const n = new Set(prev);
                      if (e.target.checked) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                />
                <input
                  value={edits[i] ?? q.text}
                  aria-label={`Question ${i + 1}`}
                  onChange={(e) => setEdits({ ...edits, [i]: e.target.value })}
                />
                <span className={`tag ${q.branded ? "t-na" : "t-yes"}`}>{q.branded ? "names client" : "new buyers"}</span>
              </li>
            ))}
          </ul>
          <div className="legend-note">
            {chosen.length} question{chosen.length === 1 ? "" : "s"}, {unbranded} that don&#39;t name the
            client.
            {chosen.length && unbranded / chosen.length < 2 / 3 ? " Aim for at least two thirds that don't." : ""}
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <button type="button" className="btn sm" disabled={busy} onClick={create}>
              {busy ? "Creating…" : "Create client"}
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setStep(1)}>
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
