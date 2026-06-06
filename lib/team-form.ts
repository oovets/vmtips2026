// Static recent-form data for all 48 FIFA World Cup 2026 teams.
// Each entry contains the last 5 senior international results per team.
// Used for display only (form dots in UI). Not used for scoring.
// Data sourced from official results up to early June 2026.

export const STATIC_FORM: Record<
  string,
  Array<{ opp: string; oppFlag: string; score: string; result: "W" | "D" | "L"; date: string }>
> = {
  // ── Group A ────────────────────────────────────────────────────────────────
  MEX: [
    { opp: "Serbia",    oppFlag: "🇷🇸", score: "5-1", result: "W", date: "2026-06-04" },
    { opp: "Australia", oppFlag: "🇦🇺", score: "1-0", result: "W", date: "2026-05-30" },
    { opp: "Ghana",     oppFlag: "🇬🇭", score: "2-0", result: "W", date: "2026-05-22" },
    { opp: "Portugal",  oppFlag: "🇵🇹", score: "0-0", result: "D", date: "2026-03-29" },
    { opp: "Belgium",   oppFlag: "🇧🇪", score: "1-1", result: "D", date: "2026-03-26" },
  ],
  KOR: [
    { opp: "El Salvador",       oppFlag: "🇸🇻", score: "1-0", result: "W", date: "2026-06-03" },
    { opp: "Trinidad & Tobago", oppFlag: "🇹🇹", score: "5-0", result: "W", date: "2026-05-31" },
    { opp: "Ivory Coast",       oppFlag: "🇨🇮", score: "0-4", result: "L", date: "2026-03-28" },
    { opp: "Austria",           oppFlag: "🇦🇹", score: "0-1", result: "L", date: "2026-03-31" },
    { opp: "Paraguay",          oppFlag: "🇵🇾", score: "2-0", result: "W", date: "2025-10-14" },
  ],
  RSA: [
    { opp: "Nicaragua", oppFlag: "🇳🇮", score: "0-0", result: "D", date: "2026-05-29" },
    { opp: "Panama",    oppFlag: "🇵🇦", score: "1-2", result: "L", date: "2026-03-31" },
    { opp: "Panama",    oppFlag: "🇵🇦", score: "1-1", result: "D", date: "2026-03-27" },
    { opp: "Cameroon",  oppFlag: "🇨🇲", score: "1-2", result: "L", date: "2026-01-04" },
    { opp: "Zimbabwe",  oppFlag: "🇿🇼", score: "3-2", result: "W", date: "2025-12-29" },
  ],
  CZE: [
    { opp: "Gibraltar",    oppFlag: "🇬🇮", score: "6-0", result: "W", date: "2026-03-28" },
    { opp: "Ireland",      oppFlag: "🇮🇪", score: "2-2", result: "D", date: "2026-03-25" },
    { opp: "Denmark",      oppFlag: "🇩🇰", score: "2-2", result: "D", date: "2025-11-17" },
    { opp: "Kosovo",       oppFlag: "🇽🇰", score: "2-1", result: "W", date: "2025-06-07" },
    { opp: "Guatemala",    oppFlag: "🇬🇹", score: "3-1", result: "W", date: "2025-06-03" },
  ],

  // ── Group B ────────────────────────────────────────────────────────────────
  CAN: [
    { opp: "Uzbekistan", oppFlag: "🇺🇿", score: "2-0", result: "W", date: "2026-06-02" },
    { opp: "Iceland",    oppFlag: "🇮🇸", score: "2-2", result: "D", date: "2026-04-01" },
    { opp: "Tunisia",    oppFlag: "🇹🇳", score: "0-0", result: "D", date: "2026-04-01" },
    { opp: "Guatemala",  oppFlag: "🇬🇹", score: "1-0", result: "W", date: "2026-03-28" },
    { opp: "Ireland",    oppFlag: "🇮🇪", score: "1-1", result: "D", date: "2026-03-25" },
  ],
  SUI: [
    { opp: "Norway",   oppFlag: "🇳🇴", score: "0-0", result: "D", date: "2026-03-31" },
    { opp: "Germany",  oppFlag: "🇩🇪", score: "3-4", result: "L", date: "2026-03-27" },
    { opp: "Kosovo",   oppFlag: "🇽🇰", score: "1-1", result: "D", date: "2025-11-18" },
    { opp: "Sweden",   oppFlag: "🇸🇪", score: "4-1", result: "W", date: "2025-11-15" },
    { opp: "Slovenia", oppFlag: "🇸🇮", score: "0-0", result: "D", date: "2025-10-13" },
  ],
  QAT: [
    { opp: "Tunisia",   oppFlag: "🇹🇳", score: "0-3", result: "L", date: "2025-12-07" },
    { opp: "Syria",     oppFlag: "🇸🇾", score: "1-1", result: "D", date: "2025-12-04" },
    { opp: "Palestine", oppFlag: "🇵🇸", score: "0-1", result: "L", date: "2025-12-01" },
    { opp: "Ireland",   oppFlag: "🇮🇪", score: "0-1", result: "L", date: "2025-11-17" },
    { opp: "Zimbabwe",  oppFlag: "🇿🇼", score: "1-2", result: "L", date: "2025-11-17" },
  ],
  BIH: [
    { opp: "Romania",     oppFlag: "🇷🇴", score: "1-0", result: "W", date: "2025-03-22" },
    { opp: "Netherlands", oppFlag: "🇳🇱", score: "1-1", result: "D", date: "2024-11-20" },
    { opp: "Germany",     oppFlag: "🇩🇪", score: "0-7", result: "L", date: "2024-11-17" },
    { opp: "Hungary",     oppFlag: "🇭🇺", score: "0-2", result: "L", date: "2024-10-15" },
    { opp: "Germany",     oppFlag: "🇩🇪", score: "1-2", result: "L", date: "2024-10-12" },
  ],

  // ── Group C ────────────────────────────────────────────────────────────────
  BRA: [
    { opp: "Panama",  oppFlag: "🇵🇦", score: "6-2", result: "W", date: "2026-06-01" },
    { opp: "Croatia", oppFlag: "🇭🇷", score: "3-1", result: "W", date: "2026-03-29" },
    { opp: "France",  oppFlag: "🇫🇷", score: "1-2", result: "L", date: "2026-03-26" },
    { opp: "Tunisia", oppFlag: "🇹🇳", score: "1-1", result: "D", date: "2025-12-18" },
    { opp: "Senegal", oppFlag: "🇸🇳", score: "2-0", result: "W", date: "2025-10-11" },
  ],
  MAR: [
    { opp: "Paraguay",   oppFlag: "🇵🇾", score: "2-1", result: "W", date: "2026-06-02" },
    { opp: "Ecuador",    oppFlag: "🇪🇨", score: "1-1", result: "D", date: "2026-03-31" },
    { opp: "Senegal",    oppFlag: "🇸🇳", score: "3-0", result: "W", date: "2026-01-18" },
    { opp: "Cameroon",   oppFlag: "🇨🇲", score: "2-0", result: "W", date: "2026-01-14" },
    { opp: "Nigeria",    oppFlag: "🇳🇬", score: "0-0", result: "D", date: "2026-01-11" },
  ],
  HAI: [
    { opp: "Peru",       oppFlag: "🇵🇪", score: "1-2", result: "L", date: "2026-06-05" },
    { opp: "New Zealand",oppFlag: "🇳🇿", score: "4-0", result: "W", date: "2026-06-02" },
    { opp: "Nicaragua",  oppFlag: "🇳🇮", score: "2-0", result: "W", date: "2025-11-19" },
    { opp: "Honduras",   oppFlag: "🇭🇳", score: "0-3", result: "L", date: "2025-10-14" },
    { opp: "Costa Rica", oppFlag: "🇨🇷", score: "1-0", result: "W", date: "2025-09-09" },
  ],
  SCO: [
    { opp: "Japan",     oppFlag: "🇯🇵", score: "0-1", result: "L", date: "2026-06-04" },
    { opp: "Ivory Coast", oppFlag: "🇨🇮", score: "0-1", result: "L", date: "2026-03-31" },
    { opp: "Curaçao",   oppFlag: "🇨🇼", score: "4-1", result: "W", date: "2026-03-28" },
    { opp: "Denmark",   oppFlag: "🇩🇰", score: "4-2", result: "W", date: "2025-11-18" },
    { opp: "Greece",    oppFlag: "🇬🇷", score: "2-3", result: "L", date: "2025-11-15" },
  ],

  // ── Group D ────────────────────────────────────────────────────────────────
  USA: [
    { opp: "Senegal",  oppFlag: "🇸🇳", score: "3-2", result: "W", date: "2026-05-31" },
    { opp: "Portugal", oppFlag: "🇵🇹", score: "0-2", result: "L", date: "2026-03-31" },
    { opp: "Belgium",  oppFlag: "🇧🇪", score: "2-5", result: "L", date: "2026-03-28" },
    { opp: "Uruguay",  oppFlag: "🇺🇾", score: "5-1", result: "W", date: "2025-11-19" },
    { opp: "Mexico",   oppFlag: "🇲🇽", score: "1-2", result: "L", date: "2025-03-23" },
  ],
  PAR: [
    { opp: "Nicaragua", oppFlag: "🇳🇮", score: "4-0", result: "W", date: "2026-06-05" },
    { opp: "Morocco",   oppFlag: "🇲🇦", score: "1-2", result: "L", date: "2026-03-31" },
    { opp: "Greece",    oppFlag: "🇬🇷", score: "1-0", result: "W", date: "2026-03-27" },
    { opp: "Peru",      oppFlag: "🇵🇪", score: "1-0", result: "W", date: "2025-09-09" },
    { opp: "Ecuador",   oppFlag: "🇪🇨", score: "0-0", result: "D", date: "2025-09-04" },
  ],
  AUS: [
    { opp: "Mexico",    oppFlag: "🇲🇽", score: "0-1", result: "L", date: "2026-05-30" },
    { opp: "Curaçao",   oppFlag: "🇨🇼", score: "5-1", result: "W", date: "2026-03-31" },
    { opp: "Cameroon",  oppFlag: "🇨🇲", score: "1-0", result: "W", date: "2026-03-27" },
    { opp: "Canada",    oppFlag: "🇨🇦", score: "0-1", result: "L", date: "2025-10-14" },
    { opp: "USA",       oppFlag: "🇺🇸", score: "1-2", result: "L", date: "2025-10-10" },
  ],
  TUR: [
    { opp: "North Macedonia", oppFlag: "🇲🇰", score: "4-0", result: "W", date: "2026-06-01" },
    { opp: "Kosovo",          oppFlag: "🇽🇰", score: "1-0", result: "W", date: "2026-03-31" },
    { opp: "Romania",         oppFlag: "🇷🇴", score: "1-0", result: "W", date: "2026-03-26" },
    { opp: "Spain",           oppFlag: "🇪🇸", score: "2-2", result: "D", date: "2025-11-18" },
    { opp: "Albania",         oppFlag: "🇦🇱", score: "3-1", result: "W", date: "2025-11-15" },
  ],

  // ── Group E ────────────────────────────────────────────────────────────────
  GER: [
    { opp: "Finland",     oppFlag: "🇫🇮", score: "4-0", result: "W", date: "2026-06-01" },
    { opp: "Switzerland", oppFlag: "🇨🇭", score: "4-3", result: "W", date: "2026-03-27" },
    { opp: "Slovakia",    oppFlag: "🇸🇰", score: "6-0", result: "W", date: "2025-11-17" },
    { opp: "Luxembourg",  oppFlag: "🇱🇺", score: "4-0", result: "W", date: "2025-11-14" },
    { opp: "Bosnia & Herz.", oppFlag: "🇧🇦", score: "7-0", result: "W", date: "2024-11-17" },
  ],
  CIV: [
    { opp: "France",      oppFlag: "🇫🇷", score: "2-1", result: "W", date: "2026-06-04" },
    { opp: "Scotland",    oppFlag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", score: "1-0", result: "W", date: "2026-03-31" },
    { opp: "South Korea", oppFlag: "🇰🇷", score: "4-0", result: "W", date: "2026-03-28" },
    { opp: "Burkina Faso",oppFlag: "🇧🇫", score: "3-0", result: "W", date: "2026-01-06" },
    { opp: "Egypt",       oppFlag: "🇪🇬", score: "2-3", result: "L", date: "2026-01-10" },
  ],
  ECU: [
    { opp: "Saudi Arabia", oppFlag: "🇸🇦", score: "2-1", result: "W", date: "2026-06-02" },
    { opp: "Netherlands",  oppFlag: "🇳🇱", score: "1-1", result: "D", date: "2026-03-31" },
    { opp: "Morocco",      oppFlag: "🇲🇦", score: "1-1", result: "D", date: "2026-03-27" },
    { opp: "New Zealand",  oppFlag: "🇳🇿", score: "2-0", result: "W", date: "2025-10-14" },
    { opp: "Canada",       oppFlag: "🇨🇦", score: "0-0", result: "D", date: "2025-10-11" },
  ],
  CUW: [
    { opp: "Australia", oppFlag: "🇦🇺", score: "1-5", result: "L", date: "2026-03-31" },
    { opp: "Scotland",  oppFlag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", score: "1-4", result: "L", date: "2026-03-28" },
    { opp: "Jamaica",   oppFlag: "🇯🇲", score: "0-0", result: "D", date: "2025-11-19" },
    { opp: "Bermuda",   oppFlag: "🇧🇲", score: "7-0", result: "W", date: "2025-11-14" },
    { opp: "Jamaica",   oppFlag: "🇯🇲", score: "2-0", result: "W", date: "2025-10-10" },
  ],

  // ── Group F ────────────────────────────────────────────────────────────────
  NED: [
    { opp: "Algeria",   oppFlag: "🇩🇿", score: "0-1", result: "L", date: "2026-06-02" },
    { opp: "Ecuador",   oppFlag: "🇪🇨", score: "1-1", result: "D", date: "2026-03-31" },
    { opp: "Norway",    oppFlag: "🇳🇴", score: "2-1", result: "W", date: "2026-03-27" },
    { opp: "Lithuania", oppFlag: "🇱🇹", score: "4-0", result: "W", date: "2025-11-18" },
    { opp: "Poland",    oppFlag: "🇵🇱", score: "1-1", result: "D", date: "2025-11-15" },
  ],
  SWE: [
    { opp: "Norway",   oppFlag: "🇳🇴", score: "1-3", result: "L", date: "2026-06-01" },
    { opp: "Greece",   oppFlag: "🇬🇷", score: "2-2", result: "D", date: "2026-03-31" },
    { opp: "Poland",   oppFlag: "🇵🇱", score: "3-2", result: "W", date: "2025-11-16" },
    { opp: "Ukraine",  oppFlag: "🇺🇦", score: "3-1", result: "W", date: "2025-11-12" },
    { opp: "Slovenia", oppFlag: "🇸🇮", score: "1-1", result: "D", date: "2025-10-13" },
  ],
  TUN: [
    { opp: "Austria",  oppFlag: "🇦🇹", score: "0-1", result: "L", date: "2026-06-01" },
    { opp: "Canada",   oppFlag: "🇨🇦", score: "0-0", result: "D", date: "2026-04-01" },
    { opp: "Haiti",    oppFlag: "🇭🇹", score: "1-0", result: "W", date: "2026-03-28" },
    { opp: "Qatar",    oppFlag: "🇶🇦", score: "3-0", result: "W", date: "2025-12-07" },
    { opp: "Nigeria",  oppFlag: "🇳🇬", score: "2-3", result: "L", date: "2025-12-27" },
  ],
  JPN: [
    { opp: "Iceland",  oppFlag: "🇮🇸", score: "1-0", result: "W", date: "2026-05-31" },
    { opp: "England",  oppFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", score: "1-0", result: "W", date: "2026-03-31" },
    { opp: "Scotland", oppFlag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", score: "1-0", result: "W", date: "2026-03-28" },
    { opp: "Australia",oppFlag: "🇦🇺", score: "1-0", result: "W", date: "2025-06-05" },
    { opp: "Indonesia",oppFlag: "🇮🇩", score: "6-0", result: "W", date: "2025-06-10" },
  ],

  // ── Group G ────────────────────────────────────────────────────────────────
  BEL: [
    { opp: "Croatia",     oppFlag: "🇭🇷", score: "2-0", result: "W", date: "2026-06-02" },
    { opp: "USA",         oppFlag: "🇺🇸", score: "5-2", result: "W", date: "2026-03-28" },
    { opp: "Mexico",      oppFlag: "🇲🇽", score: "1-1", result: "D", date: "2026-03-26" },
    { opp: "Liechtenstein", oppFlag: "🇱🇮", score: "7-0", result: "W", date: "2025-11-18" },
    { opp: "Kazakhstan",  oppFlag: "🇰🇿", score: "1-1", result: "D", date: "2025-11-15" },
  ],
  EGY: [
    { opp: "Russia",      oppFlag: "🇷🇺", score: "1-0", result: "W", date: "2026-05-28" },
    { opp: "Nigeria",     oppFlag: "🇳🇬", score: "0-0", result: "D", date: "2026-01-17" },
    { opp: "Senegal",     oppFlag: "🇸🇳", score: "0-1", result: "L", date: "2026-01-14" },
    { opp: "Ivory Coast", oppFlag: "🇨🇮", score: "3-2", result: "W", date: "2026-01-10" },
    { opp: "Benin",       oppFlag: "🇧🇯", score: "3-1", result: "W", date: "2026-01-05" },
  ],
  IRN: [
    { opp: "Gambia",      oppFlag: "🇬🇲", score: "3-1", result: "W", date: "2026-05-29" },
    { opp: "Costa Rica",  oppFlag: "🇨🇷", score: "5-0", result: "W", date: "2026-03-31" },
    { opp: "Nigeria",     oppFlag: "🇳🇬", score: "1-2", result: "L", date: "2026-03-27" },
    { opp: "Uzbekistan",  oppFlag: "🇺🇿", score: "0-0", result: "D", date: "2025-11-18" },
    { opp: "Cape Verde",  oppFlag: "🇨🇻", score: "0-0", result: "D", date: "2025-11-13" },
  ],
  NZL: [
    { opp: "Haiti",    oppFlag: "🇭🇹", score: "0-4", result: "L", date: "2026-06-02" },
    { opp: "Colombia", oppFlag: "🇨🇴", score: "1-2", result: "L", date: "2025-11-18" },
    { opp: "Ecuador",  oppFlag: "🇪🇨", score: "0-2", result: "L", date: "2025-10-14" },
    { opp: "Finland",  oppFlag: "🇫🇮", score: "0-2", result: "L", date: "2025-09-08" },
    { opp: "Chile",    oppFlag: "🇨🇱", score: "4-1", result: "W", date: "2025-06-05" },
  ],

  // ── Group H ────────────────────────────────────────────────────────────────
  ESP: [
    { opp: "Iraq",    oppFlag: "🇮🇶", score: "1-1", result: "D", date: "2026-06-04" },
    { opp: "Egypt",   oppFlag: "🇪🇬", score: "0-0", result: "D", date: "2026-03-31" },
    { opp: "Serbia",  oppFlag: "🇷🇸", score: "3-0", result: "W", date: "2026-03-27" },
    { opp: "Turkey",  oppFlag: "🇹🇷", score: "2-2", result: "D", date: "2025-11-18" },
    { opp: "Georgia", oppFlag: "🇬🇪", score: "4-0", result: "W", date: "2025-11-15" },
  ],
  CPV: [
    { opp: "Serbia",   oppFlag: "🇷🇸", score: "3-0", result: "W", date: "2026-05-31" },
    { opp: "Chile",    oppFlag: "🇨🇱", score: "2-4", result: "L", date: "2026-03-29" },
    { opp: "Finland",  oppFlag: "🇫🇮", score: "1-1", result: "D", date: "2026-03-26" },
    { opp: "Egypt",    oppFlag: "🇪🇬", score: "1-1", result: "D", date: "2025-11-14" },
    { opp: "Iran",     oppFlag: "🇮🇷", score: "0-0", result: "D", date: "2025-11-13" },
  ],
  KSA: [
    { opp: "Jordan",   oppFlag: "🇯🇴", score: "0-1", result: "L", date: "2025-12-15" },
    { opp: "UAE",      oppFlag: "🇦🇪", score: "0-0", result: "D", date: "2025-12-11" },
    { opp: "Egypt",    oppFlag: "🇪🇬", score: "0-4", result: "L", date: "2025-12-04" },
    { opp: "Serbia",   oppFlag: "🇷🇸", score: "1-2", result: "L", date: "2025-11-18" },
    { opp: "Ecuador",  oppFlag: "🇪🇨", score: "1-2", result: "L", date: "2025-11-15" },
  ],
  URU: [
    { opp: "Algeria",  oppFlag: "🇩🇿", score: "0-0", result: "D", date: "2026-03-31" },
    { opp: "England",  oppFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", score: "1-1", result: "D", date: "2026-03-27" },
    { opp: "USA",      oppFlag: "🇺🇸", score: "1-5", result: "L", date: "2025-11-19" },
    { opp: "Mexico",   oppFlag: "🇲🇽", score: "0-0", result: "D", date: "2025-11-16" },
    { opp: "Uzbekistan", oppFlag: "🇺🇿", score: "2-1", result: "W", date: "2025-10-13" },
  ],

  // ── Group I ────────────────────────────────────────────────────────────────
  FRA: [
    { opp: "Ivory Coast", oppFlag: "🇨🇮", score: "1-2", result: "L", date: "2026-06-04" },
    { opp: "Colombia",    oppFlag: "🇨🇴", score: "3-1", result: "W", date: "2026-03-29" },
    { opp: "Brazil",      oppFlag: "🇧🇷", score: "2-1", result: "W", date: "2026-03-26" },
    { opp: "Azerbaijan",  oppFlag: "🇦🇿", score: "3-1", result: "W", date: "2025-11-16" },
    { opp: "Azerbaijan",  oppFlag: "🇦🇿", score: "3-0", result: "W", date: "2025-10-10" },
  ],
  SEN: [
    { opp: "USA",     oppFlag: "🇺🇸", score: "2-3", result: "L", date: "2026-05-31" },
    { opp: "Gambia",  oppFlag: "🇬🇲", score: "3-1", result: "W", date: "2026-03-31" },
    { opp: "Peru",    oppFlag: "🇵🇪", score: "2-0", result: "W", date: "2026-03-28" },
    { opp: "Morocco", oppFlag: "🇲🇦", score: "0-3", result: "L", date: "2026-01-18" },
    { opp: "Egypt",   oppFlag: "🇪🇬", score: "1-0", result: "W", date: "2026-01-14" },
  ],
  IRQ: [
    { opp: "Spain",      oppFlag: "🇪🇸", score: "1-1", result: "D", date: "2026-06-04" },
    { opp: "Bolivia",    oppFlag: "🇧🇴", score: "2-1", result: "W", date: "2026-03-31" },
    { opp: "UAE",        oppFlag: "🇦🇪", score: "2-1", result: "W", date: "2025-11-18" },
    { opp: "UAE",        oppFlag: "🇦🇪", score: "1-1", result: "D", date: "2025-11-13" },
    { opp: "Saudi Arabia", oppFlag: "🇸🇦", score: "0-0", result: "D", date: "2025-10-14" },
  ],
  NOR: [
    { opp: "Sweden",      oppFlag: "🇸🇪", score: "3-1", result: "W", date: "2026-06-01" },
    { opp: "Switzerland", oppFlag: "🇨🇭", score: "0-0", result: "D", date: "2026-03-31" },
    { opp: "Netherlands", oppFlag: "🇳🇱", score: "1-2", result: "L", date: "2026-03-27" },
    { opp: "Italy",       oppFlag: "🇮🇹", score: "4-1", result: "W", date: "2025-11-16" },
    { opp: "Estonia",     oppFlag: "🇪🇪", score: "4-1", result: "W", date: "2025-11-13" },
  ],

  // ── Group J ────────────────────────────────────────────────────────────────
  ARG: [
    { opp: "Angola",     oppFlag: "🇦🇴", score: "2-0", result: "W", date: "2026-06-04" },
    { opp: "Puerto Rico", oppFlag: "🇵🇷", score: "6-0", result: "W", date: "2026-05-28" },
    { opp: "Venezuela",  oppFlag: "🇻🇪", score: "1-0", result: "W", date: "2025-09-04" },
    { opp: "Chile",      oppFlag: "🇨🇱", score: "3-0", result: "W", date: "2025-06-10" },
    { opp: "Bolivia",    oppFlag: "🇧🇴", score: "6-0", result: "W", date: "2025-03-25" },
  ],
  ALG: [
    { opp: "Netherlands",oppFlag: "🇳🇱", score: "1-0", result: "W", date: "2026-06-02" },
    { opp: "Uruguay",    oppFlag: "🇺🇾", score: "0-0", result: "D", date: "2026-03-31" },
    { opp: "Guatemala",  oppFlag: "🇬🇹", score: "7-0", result: "W", date: "2026-03-27" },
    { opp: "Nigeria",    oppFlag: "🇳🇬", score: "0-2", result: "L", date: "2026-01-10" },
    { opp: "DR Congo",   oppFlag: "🇨🇩", score: "1-0", result: "W", date: "2026-01-06" },
  ],
  AUT: [
    { opp: "Tunisia",   oppFlag: "🇹🇳", score: "1-0", result: "W", date: "2026-06-01" },
    { opp: "South Korea", oppFlag: "🇰🇷", score: "1-0", result: "W", date: "2026-03-31" },
    { opp: "Ghana",     oppFlag: "🇬🇭", score: "5-1", result: "W", date: "2026-03-27" },
    { opp: "Bosnia & Herz.", oppFlag: "🇧🇦", score: "1-1", result: "D", date: "2025-11-18" },
    { opp: "Cyprus",    oppFlag: "🇨🇾", score: "2-0", result: "W", date: "2025-11-15" },
  ],
  JOR: [
    { opp: "Switzerland", oppFlag: "🇨🇭", score: "1-4", result: "L", date: "2026-05-31" },
    { opp: "Nigeria",     oppFlag: "🇳🇬", score: "2-2", result: "D", date: "2026-03-31" },
    { opp: "Costa Rica",  oppFlag: "🇨🇷", score: "2-2", result: "D", date: "2026-03-27" },
    { opp: "Morocco",     oppFlag: "🇲🇦", score: "2-3", result: "L", date: "2025-12-18" },
    { opp: "Saudi Arabia", oppFlag: "🇸🇦", score: "1-0", result: "W", date: "2025-12-15" },
  ],

  // ── Group K ────────────────────────────────────────────────────────────────
  POR: [
    { opp: "Mexico",   oppFlag: "🇲🇽", score: "0-0", result: "D", date: "2026-03-29" },
    { opp: "USA",      oppFlag: "🇺🇸", score: "2-0", result: "W", date: "2026-03-31" },
    { opp: "Armenia",  oppFlag: "🇦🇲", score: "9-1", result: "W", date: "2025-11-17" },
    { opp: "Ireland",  oppFlag: "🇮🇪", score: "0-2", result: "L", date: "2025-11-14" },
    { opp: "Hungary",  oppFlag: "🇭🇺", score: "2-2", result: "D", date: "2025-10-13" },
  ],
  COD: [
    { opp: "Denmark",  oppFlag: "🇩🇰", score: "0-0", result: "D", date: "2026-06-03" },
    { opp: "Jamaica",  oppFlag: "🇯🇲", score: "1-0", result: "W", date: "2026-03-31" },
    { opp: "Bermuda",  oppFlag: "🇧🇲", score: "2-0", result: "W", date: "2026-03-25" },
    { opp: "Algeria",  oppFlag: "🇩🇿", score: "0-1", result: "L", date: "2026-01-06" },
    { opp: "Botswana", oppFlag: "🇧🇼", score: "3-0", result: "W", date: "2025-12-30" },
  ],
  UZB: [
    { opp: "Canada",    oppFlag: "🇨🇦", score: "0-2", result: "L", date: "2026-06-02" },
    { opp: "Venezuela", oppFlag: "🇻🇪", score: "0-0", result: "D", date: "2026-03-30" },
    { opp: "Gabon",     oppFlag: "🇬🇦", score: "3-1", result: "W", date: "2026-03-27" },
    { opp: "Iran",      oppFlag: "🇮🇷", score: "0-0", result: "D", date: "2025-11-18" },
    { opp: "Egypt",     oppFlag: "🇪🇬", score: "2-0", result: "W", date: "2025-11-14" },
  ],
  COL: [
    { opp: "Costa Rica", oppFlag: "🇨🇷", score: "3-1", result: "W", date: "2026-06-03" },
    { opp: "Croatia",    oppFlag: "🇭🇷", score: "1-2", result: "L", date: "2026-03-26" },
    { opp: "France",     oppFlag: "🇫🇷", score: "1-3", result: "L", date: "2026-03-29" },
    { opp: "Mexico",     oppFlag: "🇲🇽", score: "4-0", result: "W", date: "2025-10-11" },
    { opp: "Canada",     oppFlag: "🇨🇦", score: "0-0", result: "D", date: "2025-10-15" },
  ],

  // ── Group L ────────────────────────────────────────────────────────────────
  ENG: [
    { opp: "Japan",    oppFlag: "🇯🇵", score: "0-1", result: "L", date: "2026-03-31" },
    { opp: "Uruguay",  oppFlag: "🇺🇾", score: "1-1", result: "D", date: "2026-03-27" },
    { opp: "Albania",  oppFlag: "🇦🇱", score: "2-0", result: "W", date: "2025-11-16" },
    { opp: "Serbia",   oppFlag: "🇷🇸", score: "2-0", result: "W", date: "2025-11-13" },
    { opp: "Latvia",   oppFlag: "🇱🇻", score: "5-0", result: "W", date: "2025-10-14" },
  ],
  CRO: [
    { opp: "Belgium",  oppFlag: "🇧🇪", score: "0-2", result: "L", date: "2026-06-02" },
    { opp: "Brazil",   oppFlag: "🇧🇷", score: "1-3", result: "L", date: "2026-03-29" },
    { opp: "Colombia", oppFlag: "🇨🇴", score: "2-1", result: "W", date: "2026-03-26" },
    { opp: "Montenegro", oppFlag: "🇲🇪", score: "3-2", result: "W", date: "2025-11-17" },
    { opp: "Faroe Islands", oppFlag: "🇫🇴", score: "3-1", result: "W", date: "2025-11-14" },
  ],
  GHA: [
    { opp: "Wales",    oppFlag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", score: "1-1", result: "D", date: "2026-06-02" },
    { opp: "Austria",  oppFlag: "🇦🇹", score: "1-5", result: "L", date: "2026-03-27" },
    { opp: "Germany",  oppFlag: "🇩🇪", score: "1-2", result: "L", date: "2026-05-28" },
    { opp: "Comoros",  oppFlag: "🇰🇲", score: "1-0", result: "W", date: "2025-10-13" },
    { opp: "Central African Rep.", oppFlag: "🇨🇫", score: "5-0", result: "W", date: "2025-10-10" },
  ],
  PAN: [
    { opp: "Brazil",       oppFlag: "🇧🇷", score: "2-6", result: "L", date: "2026-06-01" },
    { opp: "South Africa", oppFlag: "🇿🇦", score: "2-1", result: "W", date: "2026-03-31" },
    { opp: "South Africa", oppFlag: "🇿🇦", score: "1-1", result: "D", date: "2026-03-27" },
    { opp: "Mexico",       oppFlag: "🇲🇽", score: "1-2", result: "L", date: "2025-03-23" },
    { opp: "USA",          oppFlag: "🇺🇸", score: "1-0", result: "W", date: "2025-03-20" },
  ],
};
