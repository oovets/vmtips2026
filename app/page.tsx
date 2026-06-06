import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AuthForms } from "@/components/AuthForms";
import { lockAt, isLocked } from "@/lib/lock";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/mitt-lag");

  const locked = isLocked();
  const lock = lockAt();

  return (
    <div className="grid items-center gap-8 md:grid-cols-2 md:gap-10">
      <div className="order-2 space-y-5 md:order-1">
        <div className="chip w-fit">🏆 Fotbolls-VM 2026 · USA · Kanada · Mexiko</div>
        <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
          Tippa hela VM-et med <span className="text-pitch-500">kompisarna</span>.
        </h1>
        <p className="max-w-md text-slate-300">
          Tippa alla gruppmatcher, vilka som går vidare ur grupperna och bygg ditt
          eget slutspelsträd hela vägen till världsmästaren. Följ poängen live under
          turneringen.
        </p>
        <ul className="space-y-2 text-sm text-slate-300">
          <li>⚽ 48 lag · 12 grupper · 104 matcher</li>
          <li>📊 Live-uppdaterad topplista i din liga</li>
          <li>🧠 Smart poäng: exakt resultat, vidare ur grupp, slutspel</li>
        </ul>
        <p className="text-sm text-slate-400">
          {locked ? (
            <span className="text-amber-300">⏱️ Tipsen är låsta — turneringen har börjat.</span>
          ) : (
            <>⏱️ Tipsen låses{" "}
              <strong>
                {lock.toLocaleString("sv-SE", { dateStyle: "medium", timeStyle: "short" })}
              </strong>{" "}
              (första avspark).
            </>
          )}
        </p>
      </div>

      <div className="order-1 md:order-2">
        <AuthForms />
      </div>
    </div>
  );
}
