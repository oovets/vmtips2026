// Lättviktig session: signerad JWT i en httpOnly-cookie. Ingen e-post/lösenord —
// spelaren går med i en liga med namn + 4-siffrig PIN.

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";

const COOKIE = "vmtips_session";
const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "dev-insecure-secret-change-me",
);

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
