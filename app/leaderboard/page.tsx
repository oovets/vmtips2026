import { getCurrentUser } from "@/lib/session";
import { Leaderboard } from "@/components/Leaderboard";
import { PageHeading } from "@/components/PageHeading";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-5">
      <PageHeading
        title="Topplista"
      >
        <Leaderboard />
      </PageHeading>
    </div>
  );
}
