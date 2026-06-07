// Väder för VM 2026:s spelplatser. Hämtas server-side från Open-Meteo (gratis,
// ingen API-nyckel) och cachas ~30 min. Koordinaterna pekar på respektive arena.
// Faller tillbaka tyst (tom lista) om API:t är nere.

export interface WeatherInfo {
  venue: string; // exakt venue-sträng från databasen
  city: string; // kort visningsnamn
  tempC: number | null; // aktuell temperatur
  high: number | null; // dagens max
  low: number | null; // dagens min
  code: number | null; // WMO-väderkod
  label: string; // svensk beskrivning
  emoji: string;
}

// Venue-sträng (Match.venue) -> arenakoordinater + kort stadsnamn.
const VENUE_COORDS: Record<string, { city: string; lat: number; lon: number }> = {
  "Atlanta": { city: "Atlanta", lat: 33.7553, lon: -84.4006 },
  "Boston (Foxborough)": { city: "Boston", lat: 42.0909, lon: -71.2643 },
  "Dallas (Arlington)": { city: "Dallas", lat: 32.7473, lon: -97.0945 },
  "Guadalajara (Zapopan)": { city: "Guadalajara", lat: 20.6819, lon: -103.4626 },
  "Houston": { city: "Houston", lat: 29.6847, lon: -95.4107 },
  "Kansas City": { city: "Kansas City", lat: 39.0489, lon: -94.4839 },
  "Los Angeles (Inglewood)": { city: "Los Angeles", lat: 33.9535, lon: -118.3392 },
  "Mexico City": { city: "Mexico City", lat: 19.3029, lon: -99.1505 },
  "Miami (Miami Gardens)": { city: "Miami", lat: 25.958, lon: -80.2389 },
  "Monterrey (Guadalupe)": { city: "Monterrey", lat: 25.6692, lon: -100.2444 },
  "New York/New Jersey (East Rutherford)": { city: "New York/NJ", lat: 40.8135, lon: -74.0745 },
  "Philadelphia": { city: "Philadelphia", lat: 39.9008, lon: -75.1675 },
  "San Francisco Bay Area (Santa Clara)": { city: "San Francisco", lat: 37.403, lon: -121.9698 },
  "Seattle": { city: "Seattle", lat: 47.5952, lon: -122.3316 },
  "Toronto": { city: "Toronto", lat: 43.6332, lon: -79.4185 },
  "Vancouver": { city: "Vancouver", lat: 49.2768, lon: -123.1119 },
};

const REVALIDATE_SECONDS = 1800;

// WMO weather code -> svensk beskrivning + emoji.
function codeInfo(code: number | null): { label: string; emoji: string } {
  if (code == null) return { label: "Okänt", emoji: "🌡️" };
  if (code === 0) return { label: "Klart", emoji: "☀️" };
  if (code === 1) return { label: "Mestadels klart", emoji: "🌤️" };
  if (code === 2) return { label: "Halvklart", emoji: "⛅" };
  if (code === 3) return { label: "Mulet", emoji: "☁️" };
  if (code === 45 || code === 48) return { label: "Dimma", emoji: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "Duggregn", emoji: "🌦️" };
  if (code >= 61 && code <= 67) return { label: "Regn", emoji: "🌧️" };
  if (code >= 71 && code <= 77) return { label: "Snö", emoji: "🌨️" };
  if (code >= 80 && code <= 82) return { label: "Regnskurar", emoji: "🌦️" };
  if (code === 85 || code === 86) return { label: "Snöbyar", emoji: "🌨️" };
  if (code >= 95) return { label: "Åska", emoji: "⛈️" };
  return { label: "Växlande", emoji: "🌥️" };
}

const round = (n: unknown): number | null =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;

interface OpenMeteoResult {
  current?: { temperature_2m?: number; weather_code?: number };
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
}

// Väder för dagens spelplatser (annars nästa matchdags), redo för nav-widgeten.
export interface DayWeather {
  isToday: boolean;
  items: WeatherInfo[];
}

interface MatchLite {
  kickoff: Date;
  venue: string;
  status: string;
}

// Avgör dagens relevanta arenor (eller nästa matchdags) och hämtar deras väder.
// Samma logik som dashboard/matcher tidigare hade inline — samlad här så att
// nav-widgeten och sidorna delar exakt samma urval.
export async function fetchDayWeather(matches: MatchLite[]): Promise<DayWeather> {
  const now = new Date();
  const dayKey = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const todays = matches.filter((m) => dayKey(m.kickoff) === dayKey(now));
  const nextUpcoming = matches.find((m) => m.status === "SCHEDULED" && m.kickoff > now) ?? null;
  const dayMatches = todays.length
    ? todays
    : nextUpcoming
      ? matches.filter((m) => dayKey(m.kickoff) === dayKey(nextUpcoming.kickoff))
      : [];
  const items = await fetchVenueWeather(dayMatches.map((m) => m.venue));
  return { isToday: todays.length > 0, items };
}

// Hämtar väder för en lista venue-strängar. Dedupar och behåller inkommande
// ordning. Okända venues hoppas över.
export async function fetchVenueWeather(venues: string[]): Promise<WeatherInfo[]> {
  const unique = [...new Set(venues)].filter((v) => VENUE_COORDS[v]);
  if (unique.length === 0) return [];

  const coords = unique.map((v) => VENUE_COORDS[v]);
  const lat = coords.map((c) => c.lat).join(",");
  const lon = coords.map((c) => c.lon).join(",");
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min` +
    `&timezone=auto&forecast_days=1`;

  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return [];
    const data = await res.json();
    const arr: OpenMeteoResult[] = Array.isArray(data) ? data : [data];

    return unique.map((venue, i) => {
      const r = arr[i] ?? {};
      const code = typeof r.current?.weather_code === "number" ? r.current.weather_code : null;
      const info = codeInfo(code);
      return {
        venue,
        city: VENUE_COORDS[venue].city,
        tempC: round(r.current?.temperature_2m),
        high: round(r.daily?.temperature_2m_max?.[0]),
        low: round(r.daily?.temperature_2m_min?.[0]),
        code,
        label: info.label,
        emoji: info.emoji,
      };
    });
  } catch {
    return [];
  }
}
