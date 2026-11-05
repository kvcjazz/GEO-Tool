"use client";

import { useEffect, useState } from "react";
import { useAppState } from "./AppState";
import type { V2Answer } from "@/lib/prImpact";

/**
 * Every measurement-v2 answer for the selected client, with citation URLs but
 * without answer text (see geo_v2_answers). Reloads when the client or its
 * list of checks changes. `null` while loading.
 */
export function useV2Answers(): V2Answer[] | null {
  const { sb, brand, data } = useAppState();
  const [rows, setRows] = useState<{ key: string; answers: V2Answer[] } | null>(null);
  const key = (brand?.id || "") + "|" + data.runs.map((r) => r.id).join(",") + "|" + data.responses.length;

  useEffect(() => {
    if (!brand) return;
    let off = false;
    (async () => {
      const { data: out } = await sb.rpc("geo_v2_answers", { bid: brand.id });
      if (!off) {
        setRows({
          key,
          answers: ((out || []) as V2Answer[]).map((a) => ({ ...a, urls: a.urls || [] })),
        });
      }
    })();
    return () => {
      off = true;
    };
  }, [sb, brand, key]);

  return rows && rows.key === key ? rows.answers : null;
}
