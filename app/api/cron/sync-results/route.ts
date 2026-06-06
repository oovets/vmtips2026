// Pollas av Vercel Cron. Skydd: header "x-cron-secret", ?secret= eller Bearer = CRON_SECRET.

import { NextResponse } from "next/server";
import { syncResults, syncMatchDetails } from "@/lib/sync-service";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  return (
    req.headers.get("x-cron-secret") === secret ||
    url.searchParams.get("secret") === secret ||
    req.headers.get("authorization") === `Bearer ${secret}`
  );
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Obehörig" }, { status: 401 });
  try {
    const result = await syncResults();
    // Best-effort: hämta matchdetaljer (målgörare/kort/straffar). Får aldrig fälla synken.
    let detailsUpdated = 0;
    try {
      ({ detailsUpdated } = await syncMatchDetails());
    } catch {
      /* ignorera – detaljer är icke-kritiska och backfillas nästa körning */
    }
    return NextResponse.json({ ok: true, ...result, detailsUpdated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const POST = GET;
