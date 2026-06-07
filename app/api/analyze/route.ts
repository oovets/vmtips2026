import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import type { FormEntry } from "@/lib/football-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Ej inloggad" }, { status: 401 });

  // Varje anrop kostar pengar (Anthropic). Begränsa per användare.
  if (!rateLimit(`analyze:${user.id}`, 3, 60_000)) {
    return NextResponse.json({ error: "Vänta lite mellan analyser." }, { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY saknas" }, { status: 503 });

  const [teams, matches] = await Promise.all([
    prisma.team.findMany({ orderBy: { fifaRank: "asc" } }),
    prisma.match.findMany({
      where: { stage: "GROUP" },
      orderBy: [{ groupId: "asc" }, { matchNumber: "asc" }],
      select: { matchNumber: true, groupId: true, homeTeamId: true, awayTeamId: true },
    }),
  ]);

  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // Build a concise data summary for Claude
  const teamLines = teams.map((t) => {
    const form = (t.recentForm as unknown as FormEntry[]).slice(0, 5);
    const formStr = form.length
      ? form.map((f) => `${f.result}(vs ${f.opp} ${f.score})`).join(" ")
      : "ingen form-data";
    return `${t.flag} ${t.code} ${t.name} | FIFA #${t.fifaRank} | Form: ${formStr}`;
  });

  const matchLines = matches.map((m) => {
    const h = teamMap.get(m.homeTeamId!);
    const a = teamMap.get(m.awayTeamId!);
    return `Match ${m.matchNumber} Grupp ${m.groupId}: ${h?.code ?? "?"} vs ${a?.code ?? "?"}`;
  });

  const prompt = `Du är en expert på fotbollsanalys och VM-tippning. Nedan finns statistik för 48 lag i VM 2026 (FIFA-ranking + senaste landslagsresultat) samt alla 72 gruppspelsmatcher.

Baserat på FIFA-ranking, senaste form, historik och fotbollskunskap – ge dina BÄSTA förutsägelser för alla 72 matcher.

LAG (FIFA-ranking, senaste 5 matcher):
${teamLines.join("\n")}

MATCHER:
${matchLines.join("\n")}

Svara med ett JSON-objekt och ENBART JSON (ingen annan text), i formatet:
{
  "predictions": [
    { "matchNumber": <number>, "home": <int 0-5>, "away": <int 0-5>, "outcome": "1" | "X" | "2", "confidence": "high" | "medium" | "low", "note": "<kort motivering på svenska, max 60 tecken>" }
  ]
}

Regler:
- Favoritlaget (lägre FIFA-rank) ska vinna lite oftare men skrällar ska förekomma
- Inkludera alla ${matches.length} matcher
- Använd realistisk målsättning (0-0 till 4-0, typiskt 0-2 mål per lag)
- Kortfattade noter på svenska`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Claude-anrop misslyckades: ${err}` }, { status: 502 });
  }

  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";

  // Extract JSON from response (Claude sometimes adds backticks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Kunde inte tolka svar från Claude" }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "JSON-parsning misslyckades" }, { status: 502 });
  }
}
