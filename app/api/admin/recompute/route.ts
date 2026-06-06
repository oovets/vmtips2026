import { NextResponse } from "next/server";
import { recomputeAllScores } from "@/lib/scoring-service";

export async function POST(req: Request) {
  if (req.headers.get("x-admin-pin") !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Fel admin-PIN" }, { status: 401 });
  }
  const scored = await recomputeAllScores();
  return NextResponse.json({ ok: true, playersScored: scored });
}
