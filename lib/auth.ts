import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, 10);
}

export function verifyPin(pin: string, hash: string): boolean {
  return bcrypt.compareSync(pin, hash);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // utan lätt förväxlade tecken

export async function uniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++)
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    const exists = await prisma.league.findUnique({ where: { joinCode: code } });
    if (!exists) return code;
  }
  throw new Error("Kunde inte generera unik liga-kod");
}
