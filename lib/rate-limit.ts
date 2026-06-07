// Enkel in-memory rate limiter per nyckel (t.ex. IP eller userId). Återställs vid
// omstart — räcker för self-hosting och en enstaka instans. Vid horisontell
// skalning bör detta bytas mot Redis (t.ex. @upstash/ratelimit).

interface Bucket {
  count: number;
  reset: number;
}

const buckets = new Map<string, Bucket>();

// Städar bort utgångna nycklar då och då så kartan inte växer obegränsat.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.reset < now) buckets.delete(key);
  }
}

// Returnerar true om anropet får passera, false om gränsen är nådd.
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const entry = buckets.get(key);
  if (!entry || entry.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// Bästa gissning på klientens IP bakom proxy/CDN. Faller tillbaka på "unknown"
// (delad nyckel) om ingen header finns — bättre att rate-limita tillsammans än inte alls.
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
