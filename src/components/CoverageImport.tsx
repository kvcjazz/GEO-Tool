"use client";

import { useState } from "react";
import { useAppState } from "@/state/AppState";
import { parseCsv, toCsv } from "@/lib/csv";
import { buildImport, TEMPLATE_HEADER, type ImportRow } from "@/lib/coverageImport";
import { placementImpact, type V2Answer } from "@/lib/prImpact";
import { applyCitationLinks, citationLinks } from "@/lib/prLinks";
import { todayISO } from "@/lib/format";
import type { PrActivity } from "@/lib/types";

// Bulk coverage import: upload (or paste) a spreadsheet of coverage links,
// check the preview, import, and see straight away which pieces the AI
// engines already cite — matched against every check measured so far.

type Summary = {
  imported: number;
  cited: { outlet: string; url: string; answers: number; engines: string[] }[];
  outletUp: number;
  waiting: number;
  homepage: number;
};

export default function CoverageImport({ answers }: { answers: V2Answer[] | null }) {
  const { brand, data, sb, toast, reload } = useAppState();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (!brand) return null;

  function load(text: string, name: string) {
    const { rows: parsed, headerFound } = buildImport(parseCsv(text), data.pr, todayISO());
    if (!headerFound) {
      setRows(null);
      return toast(
        "Couldn't find a link column. Use the template, or name the column “url” or “link”.",
      );
    }
    if (!parsed.length) return toast("No rows found");
    setFileName(name);
    setRows(parsed);
    setSummary(null);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (!/\.(csv|txt|tsv)$/i.test(f.name)) {
      return toast("Please export the sheet as CSV first (File → Download → .csv)");
    }
    load(await f.text(), f.name);
  }

  function downloadTemplate() {
    const csv = toCsv([
      TEMPLATE_HEADER,
      ["https://www.example.com/news/client-story", "2026-10-26", "Example News", "AI in insurance", "Tier 1", "Earned coverage"],
    ]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "coverage-import-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const ready = (rows || []).filter((r) => !r.errors.length && !r.duplicate);
  const dupes = (rows || []).filter((r) => r.duplicate && !r.errors.length).length;
  const bad = (rows || []).filter((r) => r.errors.length).length;

  async function importRows() {
    if (!ready.length) return;
    setBusy(true);
    const added: PrActivity[] = [];
    try {
      for (let i = 0; i < ready.length; i += 100) {
        const chunk = ready.slice(i, i + 100).map((r) => ({
          brand_id: brand!.id,
          activity_date: r.activity_date,
          outlet: r.outlet,
          url: r.url,
          theme: r.theme,
          tier: r.tier,
          atype: r.atype,
          cited: false,
        }));
        const { data: ins, error } = await sb.from("geo_pr_activity").insert(chunk).select("*");
        if (error) throw new Error(error.message);
        added.push(...((ins || []) as PrActivity[]));
      }
      // Check each new placement against every check measured so far.
      const links = citationLinks(added, data.responses, answers);
      await applyCitationLinks(sb, links);
      const names = [brand!.name, ...(brand!.aliases || [])];
      const impacts = answers ? added.map((p) => placementImpact(p, answers, data.prompts, names)) : [];
      setSummary({
        imported: added.length,
        cited: impacts
          .filter((i) => i.articleHits.length)
          .map((i) => ({
            outlet: i.pr.outlet,
            url: i.pr.url || "",
            answers: i.articleHits.length,
            engines: [...new Set(i.articleHits.map((h) => h.engine))],
          }))
          .sort((a, b) => b.answers - a.answers),
        outletUp: impacts.filter((i) => i.status === "outlet_up").length,
        waiting: impacts.filter((i) => i.status === "waiting").length,
        homepage: impacts.filter((i) => !i.articleUrl).length,
      });
      setRows(null);
      setPaste("");
      toast(`${added.length} placements imported`);
    } catch (e) {
      toast(
        `Import stopped: ${String(e)}` + (added.length ? ` (${added.length} were imported first)` : ""),
      );
    }
    setBusy(false);
    await reload();
  }

  const preview = rows ? (showAll ? rows : rows.slice(0, 15)) : [];

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>Import coverage in bulk</h3>
      <div className="legend-note" style={{ marginTop: 0 }}>
        Upload a CSV of coverage links, for example when setting up a new client. Only the
        link is required; date, outlet, theme, tier and type are used when present (common
        column names like “Link”, “Publication” and “Date published” are recognised). Each
        piece is checked against every AI check measured so far as soon as it&#39;s imported.{" "}
        <button type="button" className="linkbtn" onClick={downloadTemplate}>
          Download the template
        </button>
      </div>

      <div className="flex" style={{ marginTop: 10, flexWrap: "wrap", gap: 10 }}>
        <label className="btn sm" style={{ cursor: "pointer" }}>
          Choose CSV file
          <input
            type="file"
            accept=".csv,.txt,.tsv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <span className="muted" style={{ fontSize: 12 }}>
          or paste rows (with a header line, or just one link per line):
        </span>
      </div>
      <textarea
        rows={3}
        value={paste}
        placeholder={"url,date,outlet\nhttps://www.outlet.com/story,26/10/2026,Outlet"}
        onChange={(e) => setPaste(e.target.value)}
        style={{ marginTop: 8 }}
      />
      {paste.trim() && !rows && (
        <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => load(paste, "pasted rows")}>
          Preview pasted rows
        </button>
      )}

      {rows && (
        <div style={{ marginTop: 12 }}>
          <div className="legend-note">
            <b>{fileName}</b>: {rows.length} rows — <b>{ready.length} ready to import</b>
            {dupes > 0 && <>, {dupes} already logged (skipped)</>}
            {bad > 0 && <>, {bad} with problems (skipped — fix and re-upload to add them)</>}.
          </div>
          <div style={{ overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Date</th>
                  <th>Outlet</th>
                  <th>Link</th>
                  <th>Theme</th>
                  <th>Tier</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.line} style={r.errors.length || r.duplicate ? { opacity: 0.6 } : undefined}>
                    <td>{r.line}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.activity_date}</td>
                    <td>{r.outlet}</td>
                    <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.url}
                    </td>
                    <td>{r.theme || ""}</td>
                    <td>{r.tier}</td>
                    <td style={{ fontSize: 12 }}>
                      {r.errors.length ? (
                        <span style={{ color: "var(--red)" }}>{r.errors.join("; ")}</span>
                      ) : r.duplicate ? (
                        <span className="muted">Already logged</span>
                      ) : (
                        <span className="muted">{r.notes.join("; ") || "Ready"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 15 && (
            <button type="button" className="linkbtn" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show fewer" : `Show all ${rows.length} rows`}
            </button>
          )}
          <div className="flex" style={{ marginTop: 10 }}>
            <button className="btn sm" disabled={busy || !ready.length} onClick={importRows}>
              {busy ? "Importing and checking…" : `Import ${ready.length} placement${ready.length === 1 ? "" : "s"}`}
            </button>
            <button className="btn sm ghost" disabled={busy} onClick={() => setRows(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {summary && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <b>
            Imported {summary.imported} placement{summary.imported === 1 ? "" : "s"}.
          </b>{" "}
          {summary.cited.length
            ? `${summary.cited.length} ${summary.cited.length === 1 ? "is" : "are"} already cited as a source in AI answers:`
            : answers?.length
              ? "None is cited in the AI answers measured so far."
              : "No AI checks measured yet to compare against."}
          {summary.cited.length > 0 && (
            <ul style={{ margin: "6px 0 0 18px", fontSize: 13 }}>
              {summary.cited.slice(0, 10).map((c) => (
                <li key={c.url}>
                  <b>{c.outlet}</b> — cited in {c.answers} answer{c.answers === 1 ? "" : "s"} (
                  {c.engines.join(", ")})
                </li>
              ))}
            </ul>
          )}
          <div className="legend-note">
            {summary.outletUp > 0 && <>{summary.outletUp} outlets are cited more since the piece ran. </>}
            {summary.waiting > 0 && (
              <>
                {summary.waiting} were published after the latest check — they&#39;ll be measured
                in the next one.{" "}
              </>
            )}
            {summary.homepage > 0 && (
              <>{summary.homepage} have home-page links, so only the outlet can be matched. </>
            )}
            The full results are in “Impact of each placement” above.
          </div>
        </div>
      )}
    </div>
  );
}
