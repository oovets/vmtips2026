import { NextResponse } from "next/server";
import { recomputeAllScores } from "@/lib/scoring-service";
import { isAdminAuthed } from "@/lib/session";

export async function POST(req: Request) {
  if (!(await isAdminAuthed()) && req.headers.get("x-admin-pin") !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Ej behörig" }, { status: 401 });
  }
  const scored = await recomputeAllScores();
  return NextResponse.json({ ok: true, playersScored: scored });
}
