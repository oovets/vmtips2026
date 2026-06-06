// Lättviktig session: signerad JWT i en httpOnly-cookie. Ingen e-post/lösenord —
// spelaren går med i en liga med namn + 4-siffrig PIN.

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";

const COOKIE = "vmtips_session";
const ADMIN_COOKIE = "vmtips_admin";
const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "dev-insecure-secret-change-me",
);

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function signToken(userId: string, allIds?: string[]): Promise<string> {
  return new SignJWT({ sub: userId, all: allIds ?? [userId] })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60d")
    .sign(secret);
}

export async function setSessionCookie(userId: string, allIds?: string[]) {
  const token = await signToken(userId, allIds ?? [userId]);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
}

export async function getAllSessionUserIds(): Promise<string[]> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return [];
  try {
    const { payload } = await jwtVerify(token, secret);
    const all = payload.all;
    if (Array.isArray(all)) return all as string[];
    if (typeof payload.sub === "string") return [payload.sub];
    return [];
  } catch {
    return [];
  }
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

export async function getCurrentUser() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = payload.sub;
    if (typeof userId !== "string") return null;
    return prisma.user.findUnique({
      where: { id: userId },
      include: { league: true },
    });
  } catch {
    return null;
  }
}

// --- Global admin (server-operatör): inloggning enbart med ADMIN_PIN, oberoende av ligor ---

// userId binds the admin cookie to the specific logged-in user.
// Prevents: Stefan enters PIN → Olle logs in same browser → Olle gets admin.
export async function setAdminCookie(userId: string) {
  const token = await new SignJWT({ role: "admin", userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
  cookies().set(ADMIN_COOKIE, token, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 });
}

export function clearAdminCookie() {
  cookies().delete(ADMIN_COOKIE);
}

export async function isAdminAuthed(): Promise<boolean> {
  const adminToken = cookies().get(ADMIN_COOKIE)?.value;
  if (!adminToken) return false;
  try {
    const { payload } = await jwtVerify(adminToken, secret);
    if (payload.role !== "admin" || typeof payload.userId !== "string") return false;
    // Verify the cookie belongs to the currently active session user
    const sessionToken = cookies().get(COOKIE)?.value;
    if (!sessionToken) return false;
    const { payload: sp } = await jwtVerify(sessionToken, secret);
    return sp.sub === payload.userId;
  } catch {
    return false;
  }
}
