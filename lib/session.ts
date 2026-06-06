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

export async function signToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60d")
    .sign(secret);
}

export async function setSessionCookie(userId: string) {
  const token = await signToken(userId);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
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

export async function setAdminCookie() {
  const token = await new SignJWT({ role: "admin" })
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
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.role === "admin";
  } catch {
    return false;
  }
}
