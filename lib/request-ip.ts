// Extraherar klientens IP-adress ur request-headers. Bakom proxy/Docker är
// `x-forwarded-for` auktoritativ (första hoppet = den faktiska klienten).
// Faller tillbaka på `x-real-ip`. Returnerar null om ingen header finns
// (App Router-Request exponerar inte underliggande socket-IP).

export function getRequestIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    // Format: "client, proxy1, proxy2" — första hoppet är klienten.
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

// Privata/loopback/link-local-intervall samt IPv6-motsvarigheter. För dessa
// hoppar vi över GeoIP/reverse-DNS — uppslag ger ändå inget meningsfullt och
// kan hänga onödigt.
export function isPrivateIp(ip: string): boolean {
  const addr = ip.trim().toLowerCase();
  if (!addr) return true;

  // IPv6 loopback / unspecified
  if (addr === "::1" || addr === "::" || addr === "0.0.0.0") return true;
  // IPv6 unique-local (fc00::/7) och link-local (fe80::/10)
  if (addr.startsWith("fc") || addr.startsWith("fd") || addr.startsWith("fe8") || addr.startsWith("fe9") || addr.startsWith("fea") || addr.startsWith("feb")) {
    return true;
  }
  // IPv4-mapped IPv6, t.ex. ::ffff:10.0.0.1 — extrahera IPv4-delen.
  const mapped = addr.startsWith("::ffff:") ? addr.slice("::ffff:".length) : addr;

  const parts = mapped.split(".");
  if (parts.length !== 4) {
    // Ej en IPv4 (t.ex. publik IPv6) — behandla som publik.
    return false;
  }
  const [a, b] = parts.map((p) => Number(p));
  if (Number.isNaN(a) || Number.isNaN(b!)) return true;

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 172 && b! >= 16 && b! <= 31) return true; // 172.16.0.0/12
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 100 && b! >= 64 && b! <= 127) return true; // 100.64.0.0/10 CGNAT
  return false;
}
