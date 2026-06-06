import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AuthForms } from "@/components/AuthForms";
import { lockAt, isLocked } from "@/lib/lock";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const locked = isLocked();
  const lock = lockAt();

  return (
    <div className="grid items-center gap-8 md:grid-cols-2 md:gap-10">
      <div className="order-2 space-y-5 md:order-1">
        <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
          Tippa VM med <span className="text-flag-500">vänner eller kollegor</span>.
        </h1>
        <p className="max-w-md text-slate-300">
          Samla gänget i en egen liga och tippa fotbolls-VM 2026 tillsammans — från
          första avspark i grupperna hela vägen till finalen. Den som läser spelet
          bäst toppar listan.
        </p>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Så funkar det
          </h2>
          <ol className="space-y-2 text-sm text-slate-300">
            <li>
              <strong className="text-slate-100">1. Skapa eller gå med i en liga.</strong>{" "}
              Skapa en liga och dela koden, eller gå med i kompisarnas med deras kod.
            </li>
            <li>
              <strong className="text-slate-100">2. Tippa gruppspelet.</strong>{" "}
              Sätt ditt resultat på alla 104 gruppmatcher.
            </li>
            <li>
              <strong className="text-slate-100">3. Bygg ditt slutspelsträd.</strong>{" "}
              Välj vilka som går vidare ur grupperna och spela ut slutspelet ända till
              världsmästaren.
            </li>
            <li>
              <strong className="text-slate-100">4. Följ poängen live.</strong>{" "}
              Resultaten uppdateras under turneringen och topplistan räknas om automatiskt.
            </li>
          </ol>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Så får du poäng
          </h2>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>Rätt utgång (1, X eller 2) ger poäng — exakt resultat ger mer.</li>
            <li>Extra poäng för rätt lag vidare ur gruppspelet.</li>
            <li>Slutspelet väger tyngst — desto längre ditt tippade lag når, desto mer.</li>
          </ul>
        </div>

        <p className="text-sm text-slate-400">48 lag · 12 grupper · 104 matcher.</p>

        <p className="text-sm text-slate-400">
          {locked ? (
            <span className="text-amber-300">Tipsen är låsta — turneringen har börjat.</span>
          ) : (
            <>Tipsen låses{" "}
              <strong>
                {lock.toLocaleString("sv-SE", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Europe/Stockholm",
                })}
              </strong>{" "}
              (första avspark).
            </>
          )}
        </p>
      </div>

      <div className="order-1 scroll-mt-24 md:order-2">
        <AuthForms />
      </div>
    </div>
  );
}
