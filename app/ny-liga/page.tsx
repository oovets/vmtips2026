import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AddLeagueForm } from "@/components/AddLeagueForm";

export const dynamic = "force-dynamic";

export default async function NyLigaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Ny liga</h1>
        <p className="text-sm text-slate-400">Gå med i en befintlig liga eller skapa en ny.</p>
      </div>
      <AddLeagueForm currentName={user.displayName} />
    </div>
  );
}
