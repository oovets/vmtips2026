import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Settings } from "@/components/Settings";
import { PageHeading } from "@/components/PageHeading";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  return (
    <div className="space-y-6">
      <PageHeading title="Inställningar">
        <div className="mx-auto max-w-lg">
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
      </PageHeading>
    </div>
  );
}
