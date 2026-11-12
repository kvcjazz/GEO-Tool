// Starter questions for a new client, drafted from what the wizard knows.
//
// GEO practice: most tracked questions must NOT name the client — that is how
// "Found by new buyers" is measured — and they should read like a buyer
// typing into an AI assistant, across the buying stages. Two branded
// questions check how the engines describe the client by name.

export type Starter = { text: string; ptype: string; branded: boolean };

export type StarterInput = {
  name: string;
  sector: string;
  audience: string;
  themes: string;
  market: string; // country name, or "" for no single market
  competitors: string[];
};

const clean = (s: string) => s.trim().replace(/\s+/g, " ");

export function starterQuestions(i: StarterInput): Starter[] {
  const name = clean(i.name);
  const sector = clean(i.sector) || "providers in this category";
  const audience = clean(i.audience);
  // "in the United States", "in the Netherlands", but "in France".
  const the = /^(united |netherlands|philippines|czech republic|bahamas|gambia)/i.test(i.market) ? "the " : "";
  const inMarket = i.market ? " in " + the + i.market : "";
  const themes = i.themes
    .split(/[,;\n]/)
    .map(clean)
    .filter(Boolean);
  const out: Starter[] = [
    { text: `What are the best ${sector}${inMarket}?`, ptype: "Category", branded: false },
    audience
      ? { text: `Which ${sector} would you recommend for ${audience}?`, ptype: "Buying-intent", branded: false }
      : { text: `Which ${sector} would you recommend${inMarket}?`, ptype: "Buying-intent", branded: false },
    { text: `How do I choose between ${sector}?`, ptype: "Problem-led", branded: false },
    ...themes.slice(0, 2).map((t) => ({
      text: `Who are the leading ${sector}${inMarket} for ${t}?`,
      ptype: "Category",
      branded: false,
    })),
    ...i.competitors
      .map(clean)
      .filter(Boolean)
      .slice(0, 2)
      .map((c) => ({ text: `What are the best alternatives to ${c}?`, ptype: "Comparison", branded: false })),
    { text: `What is ${name} known for?`, ptype: "Brand/Entity", branded: true },
    audience
      ? { text: `Is ${name} a good choice for ${audience}?`, ptype: "Brand/Entity", branded: true }
      : { text: `Is ${name} a good choice?`, ptype: "Brand/Entity", branded: true },
  ];
  // No duplicates (e.g. two themes that read the same).
  const seen = new Set<string>();
  return out.filter((q) => {
    const k = q.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
