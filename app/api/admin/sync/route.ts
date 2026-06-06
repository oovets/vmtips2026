import { NextResponse } from "next/server";
import { syncResults } from "@/lib/sync-service";
import { isAdminAuthed } from "@/lib/session";

export async function POST(req: Request) {
  if (!(await isAdminAuthed()) && req.headers.get("x-admin-pin") !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Ej behörig" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await syncResults()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
