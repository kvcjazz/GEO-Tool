"use client";

import { useState } from "react";
import { useAppState } from "@/state/AppState";
import { Kpi } from "@/components/ui";
import { host, todayISO } from "@/lib/format";
import { rawUrls } from "@/lib/targets";
import {
  isArticleUrl,
  placementImpact,
  prCitedShare,
  sameArticle,
  type PlacementImpact,
  type Rate,
} from "@/lib/prImpact";
import { useV2Answers } from "@/state/useV2Answers";

const STATUS: Record<PlacementImpact["status"], { label: string; cls: string }> = {
  cited: { label: "Article cited by AI", cls: "t-yes" },
  outlet_up: { label: "Outlet cited more", cls: "t-yes" },
  waiting: { label: "Awaiting next check", cls: "t-na" },
  not_yet: { label: "Not cited yet", cls: "t-na" },
};

function fmtRate(r: Rate | null): string {
  return r ? r.pct + "%" : "–";
}

/** "12% → 25%" with the change, or a dash when there's no like-for-like pair. */
function Shift({ a, b }: { a: Rate | null; b: Rate | null }) {
  if (!a || !b) return <span className="muted">{b ? fmtRate(b) + " now" : "–"}</span>;
  const d = b.pct - a.pct;
  return (
    <span title={`${a.named}/${a.answers} → ${b.named}/${b.answers} answers`}>
      {fmtRate(a)} → {fmtRate(b)}{" "}
      <b style={{ color: d > 0 ? "var(--green)" : d < 0 ? "var(--red)" : "var(--muted)" }}>
        {d > 0 ? "+" : ""}
        {d}
      </b>
    </span>
  );
}

