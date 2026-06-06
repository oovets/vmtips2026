// Tipsen låses vid första avsparken (default) eller vid tidpunkten i LOCK_AT.
// Sätt LOCK_AT långt fram i tiden för att testa i "öppet" läge.

export function lockAt(): Date {
  return new Date(process.env.LOCK_AT ?? "2026-06-11T18:00:00Z");
}

export function isLocked(now: Date = new Date()): boolean {
  return now.getTime() >= lockAt().getTime();
}
