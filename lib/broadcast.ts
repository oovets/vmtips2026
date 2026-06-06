// Sändningskanal per match. VM 2026 visas i Sverige av flera kanaler/tjänster.
// Kanalen lagras per match i `Match.channel` (svensk kanal-text). Här mappar vi
// kanalnamnet till en ikon + färg för UI:t. Saknas kanal returneras null.

export interface Broadcaster {
  name: string;
  short: string;
  icon: string; // emoji som fallback om logotypen inte laddar
  color: string; // tailwind text/bg-färgklasser för chipen
  domain: string | null; // domän för officiell logotyp (favicon), null = ingen bild
}

// URL till kanalens officiella logotyp via Googles publika favicon-tjänst.
export function broadcasterLogo(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

// Kända svenska kanaler. Nyckeln matchas skiftlägesokänsligt mot Match.channel.
const CHANNELS: Record<string, Broadcaster> = {
  svt: { name: "SVT", short: "SVT", icon: "📺", color: "bg-pitch-500/15 text-pitch-200", domain: "svtplay.se" },
  tv4: { name: "TV4", short: "TV4", icon: "🔴", color: "bg-red-500/15 text-red-200", domain: "tv4play.se" },
  viaplay: { name: "Viaplay", short: "Viaplay", icon: "🟣", color: "bg-purple-500/15 text-purple-200", domain: "viaplay.se" },
};

// Slår upp en kanal från Match.channel. Okänd/tom kanal → null (visa ingen chip).
// En kanal som inte finns i listan visas ändå med en neutral stil.
export function broadcasterFor(channel: string | null | undefined): Broadcaster | null {
  if (!channel) return null;
  const key = channel.trim().toLowerCase();
  if (!key) return null;
  return (
    CHANNELS[key] ?? {
      name: channel.trim(),
      short: channel.trim(),
      icon: "📺",
      color: "bg-white/10 text-slate-300",
      domain: null,
    }
  );
}
