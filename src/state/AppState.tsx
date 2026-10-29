"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { callFn } from "@/lib/callFn";
import { ClassifySourcesSchema, EngineStatusSchema } from "@/lib/schemas";
import { gapSources } from "@/lib/sources";
import { AREAS, CLIENT_AREAS, LEGACY_VIEWS } from "@/lib/constants";
import type { AreaId } from "@/lib/constants";
import { SCORE_COLUMNS, sovFromSamples } from "@/lib/scoring";
import type { Scorable } from "@/lib/scoring";
import type {
  Brand,
  Competitor,
  ContextItem,
  DateRange,
  EngineStatus,
  MeasureJob,
  MediaTarget,
  Mention,
  MemoryOutlet,
  NewsItem,
  Opportunity,
  PrActivity,
  Prompt,
  RadarItem,
  Response,
  Run,
  SourceKind,
  TargetTitle,
} from "@/lib/types";

type BrandData = {
  competitors: Competitor[];
  prompts: Prompt[];
  runs: Run[];
  currentRun: Run | null;
  responses: Response[];
  /** Scoring fields of earlier runs measured the same way as the current one. */
  history: Record<string, Scorable[]>;
  /** What each cited site is to this client, keyed by domain. */
  sourceKinds: Record<string, SourceKind>;
  /** Titles to target: the senior-PR review of cited sites, plus the team's calls. */
  targets: TargetTitle[];
  sov: { player: string; mentions: number }[];
  opps: Opportunity[];
  pr: PrActivity[];
  mentions: Mention[];
  context: ContextItem[];
  media: MediaTarget[];
  radar: RadarItem[];
  news: NewsItem[];
  compNews: NewsItem[];
};

const EMPTY: BrandData = {
  competitors: [],
  prompts: [],
  runs: [],
  currentRun: null,
  responses: [],
  history: {},
  sourceKinds: {},
  targets: [],
  sov: [],
  opps: [],
  pr: [],
  mentions: [],
  context: [],
  media: [],
  radar: [],
  news: [],
  compNews: [],
};

export type Mode = "team" | "client";
export type AnswersFilter = "all" | "unbranded" | "branded";

type Ctx = {
  ready: boolean;
  userEmail: string;
  sb: ReturnType<typeof getSupabaseBrowserClient>;

  mode: Mode;
  /** The area on screen (already limited to client areas in client view). */
  view: AreaId;
  /** The sub-tab on screen for areas that have tabs, else "". */
  tab: string;
  /** Answers tab filter: all questions, ones that don't name the client, or ones that do. */
  answersFilter: AnswersFilter;
  samples: number;
  dateRange: DateRange;

  brands: Brand[];
  archivedBrands: Brand[];
  brand: Brand | null;
  data: BrandData;
  engines: EngineStatus;
  memory: MemoryOutlet[] | null;

  setMode: (m: Mode) => void;
  toggleMode: () => void;
  /** Go to an area (or an old tab id, which maps to its new home), optionally a tab. */
  setView: (v: string, tab?: string) => void;
  setAnswersFilter: (f: AnswersFilter) => void;
  setSamples: (n: number) => void;
  setDateRange: (d: DateRange) => void;

  selectBrand: (id: string) => Promise<void>;
  reload: () => Promise<void>;
  loadBrands: () => Promise<void>;
  buildFeasibilityMemory: () => Promise<MemoryOutlet[]>;
  patchBrand: (patch: Partial<Brand>) => void;
  patchResponse: (id: string, patch: Partial<Response>) => void;
  /** Record (or correct) what a cited site is to the selected client. */
  setSourceKind: (domain: string, kind: string, label?: string | null) => Promise<void>;
  /** True while cited sites are being classified. */
  classifying: boolean;
  /** Merge saved Titles to target rows into the loaded data. */
  mergeTargets: (rows: TargetTitle[]) => void;

  /** Queued measurements for the current run, kept fresh while any are in flight. */
  jobs: MeasureJob[];
  /** Start a fresh monthly check (v2) for the selected client. */
  startSnapshot: () => Promise<void>;
  /** Re-measure the current check (or start a new one if it used the old method). */
  remeasure: () => Promise<void>;
  /** Measure only questions the current check has no answers for yet. */
  measureNewQuestions: () => Promise<void>;

  toast: (m: string) => void;
  toastMsg: string;
  toastShow: boolean;

  signOut: () => Promise<void>;
};

