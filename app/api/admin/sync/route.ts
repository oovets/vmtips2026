import { NextResponse } from "next/server";
import { syncResults } from "@/lib/sync-service";

export async function POST(req: Request) {
  if (req.headers.get("x-admin-pin") !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Fel admin-PIN" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await syncResults()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