export default function PRView() {
  const { brand, data, mode, sb, toast, reload } = useAppState();
  const answers = useV2Answers();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    date: todayISO(),
    outlet: "",
    url: "",
    theme: "",
    tier: "Tier 2",
    atype: "Earned coverage",
  });

  if (!brand) return null;
  const ro = mode === "client";
  const t1 = data.pr.filter((p) => p.tier === "Tier 1").length;
  const byP: Record<string, (typeof data.prompts)[number]> = {};
  data.prompts.forEach((p) => (byP[p.id] = p));
  const wallRows = data.responses.filter((r) => r.cited_pr_id);
  const brandWords = [brand.name, ...(brand.aliases || [])];
  const impacts = answers
    ? [...data.pr]
        .sort((a, b) => b.activity_date.localeCompare(a.activity_date))
        .map((p) => placementImpact(p, answers, data.prompts, brandWords))
    : [];
  const articlesCited = impacts.filter((i) => i.articleHits.length).length;
  const share = answers ? prCitedShare(data.pr, answers) : null;

  /**
   * Links answers in the current check to the placement they cite: the exact
   * article where the placement has an article URL, otherwise the outlet's
   * site. Placements cited in any check since publication are flagged.
   */
  async function recheckCitations(showToast: boolean) {
    let linked = 0;
    const toLink: { id: string; pr: string }[] = [];
    const flag = new Set<string>(impacts.filter((i) => i.articleHits.length).map((i) => i.pr.id));
    data.pr.forEach((p) => {
      const d = host(p.url);
      if (!d) return;
      const article = isArticleUrl(p.url);
      data.responses.forEach((r) => {
        const hit = article
          ? rawUrls(r.raw).some((u) => sameArticle(u, p.url!))
          : !!r.cited_sources && r.cited_sources.toLowerCase().includes(d);
        if (hit) {
          flag.add(p.id);
          if (r.cited_pr_id !== p.id) toLink.push({ id: r.id, pr: p.id });
        }
      });
    });
    for (const u of toLink) {
      const { error } = await sb
        .from("geo_responses")
        .update({ cited_pr_id: u.pr })
        .eq("id", u.id);
      if (!error) linked++;
    }
    for (const id of flag) {
      await sb.from("geo_pr_activity").update({ cited: true }).eq("id", id);
    }
    if (showToast)
      toast(
        linked
          ? "Linked " + linked + " citation" + (linked > 1 ? "s" : "") + " to PR"
          : "No new citations matched (sources are recorded by each monthly check)",
      );
    await reload();
  }

  async function addPR() {
    if (!form.outlet.trim()) return toast("Outlet required");
    setBusy(true);
    const rec = {
      brand_id: brand!.id,
      activity_date: form.date,
      outlet: form.outlet.trim(),
      url: form.url.trim() || null,
      theme: form.theme.trim() || null,
      tier: form.tier,
      atype: form.atype,
      cited: false,
    };
    const { error } = await sb.from("geo_pr_activity").insert(rec);
    if (error) {
      setBusy(false);
      return toast("Failed");
    }
    await reload();
    await recheckCitations(false);
    setForm({
      date: todayISO(),
      outlet: "",
      url: "",
      theme: "",
      tier: "Tier 2",
      atype: "Earned coverage",
    });
    setBusy(false);
    toast("Placement added");
  }

  async function delPR(id: string) {
    await sb.from("geo_pr_activity").delete().eq("id", id);
    toast("Removed");
    await reload();
  }

  return (
    <>
      <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
        <Kpi l="PR placements" v={data.pr.length} />
        <Kpi l="Tier-1 placements" v={t1} />
        <Kpi l="Articles cited by AI" v={articlesCited} />
        <Kpi l="% of latest answers citing your PR" v={share ? share.pct : 0} />
      </div>
      {!ro && (
        <div style={{ marginBottom: 12 }}>
          <button
            className="btn sm"
            disabled={busy || !answers}
            onClick={() => recheckCitations(true)}
          >
            🔄 Re-check citations now
          </button>{" "}
          <span className="muted" style={{ fontSize: 12 }}>
            Matches each placement&#39;s article link against the sources cited in the AI
            answers; a home-page link can only be matched to the outlet.
          </span>
        </div>
      )}
      <div className="card" style={{ overflow: "auto" }}>
        <h3>Impact of each placement</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Outlet</th>
              <th>Theme</th>
              <th>Result</th>
              <th title="Answers since publication that cite this exact article">Article cited in</th>
              <th title="Share of answers citing the outlet's site: last check before → latest check, same questions and engines">
                Outlet cited
              </th>
              <th title="How often the client is named on tracked questions that share this placement's topic: before → after">
                Named on related questions
              </th>
              {!ro && <th></th>}
            </tr>
          </thead>
          <tbody>
            {!answers ? (
              <tr>
                <td colSpan={8} className="muted">
                  Loading the checks…
                </td>
              </tr>
            ) : impacts.length ? (
              impacts.map((i) => {
                const st = STATUS[i.status];
                const expanded = open === i.pr.id;
                const engines = [...new Set(i.articleHits.map((h) => h.engine))];
                return (
                  <tr key={i.pr.id}>
                    <td>{i.pr.activity_date}</td>
                    <td>
                      {i.pr.url ? (
                        <a href={i.pr.url} target="_blank" rel="noreferrer">
                          {i.pr.outlet}
                        </a>
                      ) : (
                        i.pr.outlet
                      )}
                      {i.pr.tier && <div className="muted" style={{ fontSize: 11 }}>{i.pr.tier}</div>}
                    </td>
                    <td>{i.pr.theme || ""}</td>
                    <td>
                      <span className={`tag ${st.cls}`}>{st.label}</span>
                      {i.status === "waiting" && (
                        <div className="muted" style={{ fontSize: 11 }}>
                          No check since {i.pr.activity_date}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {!i.articleUrl ? (
                        <span className="muted" title="Add the article's own link to match it exactly">
                          Home-page link — add the article URL
                        </span>
                      ) : i.articleHits.length ? (
                        <>
                          <button
                            type="button"
                            className="linkbtn"
                            onClick={() => setOpen(expanded ? null : i.pr.id)}
                          >
                            {i.articleHits.length} answer{i.articleHits.length === 1 ? "" : "s"} ·{" "}
                            {engines.join(", ")}
                          </button>
                          {expanded &&
                            i.articleHits.map((h, idx) => (
                              <div key={idx} className="muted">
                                {h.engine} · &#39;{byP[h.prompt_id]?.text || ""}&#39;
                              </div>
                            ))}
                        </>
                      ) : (
                        <span className="muted">Not yet</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      {i.outletDomain ? <Shift a={i.outletBefore} b={i.outletAfter} /> : "–"}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {i.related.length ? (
                        <>
                          <Shift a={i.relatedBefore} b={i.relatedAfter} />
                          <div
                            className="muted"
                            style={{ fontSize: 11 }}
                            title={i.related.map((id) => byP[id]?.text || "").join("\n")}
                          >
                            {i.related.length} question{i.related.length === 1 ? "" : "s"} on{" "}
                            {i.keywords.slice(0, 4).join(", ")}
                          </div>
                        </>
                      ) : (
                        <span className="muted" title="Add a theme to this placement to link it to tracked questions">
                          No matching questions
                        </span>
                      )}
                    </td>
                    {!ro && (
                      <td>
                        <button className="btn sm danger" onClick={() => delPR(i.pr.id)}>
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="muted">
                  No PR logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="legend-note">
          <b>How to read this.</b> &quot;Article cited&quot; is direct proof: an AI engine
          used the coverage as a source. The before → after columns compare the last
          check before publication with the latest check, on the same questions and
          engines (a check on the publication day counts as before). They show
          association, not proof: other activity and normal variation between checks
          also move them. Only checks made with the current measurement method (live
          web search, no brand in the question) are used.
        </div>
      </div>

      {wallRows.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Your PR, quoted in AI answers</h3>
          {wallRows.map((r) => {
            const pr = data.pr.find((x) => x.id === r.cited_pr_id);
            return (
              <div
                key={r.id}
                style={{
                  borderLeft: "4px solid var(--green)",
                  background: "#f3faf6",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 13 }}>{r.evidence || ""}</div>
                <div className="legend-note" style={{ marginTop: 4 }}>
                  <b>{r.engine}</b> · &#39;{byP[r.prompt_id]?.text || ""}&#39; · cited
                  source: <b>{pr ? pr.outlet : ""}</b>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!ro && (
        <div id="log-placement" className="card" style={{ marginTop: 16, scrollMarginTop: 80 }}>
          <h3>Log a PR placement</h3>
          <div className="set-grid">
            <div>
              <label>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div>
              <label>Outlet</label>
              <input
                placeholder="e.g. TechCrunch"
                value={form.outlet}
                onChange={(e) => setForm({ ...form, outlet: e.target.value })}
              />
            </div>
            <div>
              <label>URL</label>
              <input
                placeholder="https://"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </div>
            <div>
              <label>Theme</label>
              <input
                placeholder="e.g. AI, fintech, security"
                value={form.theme}
                onChange={(e) => setForm({ ...form, theme: e.target.value })}
              />
            </div>
            <div>
              <label>Tier</label>
              <select
                value={form.tier}
                onChange={(e) => setForm({ ...form, tier: e.target.value })}
              >
                <option>Tier 1</option>
                <option>Tier 2</option>
                <option>Tier 3</option>
              </select>
            </div>
            <div>
              <label>Type</label>
              <select
                value={form.atype}
                onChange={(e) => setForm({ ...form, atype: e.target.value })}
              >
                <option>Earned coverage</option>
                <option>Review/Listing</option>
                <option>Community</option>
                <option>Owned</option>
              </select>
            </div>
          </div>
          <button
            className="btn sm"
            style={{ marginTop: 10 }}
            disabled={busy}
            onClick={addPR}
          >
            Add &amp; auto-check citations
          </button>
          <div className="legend-note">
            Use the article&#39;s own link (not the outlet&#39;s home page) and a theme, so
            the tool can find the article in AI answers and compare the questions on
            that topic before and after.
          </div>
        </div>
      )}
    </>
  );
}
