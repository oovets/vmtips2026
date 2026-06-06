import { NextResponse } from "next/server";
import { z } from "zod";
import { setAdminCookie } from "@/lib/session";

const schema = z.object({ pin: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ange admin-PIN" }, { status: 400 });
  }
  if (!process.env.ADMIN_PIN || parsed.data.pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Fel admin-PIN" }, { status: 401 });
  }
  await setAdminCookie();
  return NextResponse.json({ ok: true });
}
