// Metadata för alla 48 lag i VM 2026. Nyckeln matchar EXAKT namnet i
// data/worldcup2026.json (openfootball) så att seed kan koppla ihop dem.
// fifaRank är ungefärlig och används endast som sista tiebreak för bästa treor.

export interface TeamMeta {
  code: string; // FIFA 3-bokstavskod
  flag: string; // emoji
  fifaRank: number;
  group: string; // "A".."L"
}

export const TEAMS: Record<string, TeamMeta> = {
  // Grupp A
  Mexico: { code: "MEX", flag: "🇲🇽", fifaRank: 12, group: "A" },
  "South Korea": { code: "KOR", flag: "🇰🇷", fifaRank: 22, group: "A" },
  "South Africa": { code: "RSA", flag: "🇿🇦", fifaRank: 61, group: "A" },
  "Czech Republic": { code: "CZE", flag: "🇨🇿", fifaRank: 44, group: "A" },
  // Grupp B
  Canada: { code: "CAN", flag: "🇨🇦", fifaRank: 26, group: "B" },
  Switzerland: { code: "SUI", flag: "🇨🇭", fifaRank: 19, group: "B" },
  Qatar: { code: "QAT", flag: "🇶🇦", fifaRank: 36, group: "B" },
  "Bosnia & Herzegovina": { code: "BIH", flag: "🇧🇦", fifaRank: 75, group: "B" },
  // Grupp C
  Brazil: { code: "BRA", flag: "🇧🇷", fifaRank: 5, group: "C" },
  Morocco: { code: "MAR", flag: "🇲🇦", fifaRank: 11, group: "C" },
  Haiti: { code: "HAI", flag: "🇭🇹", fifaRank: 95, group: "C" },
  Scotland: { code: "SCO", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", fifaRank: 33, group: "C" },
  // Grupp D
  USA: { code: "USA", flag: "🇺🇸", fifaRank: 15, group: "D" },
  Paraguay: { code: "PAR", flag: "🇵🇾", fifaRank: 50, group: "D" },
  Australia: { code: "AUS", flag: "🇦🇺", fifaRank: 24, group: "D" },
  Turkey: { code: "TUR", flag: "🇹🇷", fifaRank: 27, group: "D" },
  // Grupp E
  Germany: { code: "GER", flag: "🇩🇪", fifaRank: 9, group: "E" },
  "Ivory Coast": { code: "CIV", flag: "🇨🇮", fifaRank: 40, group: "E" },
  Ecuador: { code: "ECU", flag: "🇪🇨", fifaRank: 23, group: "E" },
  "Curaçao": { code: "CUW", flag: "🇨🇼", fifaRank: 90, group: "E" },
  // Grupp F
  Netherlands: { code: "NED", flag: "🇳🇱", fifaRank: 6, group: "F" },
  Sweden: { code: "SWE", flag: "🇸🇪", fifaRank: 35, group: "F" },
  Tunisia: { code: "TUN", flag: "🇹🇳", fifaRank: 41, group: "F" },
  Japan: { code: "JPN", flag: "🇯🇵", fifaRank: 18, group: "F" },
  // Grupp G
  Belgium: { code: "BEL", flag: "🇧🇪", fifaRank: 8, group: "G" },
  Egypt: { code: "EGY", flag: "🇪🇬", fifaRank: 32, group: "G" },
  Iran: { code: "IRN", flag: "🇮🇷", fifaRank: 20, group: "G" },
  "New Zealand": { code: "NZL", flag: "🇳🇿", fifaRank: 86, group: "G" },
  // Grupp H
  Spain: { code: "ESP", flag: "🇪🇸", fifaRank: 2, group: "H" },
  "Cape Verde": { code: "CPV", flag: "🇨🇻", fifaRank: 70, group: "H" },
  "Saudi Arabia": { code: "KSA", flag: "🇸🇦", fifaRank: 60, group: "H" },
  Uruguay: { code: "URU", flag: "🇺🇾", fifaRank: 14, group: "H" },
  // Grupp I
  France: { code: "FRA", flag: "🇫🇷", fifaRank: 3, group: "I" },
  Senegal: { code: "SEN", flag: "🇸🇳", fifaRank: 17, group: "I" },
  Iraq: { code: "IRQ", flag: "🇮🇶", fifaRank: 58, group: "I" },
  Norway: { code: "NOR", flag: "🇳🇴", fifaRank: 25, group: "I" },
  // Grupp J
  Argentina: { code: "ARG", flag: "🇦🇷", fifaRank: 1, group: "J" },
  Algeria: { code: "ALG", flag: "🇩🇿", fifaRank: 38, group: "J" },
  Austria: { code: "AUT", flag: "🇦🇹", fifaRank: 21, group: "J" },
  Jordan: { code: "JOR", flag: "🇯🇴", fifaRank: 64, group: "J" },
  // Grupp K
  Portugal: { code: "POR", flag: "🇵🇹", fifaRank: 7, group: "K" },
  "DR Congo": { code: "COD", flag: "🇨🇩", fifaRank: 56, group: "K" },
  Uzbekistan: { code: "UZB", flag: "🇺🇿", fifaRank: 57, group: "K" },
  Colombia: { code: "COL", flag: "🇨🇴", fifaRank: 13, group: "K" },
  // Grupp L
  England: { code: "ENG", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", fifaRank: 4, group: "L" },
  Croatia: { code: "CRO", flag: "🇭🇷", fifaRank: 10, group: "L" },
  Ghana: { code: "GHA", flag: "🇬🇭", fifaRank: 73, group: "L" },
  Panama: { code: "PAN", flag: "🇵🇦", fifaRank: 30, group: "L" },
};
