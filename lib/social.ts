// Social-aggregator: kurerad lista av kända fotbolls-/VM-skribenter samt en valfri
// live-källa via RSS-brygga (Nitter/RSSHub). Inget X/Twitter-API eller nyckel krävs.
//
// X har ingen gratis läs-API längre, så live-inlägg hämtas bara om SOCIAL_RSS_BASE är
// satt och pekar på en fungerande RSS-brygga. Annars visas den kurerade profil-listan.
// Vi renderar bara text och validerade http(s)-länkar (skydd mot injection).

export interface Journalist {
  name: string;
  handle: string; // utan @
  blurb: string;
}

export interface SocialPost {
  author: string;
  handle: string;
  text: string;
  link: string;
  isoDate: string | null;
}

// Kända profiler som postar mycket om VM/fotboll. Visas alltid (med avatar + länk).
export const JOURNALISTS: Journalist[] = [
  { name: "Fabrizio Romano", handle: "FabrizioRomano", blurb: "Transfers & VM" },
  { name: "David Ornstein", handle: "David_Ornstein", blurb: "The Athletic" },
  { name: "Guillem Balagué", handle: "GuillemBalague", blurb: "Spansk fotboll" },
  { name: "Opta", handle: "OptaJoe", blurb: "Statistik & fakta" },
  { name: "B/R Football", handle: "brfootball", blurb: "Snackisar & klipp" },
  { name: "SVT Sport", handle: "SVTSport", blurb: "Svensk bevakning" },
  { name: "Aftonbladet Sport", handle: "Aftonbladet", blurb: "Sportbladet" },
  { name: "Expressen Sport", handle: "Expressen_Sport", blurb: "Svensk fotboll" },
  { name: "FotbollDirekt", handle: "fotbolldirekt", blurb: "Allsvenskan & landslag" },
];

const RSS_BASE = process.env.SOCIAL_RSS_BASE?.trim();
const REVALIDATE_SECONDS = 600;

// Avatar utan nyckel via unavatar.io (hämtar X/Twitter-profilbild).
export function avatarUrl(handle: string): string {
  return `https://unavatar.io/x/${encodeURIComponent(handle)}`;
}

export function profileUrl(handle: string): string {
  return `https://x.com/${encodeURIComponent(handle)}`;
}

// Bygg RSS-url från SOCIAL_RSS_BASE. Stödjer {handle}-mall, annars läggs /{handle}/rss på.
function feedUrl(handle: string): string | null {
  if (!RSS_BASE) return null;
  if (RSS_BASE.includes("{handle}")) {
    return RSS_BASE.replace(/{handle}/g, encodeURIComponent(handle));
  }
  return `${RSS_BASE.replace(/\/$/, "")}/${encodeURIComponent(handle)}/rss`;
}

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
    .replace(/\s+/g, " ")
    .trim();
}

function pick(tag: string, block: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : null;
}

// Tillåt bara absoluta http(s)-länkar.
function safeLink(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(decodeEntities(raw));
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function parseFeed(xml: string, author: string, handle: string): SocialPost[] {
  const posts: SocialPost[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const raw = pick("title", block) ?? pick("description", block);
    const link = safeLink(pick("link", block));
    const pub = pick("pubDate", block) ?? pick("dc:date", block);
    if (!raw || !link) continue;
    const text = decodeEntities(raw);
    if (!text) continue;
    const iso = pub ? new Date(decodeEntities(pub)) : null;
    posts.push({
      author,
      handle,
      text: text.length > 280 ? `${text.slice(0, 277)}…` : text,
      link,
      isoDate: iso && !isNaN(iso.getTime()) ? iso.toISOString() : null,
    });
  }
  return posts;
}

async function fetchOne(j: Journalist): Promise<SocialPost[]> {
  const url = feedUrl(j.handle);
  if (!url) return [];
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "vmtips2026/1.0 (+https://github.com)" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), j.name, j.handle);
  } catch {
    return [];
  }
}

// Returnerar live-inlägg om en RSS-källa är konfigurerad, annars tom lista
// (då visar UI:t den kurerade profil-listan istället).
export async function fetchSocialPosts(limit = 8): Promise<SocialPost[]> {
  if (!RSS_BASE) return [];
  const results = await Promise.all(JOURNALISTS.map(fetchOne));
  const all = results.flat();

  const seen = new Set<string>();
  const unique = all.filter((p) => {
    const key = `${p.handle}:${p.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const time = (p: SocialPost) => (p.isoDate ? new Date(p.isoDate).getTime() : 0);
  unique.sort((a, b) => time(b) - time(a));
  return unique.slice(0, limit);
}

// Indikerar om en live-källa är konfigurerad (för UI-text).
export const socialLiveConfigured = Boolean(RSS_BASE);
