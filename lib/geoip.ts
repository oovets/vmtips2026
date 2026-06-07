// IP-berikning: reverse DNS (Node dns.promises.reverse, inget externt beroende)
// + GeoIP via ip-api.com (gratis, ingen nyckel). All logik är defensiv: tidsgränser,
// try/catch och null-resultat vid fel. Får ALDRIG kasta eller blockera anropet.
// Endast riktig data lagras — vid fel returneras null/tomma fält, aldrig påhittat.

import { promises as dns } from "node:dns";
import { isPrivateIp } from "./request-ip";

export interface GeoInfo {
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  isp: string | null;
  org: string | null;
  asn: string | null;
}

const EMPTY_GEO: GeoInfo = {
  country: null,
  countryCode: null,
  region: null,
  city: null,
  lat: null,
  lon: null,
  isp: null,
  org: null,
  asn: null,
};

// Liten in-memory-cache så vi inte slår upp samma IP om och om igen. Återställs
// vid omstart — räcker gott för self-hosting med en instans.
const REVERSE_CACHE = new Map<string, string | null>();
const GEO_CACHE = new Map<string, GeoInfo>();
const CACHE_MAX = 5000;

function cacheSet<V>(map: Map<string, V>, key: string, value: V) {
  if (map.size >= CACHE_MAX) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  map.set(key, value);
}

// Reverse DNS (PTR). Kort tidsgräns via Promise.race så ett långsamt svar inte
// blockerar. Returnerar första hostnamnet eller null.
export async function reverseDns(ip: string, timeoutMs = 1500): Promise<string | null> {
  if (isPrivateIp(ip)) return null;
  if (REVERSE_CACHE.has(ip)) return REVERSE_CACHE.get(ip)!;

  const lookup = dns.reverse(ip).then((names) => names[0] ?? null);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));

  let result: string | null = null;
  try {
    result = await Promise.race([lookup, timeout]);
  } catch {
    result = null;
  }
  cacheSet(REVERSE_CACHE, ip, result);
  return result;
}

// GeoIP via ip-api.com. AbortController-tidsgräns ~2.5s. Vid status != "success"
// eller nätverksfel returneras tomt geo-objekt (alla null).
export async function geoLookup(ip: string, timeoutMs = 2500): Promise<GeoInfo> {
  if (isPrivateIp(ip)) return EMPTY_GEO;
  if (GEO_CACHE.has(ip)) return GEO_CACHE.get(ip)!;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,region,regionName,city,lat,lon,isp,org,as,query`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      cacheSet(GEO_CACHE, ip, EMPTY_GEO);
      return EMPTY_GEO;
    }
    const data = (await res.json()) as Record<string, unknown>;
    if (data.status !== "success") {
      cacheSet(GEO_CACHE, ip, EMPTY_GEO);
      return EMPTY_GEO;
    }
    const geo: GeoInfo = {
      country: typeof data.country === "string" ? data.country : null,
      countryCode: typeof data.countryCode === "string" ? data.countryCode : null,
      region: typeof data.regionName === "string" ? data.regionName : null,
      city: typeof data.city === "string" ? data.city : null,
      lat: typeof data.lat === "number" ? data.lat : null,
      lon: typeof data.lon === "number" ? data.lon : null,
      isp: typeof data.isp === "string" ? data.isp : null,
      org: typeof data.org === "string" ? data.org : null,
      asn: typeof data.as === "string" ? data.as : null,
    };
    cacheSet(GEO_CACHE, ip, geo);
    return geo;
  } catch {
    // Timeout/abort/nätverksfel — lagra inget, returnera tomt.
    return EMPTY_GEO;
  } finally {
    clearTimeout(timer);
  }
}

// Bekvämlighet: kör reverse DNS + GeoIP parallellt. Båda är redan defensiva.
export async function enrichIp(ip: string): Promise<{ ipReverse: string | null; geo: GeoInfo }> {
  const [ipReverse, geo] = await Promise.all([reverseDns(ip), geoLookup(ip)]);
  return { ipReverse, geo };
}
