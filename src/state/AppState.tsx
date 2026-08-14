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
import { EngineStatusSchema } from "@/lib/schemas";
import { CLIENT_VIEWS } from "@/lib/constants";
import type {
  Brand,
  Competitor,
  ContextItem,
  DateRange,
  EngineStatus,
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
} from "@/lib/types";

type BrandData = {
  competitors: Competitor[];
  prompts: Prompt[];
  runs: Run[];
  currentRun: Run | null;
  responses: Response[];
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

type Ctx = {
  ready: boolean;
  userEmail: string;
  sb: ReturnType<typeof getSupabaseBrowserClient>;

  mode: Mode;
  view: string;
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
  setView: (v: string) => void;
  setSamples: (n: number) => void;
  setDateRange: (d: DateRange) => void;

  selectBrand: (id: string) => Promise<void>;
  reload: () => Promise<void>;
  loadBrands: () => Promise<void>;
  buildFeasibilityMemory: () => Promise<MemoryOutlet[]>;
  patchBrand: (patch: Partial<Brand>) => void;
  patchResponse: (id: string, patch: Partial<Response>) => void;

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
  const [view, setViewState] = useState("dashboard");
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

  const setView = useCallback(
    (v: string) => {
      // In client mode only the client views are reachable.
      if (mode === "client" && !CLIENT_VIEWS.includes(v)) v = "dashboard";
      setViewState(v);
    },
    [mode],
  );

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "team" ? "client" : "team"));
  }, []);

  // When switching to client mode from a team-only view, drop back to dashboard.
  useEffect(() => {
    if (mode === "client" && !CLIENT_VIEWS.includes(view)) {
      setViewState("dashboard");
    }
  }, [mode, view]);

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
      ]);

      const allNews = (news.data || []) as NewsItem[];
      const runList = (runs.data || []) as Run[];
      const currentRun =
        runList.find((r) => r.is_current) || runList[runList.length - 1] || null;

      let responses: Response[] = [];
      let sov: { player: string; mentions: number }[] = [];
      if (currentRun) {
        const [resp, sovRes] = await Promise.all([
          sb.from("geo_responses").select("*").eq("run_id", currentRun.id),
          sb.from("geo_competitor_sov").select("*").eq("run_id", currentRun.id),
        ]);
        responses = (resp.data || []) as Response[];
        sov = ((sovRes.data || []) as { player: string; mentions: number }[]).map(
          (s) => ({ player: s.player, mentions: s.mentions }),
        );
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
    setSamples,
    setDateRange,
    selectBrand,
    reload,
    loadBrands,
    buildFeasibilityMemory,
    patchBrand,
    patchResponse,
    toast,
    toastMsg,
    toastShow,
    signOut,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
