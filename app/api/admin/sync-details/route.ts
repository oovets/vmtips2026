import { NextResponse } from "next/server";
import { syncMatchDetails } from "@/lib/sync-service";
import { adminGuard } from "@/lib/admin-guard";

export async function POST(req: Request) {
  const deny = await adminGuard();
  if (deny) return deny;
  try {
    // Tillåt fler per körning manuellt än cron (admin vet vad hen gör).
    return NextResponse.json({ ok: true, ...(await syncMatchDetails({ limit: 30 })) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
