"use client";

import { useAppState } from "@/state/AppState";
import { NAVDEF, TITLES } from "@/lib/constants";
import DashboardView from "@/views/DashboardView";
import CaptureView from "@/views/CaptureView";
import PromptsView from "@/views/PromptsView";
import BacklogView from "@/views/BacklogView";
import PlanningView from "@/views/PlanningView";
import SourcesView from "@/views/SourcesView";
import PRView from "@/views/PRView";
import ListeningView from "@/views/ListeningView";
import SettingsView from "@/views/SettingsView";

const VIEWS: Record<string, React.FC> = {
  dashboard: DashboardView,
  capture: CaptureView,
  prompts: PromptsView,
  backlog: BacklogView,
  planning: PlanningView,
  sources: SourcesView,
  pr: PRView,
  listening: ListeningView,
  settings: SettingsView,
};

export default function Shell() {
  const {
    ready,
    userEmail,
    mode,
    view,
    setView,
    toggleMode,
    brands,
    brand,
    data,
    selectBrand,
    signOut,
    toastMsg,
    toastShow,
  } = useAppState();

  const navItems = NAVDEF.filter((n) => mode === "team" || n[3] === "both");
  const ViewComp = VIEWS[view] || DashboardView;

  return (
    <div id="app">
      <aside className="sidebar">
        <div className="logo">
          Luminous <span>GEO</span>
          <small>AI VISIBILITY</small>
        </div>
        <nav className="nav">
          {navItems.map((n) => (
            <a
              key={n[0]}
              className={n[0] === view ? "active" : ""}
              onClick={() => setView(n[0])}
            >
              <span className="ico">{n[1]}</span> {n[2]}
            </a>
          ))}
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
          <h2>
            {TITLES[view]}
            {mode === "client" ? " — client view" : ""}
          </h2>
          <div className="right">
            <span
              className={`pill mode${mode === "client" ? " client" : ""}`}
              onClick={toggleMode}
            >
              {mode === "team" ? "Team view ⇄" : "Client view ⇄"}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              Brand
            </span>
            <select
              style={{ width: "auto", minWidth: 170 }}
              value={brand?.id || ""}
              onChange={(e) => selectBrand(e.target.value)}
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.is_client ? " (client)" : ""}
                </option>
              ))}
            </select>
            <span className="pill">
              {data.currentRun ? data.currentRun.label : brand ? "No run" : "—"}
            </span>
          </div>
        </div>
        <div className="content">
          {!ready ? (
            <div className="card">Loading…</div>
          ) : !brand ? (
            <div className="card">
              No brands found. Create one in <b>Settings → Data tools</b> (switch to
              Team view).
            </div>
          ) : (
            <ViewComp />
          )}
        </div>
      </div>
      <div className={`toast${toastShow ? " show" : ""}`}>{toastMsg}</div>
    </div>
  );
}
