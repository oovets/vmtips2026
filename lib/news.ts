// Nyhetsaggregator: hämtar och slår ihop publika RSS-flöden om fotboll/VM.
// Server-side, cachat ~15 min. Ingen API-nyckel krävs. Vi renderar bara text och
// validerade http(s)-länkar (skydd mot injection).

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  isoDate: string | null;
}

// Publika flöden utan nyckel. Faller tillbaka snyggt om någon är nere.
const FEEDS: { url: string; source: string }[] = [
  // Svenska källor
  { url: "https://fotbolldirekt.se/feed/", source: "FotbollDirekt" },
  { url: "https://rss.aftonbladet.se/rss2/small/pages/sections/sportbladet/fotboll/", source: "Aftonbladet" },
  { url: "https://feeds.expressen.se/fotboll/", source: "Expressen" },
  { url: "https://www.dn.se/rss/om/fotboll/", source: "DN" },
  // Internationella källor
  { url: "https://www.theguardian.com/football/world-cup-2026/rss", source: "The Guardian" },
  { url: "https://www.theguardian.com/football/rss", source: "The Guardian" },
  { url: "https://feeds.bbci.co.uk/sport/football/rss.xml", source: "BBC Sport" },
];

// Svenska källor (för språkfiltrering i UI).
export const SWEDISH_SOURCES = ["FotbollDirekt", "Aftonbladet", "Expressen", "DN"];

const REVALIDATE_SECONDS = 900;

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "") // ev. inbäddad HTML
    .trim();
}

function pick(tag: string, block: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : null;
}

// Tillåt bara absoluta http(s)-länkar.
function safeLink(raw: string | null): string | null {
  if (!raw) return null;
  const url = decodeEntities(raw);
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function parseFeed(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = pick("title", block);
    const link = safeLink(pick("link", block));
    const pub = pick("pubDate", block) ?? pick("dc:date", block);
    if (!title || !link) continue;
    const iso = pub ? new Date(decodeEntities(pub)) : null;
    items.push({
      title: decodeEntities(title),
      link,
      source,
      isoDate: iso && !isNaN(iso.getTime()) ? iso.toISOString() : null,
    });
  }
  return items;
}

async function fetchFeed(url: string, source: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "vmtips2026/1.0 (+https://github.com)" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), source);
  } catch {
    return [];
  }
}

// Lyfter fram VM-relaterade rubriker.
function isWorldCup(item: NewsItem): boolean {
  return /world cup|världsmästerskap|\bvm\b|2026|fifa|landslag/i.test(item.title);
}

export async function fetchFootballNews(limit = 8): Promise<NewsItem[]> {
  const results = await Promise.all(FEEDS.map((f) => fetchFeed(f.url, f.source)));
  const all = results.flat();

  // Deduplicera på rubrik.
  const seen = new Set<string>();
  const unique = all.filter((i) => {
    const key = i.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const time = (i: NewsItem) => (i.isoDate ? new Date(i.isoDate).getTime() : 0);
  // VM-nyheter först, därefter nyast.
  unique.sort((a, b) => {
    const wc = Number(isWorldCup(b)) - Number(isWorldCup(a));
    if (wc !== 0) return wc;
    return time(b) - time(a);
  });

  return unique.slice(0, limit);
}
