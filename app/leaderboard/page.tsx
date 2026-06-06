import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Leaderboard } from "@/components/Leaderboard";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Topplista</h1>
        <p className="text-sm text-slate-400">{user.league.name} · uppdateras automatiskt</p>
      </div>
      <Leaderboard />
    </div>
  );
}
