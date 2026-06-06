import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { fetchTeamForm } from "@/lib/football-api";

export const maxDuration = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const deny = await adminGuard();
  if (deny) return deny;

  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) return NextResponse.json({ error: "FOOTBALL_DATA_API_KEY saknas" }, { status: 500 });

  // Hämta WC-laglistan för att få football-data.org team-IDs
  const teamsRes = await fetch("https://api.football-data.org/v4/competitions/WC/teams", {
    headers: { "X-Auth-Token": key },
    cache: "no-store",
  });
  if (!teamsRes.ok) {
    const status = teamsRes.status;
    const hint = status === 429
      ? "Rate limit (10 req/min) — vänta 60 sek och försök igen."
      : `HTTP ${status}`;
    return NextResponse.json({ error: `football-data.org: ${hint}` }, { status: 502 });
  }
  const { teams: apiTeams } = await teamsRes.json() as { teams: { id: number; name: string; tla: string }[] };

  const dbTeams = await prisma.team.findMany();
  const codeMap = Object.fromEntries(dbTeams.map((t) => [t.code, t.id]));

  let updated = 0;
  let rateLimited = false;

  for (const apiTeam of apiTeams) {
    const dbId = codeMap[apiTeam.tla];
    if (!dbId) continue;

    try {
      const form = await fetchTeamForm(apiTeam.id, 5);
      await prisma.team.update({
        where: { id: dbId },
        data: { recentForm: form as object[] },
      });
      updated++;
      // Free tier: 10 req/min — 6s delay keeps us safely under the cap
      await sleep(6200);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429")) {
        rateLimited = true;
        break;
      }
    }
  }

  return NextResponse.json({
    ok: !rateLimited,
    updated,
    warning: rateLimited ? `Stoppades av rate limit efter ${updated} lag. Vänta 60 sek, kör igen.` : undefined,
  });
}
