"use client";

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

/** What renders for each area (and tab, where an area has tabs). */
function AreaBody({ area, tab }: { area: string; tab: string }) {
  switch (area) {
    case "answers":
      return tab === "sources" ? <SourcesView /> : tab === "mentions" ? <ListeningView /> : <CaptureView />;
    case "plan":
      return tab === "actions" ? <BacklogView /> : tab === "titles" ? <TargetsView /> : <PlanningView />;
    case "coverage":
      return <PRView />;
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
    brands,
    brand,
    data,
    engines,
    jobs,
    selectBrand,
    startSnapshot,
    remeasure,
    signOut,
    toastMsg,
    toastShow,
  } = useAppState();

  const client = mode === "client";
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
            <label className="ctx-client">
              Client
              <select
                value={brand?.id || ""}
                onChange={(e) => selectBrand(e.target.value)}
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
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
      <div className={`toast${toastShow ? " show" : ""}`}>{toastMsg}</div>
    </div>
  );
}
