// Recent theme and competitor news for a client (PR Planning → news panels).
// Source: Google News RSS (see _shared/news.ts for why not GDELT).
import { CORS, countryCode, json } from "../_shared/providers.ts";
import { signedIn } from "../_shared/auth.ts";
import { competitorNews, themeNews } from "../_shared/news.ts";

type Body = {
  brand?: string;
  themes?: string | null;
  sector?: string | null;
  pr_region?: string | null;
  market_country?: string | null;
  competitors?: string[];
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!(await signedIn(req))) return json({ error: "Sign-in required." }, 401);
  const b = (await req.json().catch(() => ({}))) as Body;
  const country = countryCode(b.market_country);
  const [theme, comp] = await Promise.all([
    themeNews({ themes: b.themes, brand: b.brand, sector: b.sector, country }),
    competitorNews(b.competitors || [], country),
  ]);
  return json({
    articles: theme.articles,
    competitorNews: comp.articles,
    query: theme.query,
    error: theme.error || comp.error || undefined,
  });
});
