import { NextResponse } from "next/server";
import { syncResults } from "@/lib/sync-service";
import { adminGuard } from "@/lib/admin-guard";

export async function POST(req: Request) {
  const deny = await adminGuard();
  if (deny) return deny;
  try {
    return NextResponse.json({ ok: true, ...(await syncResults()) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
