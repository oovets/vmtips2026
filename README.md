# VM-tips 2026 ⚽

Delad liga för att tippa fotbolls-VM 2026 — tippa alla gruppmatcher, vilka som går
vidare ur grupperna, och bygg ditt eget slutspelsträd hela vägen till världsmästaren.
Följ poängen live under turneringen.

## Funktioner

- **Delad liga** — skapa en liga, dela koden, kompisarna går med (namn + 4-siffrig PIN).
- **Tippa allt** — exakt resultat i alla 72 gruppmatcher, automatiskt härledda gruppställningar,
  och en interaktiv slutspelsbyggare (R32 → final).
- **Live-poäng** — resultat hämtas automatiskt från football-data.org och poängen räknas om.
- **Topplista** med poänguppdelning, gruppställningar och matchöversikt.
- **Admin** — manuell resultatinmatning som skyddsnät + trigga synk/omräkning.

## Poäng (justeras i [`lib/scoring.ts`](lib/scoring.ts))

| Vad | Poäng |
| --- | --- |
| Exakt resultat (gruppmatch) | 5 |
| Rätt utfall + rätt målskillnad | 3 |
| Rätt utfall (1/X/2) | 2 |
| Lag som går vidare (per lag, topp 2) | 3 |
| Bonus: båda topp-2 i rätt ordning | 2 |
| Lag når åttondel / kvart / semi / final | 2 / 4 / 6 / 8 |
| Rätt världsmästare | 15 |

## Kom igång (lokalt)

```bash
cp .env.example .env          # fyll i SESSION_SECRET m.m.
docker compose up -d          # PostgreSQL på port 5439
npm install
npm run db:push               # skapa tabeller
npm run seed                  # ladda 48 lag, 12 grupper, 104 matcher
npm run dev                   # http://localhost:3000
```

Skapa en liga, gå med som flera spelare i olika webbläsarfönster, tippa och lämna in.

### Testa "öppet" läge

Tipsen låses vid `LOCK_AT` (default = första avspark 2026-06-11). Sätt en framtida tid
i `.env` för att kunna tippa fritt under utveckling.

## Resultatsynk

- **Automatiskt:** skaffa en gratis nyckel på <https://www.football-data.org> och sätt
  `FOOTBALL_DATA_API_KEY`. På Vercel kör [`vercel.json`](vercel.json) cron-jobbet
  `/api/cron/sync-results` (skyddas av `CRON_SECRET`). Obs: sub-daglig cron kan kräva Vercel Pro.
- **Manuellt:** logga in som admin ( liga-skaparen) → fliken **Admin** → mata in resultat
  eller tryck "Synka från API". Kräver `ADMIN_PIN`.

## Deploy

Vercel + en hostad Postgres (t.ex. Neon). Sätt env-variablerna i Vercel-projektet
(`DATABASE_URL`, `SESSION_SECRET`, `FOOTBALL_DATA_API_KEY`, `CRON_SECRET`, `ADMIN_PIN`, `LOCK_AT`),
kör `npm run db:push` och `npm run seed` mot produktions-DB:n.

## Tester

```bash
npm test     # poäng-, standings- och bracket-logik (Vitest)
```

## Teknik

Next.js 14 (App Router) · TypeScript · Tailwind · Prisma · PostgreSQL · SWR ·
data från [openfootball](https://github.com/openfootball/worldcup.json) (schema) och
[football-data.org](https://www.football-data.org) (live-resultat).
