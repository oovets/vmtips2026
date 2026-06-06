import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, 10);
}

export function verifyPin(pin: string, hash: string): boolean {
  return bcrypt.compareSync(pin, hash);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // utan lätt förväxlade tecken

function randomCode(len: number): string {
  let code = "";
  for (let i = 0; i < len; i++)
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

export async function uniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomCode(6);
    const exists = await prisma.league.findUnique({ where: { joinCode: code } });
    if (!exists) return code;
  }
  throw new Error("Kunde inte generera unik liga-kod");
}

export async function uniqueLoginCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomCode(8);
    const exists = await prisma.user.findUnique({ where: { loginCode: code } });
    if (!exists) return code;
  }
  throw new Error("Kunde inte generera unik login-kod");
}
