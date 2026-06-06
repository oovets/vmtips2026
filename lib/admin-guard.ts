import { NextResponse } from "next/server";
import { isAdminAuthed } from "./session";

// Enbart global admin-PIN ger åtkomst — ingen user.isAdmin.
export async function adminGuard(): Promise<NextResponse | null> {
  if (await isAdminAuthed()) return null;
  return NextResponse.json({ error: "Ej behörig" }, { status: 401 });
}
