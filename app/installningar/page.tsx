import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Settings } from "@/components/Settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Inställningar</h1>
        <p className="text-sm text-slate-400">{user.league.name}</p>
      </div>
      <Settings
        user={{
          id: user.id,
          displayName: user.displayName,
          leagueName: user.league.name,
          joinCode: user.league.joinCode,
          tippingMode: user.league.tippingMode as "EXACT" | "X12",
        }}
      />
    </div>
  );
}
