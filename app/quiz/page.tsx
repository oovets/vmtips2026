import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { QuizHome } from "@/components/QuizHome";

export const dynamic = "force-dynamic";

export default async function QuizPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Quiz 🎯</h1>
        <p className="text-sm text-slate-400">
          Frågor från matcherna som spelats — möt kompisarna under tidspress.
        </p>
      </div>
      <QuizHome />
    </div>
  );
}
