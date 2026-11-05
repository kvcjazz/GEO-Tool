"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/state/AppState";
import { AREAS, ENGINES } from "@/lib/constants";
import type { Area } from "@/lib/constants";
import { setupSteps } from "@/lib/setup";
import DashboardView from "@/views/DashboardView";
import CaptureView from "@/views/CaptureView";
import BacklogView from "@/views/BacklogView";
import PlanningView from "@/views/PlanningView";
import SourcesView from "@/views/SourcesView";
import PRView from "@/views/PRView";
import ListeningView from "@/views/ListeningView";
import SettingsView from "@/views/SettingsView";
import TargetsView from "@/views/TargetsView";
import ReportView from "@/views/ReportView";
import ClientsView from "@/views/ClientsView";
import ClientSwitcher, { ClientBadge } from "@/components/ClientSwitcher";
import { computeAll } from "@/lib/scoring";
import { r1 } from "@/lib/format";

/** What renders for each area (and tab, where an area has tabs). */
function AreaBody({ area, tab }: { area: string; tab: string }) {
  switch (area) {
    case "clients":
      return <ClientsView />;
    case "answers":
      return tab === "sources" ? <SourcesView /> : tab === "mentions" ? <ListeningView /> : <CaptureView />;
    case "plan":
      return tab === "actions" ? <BacklogView /> : tab === "titles" ? <TargetsView /> : <PlanningView />;
    case "coverage":
      return <PRView />;
    case "report":
      return <ReportView />;
    case "setup":
      return <SettingsView section="setup" />;
    case "admin":
      return <SettingsView section="admin" />;
    default:
      return <DashboardView />;
  }
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function Shell() {
  const {
    ready,
    userEmail,
    mode,
    view,
    tab,
    setView,
    setMode,
    brand,
    data,
    engines,
    jobs,
    startSnapshot,
    remeasure,
    stopMeasuring,
    measureNewQuestions,
    unmeasured,
    missingMeasurements,
    liveEngineCount,
    samples,
    signOut,
    toastMsg,
    toastShow,
  } = useAppState();

  const client = mode === "client";
  const [switching, setSwitching] = useState(false);

  // ⌘K / Ctrl+K opens the client switcher (team view only: presenting to a
  // client must never show the others).
  useEffect(() => {
    if (client) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSwitching((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [client]);
  const score =
    brand && data.responses.length ? r1(computeAll(brand, data.responses).blended.geo) : null;
  const area = AREAS.find((a) => a.id === view) || AREAS[0];
  const visible = AREAS.filter((a) => !client || a.client);

  const live = ENGINES.filter((e) => engines[e]);
  const offline = ENGINES.filter((e) => !engines[e]);
  const inFlight = jobs.filter((j) => j.status === "pending" || j.status === "sent").length;

  const newIdeas = data.radar.filter((r) => r.status === "new").length;
  const toFix = brand
    ? setupSteps(brand, data).filter((s) => s.status === "attention").length
    : 0;
  const badge = (a: Area): string =>
    a.id === "plan" && !client && newIdeas
      ? `${newIdeas} new`
      : a.id === "setup" && toFix
        ? `${toFix} to fix`
        : "";

  function runAction() {
    switch (area.action?.kind) {
      case "snapshot":
        return startSnapshot();
      case "remeasure":
        return remeasure();
      case "logPlacement":
        return document
          .getElementById("log-placement")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const navButton = (a: Area) => {
    const active = a.id === view;
    const b = badge(a);
    return (
      <button
        key={a.id}
        type="button"
        className={`nav-item${active ? " active" : ""}`}
        aria-current={active ? "page" : undefined}
        onClick={() => setView(a.id)}
      >
        <span className="nav-label">
          {client && a.clientLabel ? a.clientLabel : a.label}
          {b && <span className="nav-badge">{b}</span>}
        </span>
        <span className="nav-desc">{a.desc}</span>
      </button>
    );
  };

  const run = data.currentRun;
  const tabs = area.tabs && !(client && area.id === "plan") ? area.tabs : [];
  const tabHint = tabs.find((t) => t.id === tab)?.hint;

  return (
    <div id="app">
      <aside className="sidebar">
        <div className="logo">
          Luminous <span>GEO</span>
          <small>AI VISIBILITY</small>
        </div>
        {!client && (
          <div className="nav-top">{AREAS.filter((a) => a.group === "home").map(navButton)}</div>
        )}
        {brand && (
          <div className="client-block">
            <ClientBadge brand={brand} size={38} />
            <div className="cb-text">
              <div className="cb-label">{client ? "Presenting" : "Working on"}</div>
              <div className="cb-name" title={brand.name}>
                {brand.name}
              </div>
              {score != null && <div className="cb-score">GEO score {score}</div>}
            </div>
            {!client && (
              <button
                type="button"
                className="cb-switch"
                onClick={() => setSwitching(true)}
                title="Switch client (⌘K / Ctrl+K)"
              >
                <span>Switch client</span>
                <kbd>⌘K</kbd>
              </button>
            )}
          </div>
        )}
        <nav className="nav" aria-label="Main">
          <div className="nav-group">{client ? "Client report" : "Monthly cycle"}</div>
          {visible.filter((a) => a.group === "cycle").map(navButton)}
          {!client && (
            <>
              <div className="nav-sep" />
              <div className="nav-group">Set up</div>
              {visible.filter((a) => a.group === "setup").map(navButton)}
            </>
          )}
        </nav>
        <div className="side-foot">
          Signed in as
          <br />
          <b>{userEmail || "—"}</b>
          <br />
          <br />
          <a style={{ cursor: "pointer" }} onClick={signOut}>
            Sign out →
          </a>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div className="context">
            {brand &&
              (client ? (
                <span className="ctx-client">
                  <ClientBadge brand={brand} size={22} />
                  <b>{brand.name}</b>
                </span>
              ) : (
                <button
                  type="button"
                  className="ctx-client"
                  onClick={() => setSwitching(true)}
                  title="Switch client (⌘K / Ctrl+K)"
                >
                  <ClientBadge brand={brand} size={22} />
                  <b>{brand.name}</b>
                  <span className="muted" aria-hidden="true">
                    ▾
                  </span>
                </button>
              ))}
            {run ? (
              <span className="ctx-run">
                <b>{run.label.replace(" (Current)", "")} check</b> · {formatDate(run.run_date)}
                {run.method !== "v2" && <span className="muted"> · old method</span>}
              </span>
            ) : (
              <span className="ctx-run muted">No monthly check yet</span>
            )}
            {inFlight > 0 && (
              <span className="chip chip-blue">
                Measuring {jobs.length - inFlight} of {jobs.length}
              </span>
            )}
            {inFlight > 0 && !client && (
              <button
                type="button"
                className="btn sm danger"
                onClick={stopMeasuring}
                title="Cancel the measurements still to run, to save AI credit"
              >
                ■ Stop
              </button>
            )}
            {inFlight === 0 && !client && run?.method === "v2" && unmeasured.length > 0 && (
              <>
                <span
                  className="chip chip-amber"
                  title={unmeasured.map((p) => p.text).join("\n")}
                >
                  {unmeasured.length} question{unmeasured.length === 1 ? "" : "s"} not fully measured
                </span>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Measure what's missing: ${missingMeasurements} measurement${
                          missingMeasurements === 1 ? "" : "s"
                        } across ${unmeasured.length} question${unmeasured.length === 1 ? "" : "s"} ` +
                          `(${samples} samples each, ${liveEngineCount} live engines)? ` +
                          "Uses AI credit; you can stop it at any time.",
                      )
                    )
                      measureNewQuestions();
                  }}
                >
                  {jobs.some((j) => j.status === "cancelled") ? "Resume" : "Measure now"}
                </button>
              </>
            )}
            {!client && (
              <span
                className={`chip ${offline.length ? "chip-amber" : "chip-green"}`}
                title={offline.length ? "No API key or credit: " + offline.join(", ") : undefined}
              >
                {live.length} of {ENGINES.length} engines live
                {offline.length > 0 && offline.length <= 2 && ` · ${offline.join(", ")} off`}
              </span>
            )}
          </div>
          <div className="view-toggle" role="group" aria-label="View mode">
            <button type="button" aria-pressed={!client} className={!client ? "on" : ""} onClick={() => setMode("team")}>
              Team view
            </button>
            <button type="button" aria-pressed={client} className={client ? "on client" : ""} onClick={() => setMode("client")}>
              Client view
            </button>
          </div>
        </div>
        {client && (
          <div className="present-banner">
            <b>Presenting to client.</b> Editing and internal tools are hidden. Switch back to
            Team view to make changes.
          </div>
        )}
        <div className="content">
          {!ready ? (
            <div className="card">Loading…</div>
          ) : !brand ? (
            <div className="card">
              No clients yet. Create one in <b>Admin → Add a client</b> (Team view).
            </div>
          ) : (
            <>
              <div className="page-head">
                <div>
                  <h1>{client && area.clientLabel ? area.clientLabel : area.label}</h1>
                  <p className="page-q">{client && area.clientQuestion ? area.clientQuestion : area.question}</p>
                  {!client && (
                    <p className="page-todo">
                      <b>What to do here:</b> {area.todo}
                    </p>
                  )}
                </div>
                {!client && area.action && (
                  <button type="button" className="btn" onClick={runAction} disabled={inFlight > 0 && area.action.kind !== "logPlacement"}>
                    {inFlight > 0 && area.action.kind !== "logPlacement" ? "Measuring…" : area.action.label}
                  </button>
                )}
              </div>
              {tabs.length > 0 && (
                <>
                  <div className="area-tabs" role="tablist" aria-label={area.label}>
                    {tabs.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={t.id === tab}
                        className={t.id === tab ? "on" : ""}
                        onClick={() => setView(area.id, t.id)}
                      >
                        {t.label}
                        {area.id === "plan" && t.id === "ideas" && newIdeas > 0 && ` (${newIdeas} new)`}
                      </button>
                    ))}
                  </div>
                  {tabHint && <p className="tab-hint">{tabHint}</p>}
                </>
              )}
              <AreaBody area={view} tab={tab} />
            </>
          )}
        </div>
      </div>
      {switching && !client && <ClientSwitcher onClose={() => setSwitching(false)} />}
      <div className={`toast${toastShow ? " show" : ""}`}>{toastMsg}</div>
    </div>
  );
}
