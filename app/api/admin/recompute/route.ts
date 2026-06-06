import { NextResponse } from "next/server";
import { recomputeAllScores } from "@/lib/scoring-service";
import { adminGuard } from "@/lib/admin-guard";

export async function POST() {
  const deny = await adminGuard();
  if (deny) return deny;
  const scored = await recomputeAllScores();
  return NextResponse.json({ ok: true, playersScored: scored });
}
