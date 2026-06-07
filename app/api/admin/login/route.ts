import { NextResponse } from "next/server";
import { z } from "zod";
import { setAdminCookie, getCurrentUser } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const schema = z.object({ pin: z.string().min(1) });

export async function POST(req: Request) {
  // Admin-PIN ger full kontroll — strypa brute force ännu hårdare än spelarlogin.
  if (!rateLimit(`admin-login:${clientIp(req)}`, 5, 60_000)) {
    return NextResponse.json({ error: "För många försök — vänta en minut och försök igen." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ange admin-PIN" }, { status: 400 });
  }
  if (!process.env.ADMIN_PIN || parsed.data.pin !== process.env.ADMIN_PIN) {
    return NextResponse.json({ error: "Fel admin-PIN" }, { status: 401 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Logga in som spelare innan du loggar in som admin" }, { status: 401 });
  }
  await setAdminCookie(user.id);
  return NextResponse.json({ ok: true });
}