const AppCtx = createContext<Ctx | null>(null);

export function useAppState() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const sb = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [mode, setMode] = useState<Mode>(
    searchParams.get("view") === "client" ? "client" : "team",
  );
  const [viewState, setViewState] = useState<AreaId>("overview");
  const [tabs, setTabs] = useState<Record<string, string>>({});
  const [answersFilter, setAnswersFilter] = useState<AnswersFilter>("all");
  const [samples, setSamples] = useState(3);
  const [dateRange, setDateRange] = useState<DateRange>({
    mode: "all",
    from: null,
    to: null,
  });

  const [brands, setBrands] = useState<Brand[]>([]);
  const [archivedBrands, setArchivedBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [data, setData] = useState<BrandData>(EMPTY);
  const [engines, setEngines] = useState<EngineStatus>({ Claude: true });
  const [memory, setMemory] = useState<MemoryOutlet[] | null>(null);

  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest selected brand id for reload() without re-creating callbacks.
  const brandIdRef = useRef<string | null>(null);
  brandIdRef.current = brand?.id ?? null;

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    setToastShow(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastShow(false), 2200);
  }, []);

  const setView = useCallback((v: string, tab?: string) => {
    const legacy = LEGACY_VIEWS[v];
    const area = legacy?.area ?? (AREAS.some((a) => a.id === v) ? (v as AreaId) : "overview");
    const t = tab ?? legacy?.tab;
    setViewState(area);
    if (t) setTabs((prev) => ({ ...prev, [area]: t }));
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "team" ? "client" : "team"));
  }, []);

  // Client view only reaches client areas, and Plan shows just the action plan.
  const view: AreaId =
    mode === "client" && !CLIENT_AREAS.includes(viewState) ? "overview" : viewState;
  const areaTabs = AREAS.find((a) => a.id === view)?.tabs || [];
  const tab =
    mode === "client" && view === "plan"
      ? "actions"
      : areaTabs.some((t) => t.id === tabs[view])
        ? tabs[view]
        : areaTabs[0]?.id || "";

  const patchResponse = useCallback((id: string, patch: Partial<Response>) => {
    setData((prev) => ({
      ...prev,
      responses: prev.responses.map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ),
    }));
  }, []);

  const patchBrand = useCallback((patch: Partial<Brand>) => {
    setBrand((prev) => (prev ? { ...prev, ...patch } : prev));
    setBrands((prev) =>
      prev.map((b) => (b.id === brandIdRef.current ? { ...b, ...patch } : b)),
    );
  }, []);

  const selectBrand = useCallback(
    async (id: string) => {
      const [
        comps,
        prompts,
        runs,
        opps,
        pr,
        mentions,
        ctx,
        media,
        radar,
        news,
        kinds,
        targets,
      ] = await Promise.all([
        sb.from("geo_competitors").select("*").eq("brand_id", id),
        sb.from("geo_prompts").select("*").eq("brand_id", id).order("sort"),
        sb.from("geo_runs").select("*").eq("brand_id", id).order("run_date"),
        sb.from("geo_opportunities").select("*").eq("brand_id", id).order("sort"),
        sb
          .from("geo_pr_activity")
          .select("*")
          .eq("brand_id", id)
          .order("activity_date"),
        sb
          .from("geo_mentions")
          .select("*")
          .eq("brand_id", id)
          .order("found_date", { ascending: false }),
        sb
          .from("geo_context")
          .select("*")
          .eq("brand_id", id)
          .order("created_at", { ascending: false }),
        sb.from("geo_media_targets").select("*").eq("brand_id", id).order("created_at"),
        sb
          .from("geo_radar_items")
          .select("*")
          .eq("brand_id", id)
          .order("created_at", { ascending: false }),
        sb
          .from("geo_news")
          .select("*")
          .eq("brand_id", id)
          .order("created_at", { ascending: false })
          .limit(20),
        sb.from("geo_source_kinds").select("*").eq("brand_id", id),
        sb.from("geo_target_titles").select("*").eq("brand_id", id),
      ]);

      const allNews = (news.data || []) as NewsItem[];
      const runList = (runs.data || []) as Run[];
      const currentRun =
        runList.find((r) => r.is_current) || runList[runList.length - 1] || null;

      let responses: Response[] = [];
      let sov: { player: string; mentions: number }[] = [];
      const history: Record<string, Scorable[]> = {};
      if (currentRun) {
        // Earlier runs only count towards the trend when measured the same way.
        const earlier = runList.filter(
          (r) => r.id !== currentRun.id && (r.method ?? null) === (currentRun.method ?? null),
        );
        const [resp, sovRes, hist] = await Promise.all([
          sb.from("geo_responses").select("*").eq("run_id", currentRun.id),
          sb.from("geo_competitor_sov").select("*").eq("run_id", currentRun.id),
          earlier.length
            ? sb
                .from("geo_responses")
                .select(SCORE_COLUMNS)
                .in(
                  "run_id",
                  earlier.map((r) => r.id),
                )
            : Promise.resolve({ data: [] }),
        ]);
        responses = (resp.data || []) as Response[];
        sov =
          currentRun.method === "v2"
            ? sovFromSamples(responses, (comps.data || []) as Competitor[])
            : ((sovRes.data || []) as { player: string; mentions: number }[]).map((s) => ({
                player: s.player,
                mentions: s.mentions,
              }));
        for (const row of (hist.data || []) as (Scorable & { run_id: string })[]) {
          (history[row.run_id] ||= []).push(row);
        }
      }

      setBrands((prev) => {
        const found = prev.find((b) => b.id === id) || null;
        setBrand(found);
        return prev;
      });
      setData({
        competitors: (comps.data || []) as Competitor[],
        prompts: (prompts.data || []) as Prompt[],
        runs: runList,
        currentRun,
        responses,
        history,
        sourceKinds: Object.fromEntries(
          ((kinds.data || []) as SourceKind[]).map((k) => [k.domain, k]),
        ),
        targets: (targets.data || []) as TargetTitle[],
        sov,
        opps: (opps.data || []) as Opportunity[],
        pr: (pr.data || []) as PrActivity[],
        mentions: (mentions.data || []) as Mention[],
        context: (ctx.data || []) as ContextItem[],
        media: (media.data || []) as MediaTarget[],
        radar: (radar.data || []) as RadarItem[],
        news: allNews.filter((n) => n.kind !== "competitor"),
        compNews: allNews.filter((n) => n.kind === "competitor"),
      });
      setMemory(null);
    },
    [sb],
  );

  const loadBrands = useCallback(async () => {
    const { data: rows } = await sb
      .from("geo_brands")
      .select("*")
      .order("is_client")
      .order("name");
    const all = (rows || []) as Brand[];
    setArchivedBrands(all.filter((b) => b.archived));
    const active = all.filter((b) => !b.archived);
    setBrands(active);
    if (active.length) {
      const currentId = brandIdRef.current;
      const keep = currentId && active.some((b) => b.id === currentId);
      await selectBrand(keep ? currentId! : active[0].id);
    } else {
      setBrand(null);
      setData(EMPTY);
    }
  }, [sb, selectBrand]);

  const reload = useCallback(async () => {
    if (brandIdRef.current) await selectBrand(brandIdRef.current);
  }, [selectBrand]);

  // ---- Measurement queue ----------------------------------------------------
  const [jobs, setJobs] = useState<MeasureJob[]>([]);
  const [jobsKey, setJobsKey] = useState(0);
  const runId = data.currentRun?.id;

  // Follow the current run's queued measurements: poll while any are waiting
  // or in flight, and reload results each time more of them finish.
  useEffect(() => {
    let stopped = false;
    let lastFinished = -1;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!runId) {
        setJobs([]);
        return;
      }
      const { data: rows } = await sb.from("geo_measure_jobs").select("*").eq("run_id", runId);
      if (stopped) return;
      const list = (rows || []) as MeasureJob[];
      setJobs(list);
      const finished = list.filter((j) => j.status === "done").length;
      if (lastFinished >= 0 && finished !== lastFinished) await reload();
      lastFinished = finished;
      if (!stopped && list.some((j) => j.status === "pending" || j.status === "sent")) {
        timer = setTimeout(tick, 8000);
      }
    };
    timer = setTimeout(tick, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [sb, runId, reload, jobsKey]);

  const startSnapshot = useCallback(async () => {
    const b = brand;
    if (!b) return;
    if (
      !window.confirm(
        "Run a new monthly check for " +
          b.name +
          "? Every active question is put to every live AI engine " +
          samples +
          "× with live web search. Results arrive over the next 10–20 minutes. Uses your AI credit.",
      )
    )
      return;
    const { error } = await sb.rpc("geo_start_snapshot", { bid: b.id, p_samples: samples });
    if (error) return toast("Monthly check failed to start: " + error.message);
    toast("Monthly check started — results arrive over the next 10–20 minutes");
    await reload();
    setJobsKey((k) => k + 1);
  }, [brand, samples, sb, toast, reload]);

  const remeasure = useCallback(async () => {
    const run = data.currentRun;
    if (!brand || !run) return toast("No current check for this client");
    if (!data.prompts.some((p) => p.active)) return toast("No active questions to measure");
    if (run.method !== "v2") {
      // Never mix methods inside one check: start a new-method check instead.
      return startSnapshot();
    }
    if (
      !window.confirm(
        "Re-measure every active question on every live AI engine, " +
          samples +
          " samples each? Results update as they come in (usually 10–20 minutes). Uses your AI credit.",
      )
    )
      return;
    const { data: n, error } = await sb.rpc("geo_enqueue_run", { rid: run.id, p_samples: samples });
    if (error) return toast("Re-measure failed: " + error.message);
    toast(n ? n + " measurements queued" : "Already measuring — nothing new queued");
    setJobsKey((k) => k + 1);
  }, [brand, data.currentRun, data.prompts, samples, sb, toast, startSnapshot]);

  const measureNewQuestions = useCallback(async () => {
    const run = data.currentRun;
    if (!run || run.method !== "v2") return;
    const { data: n, error } = await sb.rpc("geo_enqueue_run", {
      rid: run.id,
      p_samples: samples,
      p_only_new: true,
    });
    if (error) return toast("Couldn't start measuring: " + error.message);
    toast(n ? n + " measurements queued for the new questions" : "Nothing new to measure");
    setJobsKey((k) => k + 1);
  }, [data.currentRun, samples, sb, toast]);

  // ---- Cited-site classification --------------------------------------------
  // The sites answers cite are classified once per client (competitor,
  // publication, directory…) so competitors drop out of "where to earn
  // coverage". Runs in the background for unclassified gap sites, at most once
  // per client and domain per session.
  const [classifying, setClassifying] = useState(false);
  const attempted = useRef<Set<string>>(new Set());

  const saveKinds = useCallback(
    async (rows: { domain: string; kind: string; label?: string | null; source: string }[]) => {
      const b = brand;
      if (!b || !rows.length) return;
      const now = new Date().toISOString();
      const payload = rows.map((r) => ({
        brand_id: b.id,
        domain: r.domain,
        kind: r.kind,
        label: r.label ?? null,
        source: r.source,
        updated_at: now,
      }));
      const { data: saved, error } = await sb
        .from("geo_source_kinds")
        .upsert(payload, { onConflict: "brand_id,domain" })
        .select("*");
      if (error) return toast("Couldn't save site types: " + error.message);
      setData((prev) => ({
        ...prev,
        sourceKinds: {
          ...prev.sourceKinds,
          ...Object.fromEntries(((saved || []) as SourceKind[]).map((k) => [k.domain, k])),
        },
      }));
    },
    [brand, sb, toast],
  );

  const mergeTargets = useCallback((rows: TargetTitle[]) => {
    setData((prev) => {
      const byId = new Map(prev.targets.map((t) => [t.id, t]));
      for (const r of rows) byId.set(r.id, r);
      return { ...prev, targets: [...byId.values()] };
    });
  }, []);

  const setSourceKind = useCallback(
    (domain: string, kind: string, label?: string | null) =>
      saveKinds([{ domain, kind, label, source: "team" }]),
    [saveKinds],
  );

  useEffect(() => {
    const b = brand;
    if (!b || mode !== "team" || classifying) return;
    const todo = gapSources(b, data.responses)
      .map((s) => s.domain)
      .filter((d) => !data.sourceKinds[d] && !attempted.current.has(b.id + "|" + d))
      .slice(0, 60);
    if (!todo.length) return;
    const timer = setTimeout(async () => {
      todo.forEach((d) => attempted.current.add(b.id + "|" + d));
      setClassifying(true);
      try {
        const j = await callFn(
          "geo-classify-sources",
          {
            brand: b.name,
            website: b.website,
            sector: b.sector,
            positioning: b.positioning,
            competitors: data.competitors.map((c) => c.name),
            domains: todo,
          },
          ClassifySourcesSchema,
        );
        if (j.ok && j.sites?.length) {
          await saveKinds(j.sites.map((x) => ({ ...x, source: "ai" })));
        }
      } catch {
        /* classification is best-effort; the list still works without it */
      }
      setClassifying(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [brand, mode, classifying, data.responses, data.sourceKinds, data.competitors, saveKinds]);

  const loadEngines = useCallback(async () => {
    try {
      const j = await callFn("geo-engines", {}, EngineStatusSchema);
      setEngines((j.engines as EngineStatus) || {});
    } catch {
      setEngines({ Claude: true });
    }
  }, []);

  const buildFeasibilityMemory = useCallback(async (): Promise<MemoryOutlet[]> => {
    try {
      const [ri, pa, mt] = await Promise.all([
        sb.from("geo_radar_items").select("target_outlets,team_rating,status"),
        sb.from("geo_pr_activity").select("outlet,cited"),
        sb.from("geo_media_targets").select("outlet"),
      ]);
      const names = new Set<string>();
      (mt.data || []).forEach((m: { outlet: string | null }) => {
        if (m.outlet) names.add(m.outlet);
      });
      (pa.data || []).forEach((p: { outlet: string | null }) => {
        if (p.outlet) names.add(p.outlet);
      });
      const nameList = [...names];
      const outlets: Record<string, MemoryOutlet> = {};
      const bump = (k: string, v: "up" | "down" | "landed" | "cited") => {
        outlets[k] = outlets[k] || {
          outlet: k,
          up: 0,
          down: 0,
          landed: 0,
          cited: 0,
          score: 0,
        };
        outlets[k][v]++;
      };
      (ri.data || []).forEach(
        (it: {
          target_outlets: string | null;
          team_rating: string | null;
          status: string | null;
        }) => {
          const s = (it.target_outlets || "").toLowerCase();
          nameList.forEach((nm) => {
            if (nm && s.indexOf(nm.toLowerCase()) >= 0) {
              if (
                it.team_rating === "Realistic" ||
                it.status === "in_plan" ||
                it.status === "saved"
              )
                bump(nm, "up");
              if (it.team_rating === "Unrealistic" || it.status === "dismissed")
                bump(nm, "down");
            }
          });
        },
      );
      (pa.data || []).forEach((p: { outlet: string | null; cited: boolean | null }) => {
        if (!p.outlet) return;
        bump(p.outlet, "landed");
        if (p.cited) bump(p.outlet, "cited");
      });
      const arr = Object.keys(outlets)
        .map((k) => {
          const o = outlets[k];
          o.score = o.up + o.landed * 2 + o.cited * 2 - o.down * 2;
          return o;
        })
        .sort((a, b) => b.score - a.score);
      setMemory(arr);
      return arr;
    } catch {
      setMemory([]);
      return [];
    }
  }, [sb]);

  const signOut = useCallback(async () => {
    await sb.auth.signOut();
    router.replace("/login");
    router.refresh();
  }, [sb, router]);

  // Boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (cancelled) return;
      if (session) setUserEmail(session.user.email || "");
      await loadEngines();
      await loadBrands();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: Ctx = {
    ready,
    userEmail,
    sb,
    mode,
    view,
    tab,
    answersFilter,
    samples,
    dateRange,
    brands,
    archivedBrands,
    brand,
    data,
    engines,
    memory,
    setMode,
    toggleMode,
    setView,
    setAnswersFilter,
    setSamples,
    setDateRange,
    selectBrand,
    reload,
    loadBrands,
    buildFeasibilityMemory,
    patchBrand,
    patchResponse,
    jobs,
    startSnapshot,
    remeasure,
    measureNewQuestions,
    setSourceKind,
    mergeTargets,
    classifying,
    toast,
    toastMsg,
    toastShow,
    signOut,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
