import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AuthForms } from "@/components/AuthForms";

export default async function JoinPage({ params }: { params: { code: string } }) {
  const user = await getCurrentUser();
  if (user) redirect("/mitt-lag");

  const code = params.code.toUpperCase();
  const league = await prisma.league.findUnique({ where: { joinCode: code } });

  if (!league) {
    return (
      <div className="mx-auto max-w-sm py-16 text-center space-y-3">
        <p className="text-4xl">🤔</p>
        <h1 className="text-xl font-bold">Ligan hittades inte</h1>
        <a href="/" className="btn-primary inline-flex mt-2">Till startsidan</a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-5 py-8">
      <div className="text-center space-y-1">
        <p className="text-3xl">🇸🇪</p>
        <h1 className="text-2xl font-extrabold">Du är inbjuden!</h1>
      </div>
      <AuthForms defaultTab="join" prefillCode={code} />
    </div>
  );
}
